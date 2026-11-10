// Mengisi kolom "Rilis Berikutnya" dan "Info Rilis" di Notion untuk ANIME, memakai AniList.
// Dijalankan oleh GitHub Actions (AniList memblokir alamat server Cloudflare, tetapi tidak server GitHub):
//   node scripts/rilis-anime.mjs
// Butuh NOTION_TOKEN dan NOTION_DATABASE_ID. Waktu ditulis dalam WIB (UTC+7).

import { pathToFileURL } from 'node:url';

const NOTION = 'https://api.notion.com/v1';
const WIB_MS = 7 * 3600 * 1000;
const plain = (arr = []) => arr.map((t) => t.plain_text).join('').trim();
const wibIso = (detik) => new Date(detik * 1000 + WIB_MS).toISOString().slice(0, 19) + '+07:00';
const malIdDari = (url) => Number((String(url || '').match(/myanimelist\.net\/anime\/(\d+)/) || [])[1]) || null;

export function hitungRilis(m) {
  if (m?.nextAiringEpisode?.airingAt) {
    return { start: wibIso(m.nextAiringEpisode.airingAt), info: `Episode ${m.nextAiringEpisode.episode} tayang` };
  }
  const d = m?.startDate;
  if (m?.status === 'NOT_YET_RELEASED' && d?.year && d?.month && d?.day) {
    return { start: `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`, info: 'Rilis perdana' };
  }
  return null;
}

export function sama(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const tx = a.start.length > 10 ? new Date(a.start).getTime() : a.start;
  const ty = b.start.length > 10 ? new Date(b.start).getTime() : b.start;
  return tx === ty && (a.info || '') === (b.info || '');
}

async function notion(path, token, body, method = 'POST') {
  const res = await fetch(NOTION + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Notion membalas kode ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function anilist(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'watchlist-rilis-anime/1.0' },
      body: JSON.stringify({
        query: `query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) {
          idMal status nextAiringEpisode { airingAt episode } startDate { year month day } } } }`,
        variables: { ids: ids.slice(i, i + 50) },
      }),
    });
    if (!res.ok) throw new Error(`AniList membalas kode ${res.status}: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 160)}`);
    for (const m of (await res.json())?.data?.Page?.media || []) out.set(m.idMal, hitungRilis(m));
  }
  return out;
}

export async function jalankan(env = process.env) {
  const { NOTION_TOKEN: token, NOTION_DATABASE_ID: db } = env;
  if (!token || !db) throw new Error('NOTION_TOKEN dan NOTION_DATABASE_ID harus diisi.');
  const pages = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const j = await notion(`/databases/${db}/query`, token, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    pages.push(...j.results);
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }

  const aktif = [], bersihkan = [];
  for (const pg of pages) {
    if (pg.archived || pg.in_trash) continue;
    const p = pg.properties || {};
    const jenis = p['Jenis']?.select?.name || 'Anime';
    if (jenis !== 'Anime') continue;
    const status = p['Status']?.status?.name;
    const sekarang = p['Rilis Berikutnya']?.date?.start ? { start: p['Rilis Berikutnya'].date.start, info: plain(p['Info Rilis']?.rich_text) } : null;
    const item = { id: pg.id, judul: plain(p['Judul']?.title), malId: malIdDari(p['Tautan MAL']?.url), sekarang };
    if (status === 'Sedang Ditonton' || status === 'Rencana') { if (item.malId) aktif.push(item); }
    else if (sekarang) bersihkan.push(item);
  }

  const peta = aktif.length ? await anilist([...new Set(aktif.map((x) => x.malId))]) : new Map();
  const hasil = { diperiksa: aktif.length, diubah: 0, galat: [] };
  const daftar = [...aktif.map((x) => [x, peta.get(x.malId) ?? null]), ...bersihkan.map((x) => [x, null])];
  for (const [x, baru] of daftar) {
    if (sama(x.sekarang, baru)) continue;
    try {
      await notion(`/pages/${x.id}`, token, {
        properties: {
          'Rilis Berikutnya': { date: baru ? { start: baru.start } : null },
          'Info Rilis': { rich_text: baru ? [{ type: 'text', text: { content: baru.info.slice(0, 200) } }] : [] },
        },
      }, 'PATCH');
      hasil.diubah++;
      console.log(`${x.judul}: ${baru ? `${baru.start} (${baru.info})` : 'jadwal dihapus'}`);
    } catch (err) { hasil.galat.push(`${x.judul}: ${err.message}`); }
  }
  return hasil;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  jalankan().then((h) => {
    console.log(JSON.stringify(h));
    if (h.galat.length) { console.error(h.galat.join('\n')); process.exit(1); }
  }, (e) => { console.error(e.message); process.exit(1); });
}
