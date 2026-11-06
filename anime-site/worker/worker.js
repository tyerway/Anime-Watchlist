// Penghubung antara situs watchlist dan database Notion. Dipasang di Cloudflare Workers.
//
// Endpoint:
//   GET  /api/anime  -> daftar anime dari Notion (terbuka, sama dengan isi situs publik)
//   POST /api/anime  -> menambah anime ke Notion (wajib header X-Admin-Password)
//
// Pengaturan (Workers > Settings > Variables and Secrets):
//   NOTION_TOKEN        (Secret)   token integrasi Notion
//   ADMIN_PASSWORD      (Secret)   kata sandi untuk menambah anime
//   NOTION_DATABASE_ID  (Text)     ID database Anime Watchlist
//   ALLOWED_ORIGIN      (Text, opsional) alamat situsmu, mis. https://nama.github.io

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_BODY = 20000;

const STATUS_MAP = {
  'Rencana': 'rencana',
  'Sedang Ditonton': 'ditonton',
  'Ditunda': 'ditunda',
  'Selesai': 'selesai',
  'Dihentikan': 'dihentikan',
};
const STATUS_NAME = Object.fromEntries(Object.entries(STATUS_MAP).map(([nama, kode]) => [kode, nama]));

// ---------- Pemetaan halaman Notion ke entri anime (sama dengan scripts/sync-notion.mjs) ----------
const plain = (arr = []) => arr.map((t) => t.plain_text).join('').trim();
const slug = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'anime';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function mapPage(page, usedIds) {
  if (page.archived || page.in_trash) return null;
  const p = page.properties || {};
  const judul = plain(p['Judul']?.title);
  if (!judul) return null;

  let id = slug(judul);
  for (let n = 2; usedIds.has(id); n++) id = `${slug(judul)}-${n}`;
  usedIds.add(id);

  return {
    id,
    judul,
    status: STATUS_MAP[p['Status']?.status?.name] ?? 'rencana',
    ep: num(p['Episode Ditonton']?.number) ?? 0,
    total: num(p['Total Episode']?.number),
    rating: num(p['Rating']?.number),
    genre: (p['Genre']?.multi_select ?? []).map((g) => g.name),
    studio: p['Studio']?.select?.name ?? null,
    tipe: p['Tipe']?.select?.name ?? null,
    sinopsis: plain(p['Sinopsis']?.rich_text) || null,
    mal: p['Tautan MAL']?.url ?? null,
    cover: page.cover?.type === 'external' ? page.cover.external.url : null,
  };
}

// ---------- Utilitas ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').trim().replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function reply(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(request, env) },
  });
}

async function notion(env, path, body) {
  const res = await fetch(NOTION + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('Notion membalas', res.status, (await res.text()).slice(0, 300));
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new HttpError(502, 'Notion menolak permintaan. Periksa token dan pastikan integrasi sudah terhubung ke database.');
    }
    if (res.status === 429) throw new HttpError(503, 'Notion sedang membatasi permintaan. Coba lagi sebentar.');
    throw new HttpError(502, 'Notion tidak bisa memproses permintaan ini.');
  }
  return res.json();
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Perbandingan kata sandi yang tidak bocor lewat waktu.
async function samePassword(given, expected) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Validasi isian tambah anime ----------
function readInput(body) {
  const errors = [];
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const label = (v, max) => text(v, max).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  const judul = text(body.judul, 300);
  if (!judul) errors.push('Judul wajib diisi.');

  let total = null;
  if (body.total !== undefined && body.total !== null && body.total !== '') {
    const n = Number(body.total);
    if (!Number.isInteger(n) || n < 0 || n > 9999) errors.push('Total episode harus bilangan bulat 0 sampai 9999.');
    else total = n;
  }

  const status = body.status === undefined ? 'rencana' : body.status;
  if (!STATUS_NAME[status]) errors.push('Status tidak valid.');

  const genre = Array.isArray(body.genre)
    ? [...new Set(body.genre.map((g) => label(g, 50)).filter(Boolean))].slice(0, 8)
    : [];

  const mal = body.mal ? text(body.mal, 200) : null;
  if (mal && !/^https:\/\/myanimelist\.net\/anime\/\d+/.test(mal)) errors.push('Tautan MyAnimeList tidak valid.');

  const cover = body.cover ? text(body.cover, 1000) : null;
  if (cover && !/^https:\/\/[^\s]+$/.test(cover)) errors.push('Alamat poster harus diawali https://.');

  return {
    errors,
    value: {
      judul, total, status, genre, mal, cover,
      studio: label(body.studio, 100) || null,
      tipe: label(body.tipe, 30) || null,
      sinopsis: text(body.sinopsis, 2000) || null,
    },
  };
}

function buildPage(v, databaseId) {
  const properties = {
    'Judul': { title: [{ text: { content: v.judul } }] },
    'Status': { status: { name: STATUS_NAME[v.status] } },
    'Episode Ditonton': { number: 0 },
  };
  if (v.total != null) properties['Total Episode'] = { number: v.total };
  if (v.genre.length) properties['Genre'] = { multi_select: v.genre.map((name) => ({ name })) };
  if (v.studio) properties['Studio'] = { select: { name: v.studio } };
  if (v.tipe) properties['Tipe'] = { select: { name: v.tipe } };
  if (v.sinopsis) properties['Sinopsis'] = { rich_text: [{ text: { content: v.sinopsis } }] };
  if (v.mal) properties['Tautan MAL'] = { url: v.mal };

  return {
    parent: { database_id: databaseId },
    properties,
    ...(v.cover ? { cover: { type: 'external', external: { url: v.cover } } } : {}),
  };
}

// ---------- Penangan ----------
async function listAnime(request, env) {
  const pages = [];
  let cursor;
  for (let i = 0; i < 10; i++) {
    const json = await notion(env, `/databases/${env.NOTION_DATABASE_ID}/query`, {
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...json.results);
    if (!json.has_more) break;
    cursor = json.next_cursor;
  }
  const used = new Set();
  const items = pages.map((pg) => mapPage(pg, used)).filter(Boolean);
  return reply({ items, diperbarui: new Date().toISOString() }, 200, request, env);
}

async function addAnime(request, env) {
  if (!env.ADMIN_PASSWORD) {
    throw new HttpError(500, 'Kata sandi admin belum diatur di penghubung (ADMIN_PASSWORD).');
  }
  const given = request.headers.get('X-Admin-Password') || '';
  if (!(await samePassword(given, env.ADMIN_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 400)); // memperlambat tebak-tebakan
    throw new HttpError(401, 'Kata sandi salah.');
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'Data terlalu besar.');
  let body;
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Data tidak berbentuk JSON.'); }
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Data tidak valid.');

  const { errors, value } = readInput(body);
  if (errors.length) throw new HttpError(400, errors.join(' '));

  if (value.mal) {
    const dup = await notion(env, `/databases/${env.NOTION_DATABASE_ID}/query`, {
      page_size: 1,
      filter: { property: 'Tautan MAL', url: { equals: value.mal } },
    });
    if (dup.results.length) throw new HttpError(409, 'Anime ini sudah ada di daftar.');
  }

  const created = await notion(env, '/pages', buildPage(value, env.NOTION_DATABASE_ID));
  const item = mapPage(created, new Set());
  return reply({ item }, 201, request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      }
      if (url.pathname === '/' && request.method === 'GET') {
        return reply({ ok: true, layanan: 'penghubung watchlist anime' }, 200, request, env);
      }
      if (url.pathname === '/api/anime') {
        if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
          throw new HttpError(500, 'Penghubung belum lengkap: NOTION_TOKEN atau NOTION_DATABASE_ID belum diatur.');
        }
        if (request.method === 'GET') return await listAnime(request, env);
        if (request.method === 'POST') return await addAnime(request, env);
        throw new HttpError(405, 'Metode tidak didukung.');
      }
      throw new HttpError(404, 'Tidak ditemukan.');
    } catch (err) {
      if (err instanceof HttpError) return reply({ error: err.message }, err.status, request, env);
      console.error('Kesalahan tak terduga:', err && err.message);
      return reply({ error: 'Terjadi kesalahan di penghubung.' }, 500, request, env);
    }
  },
};
