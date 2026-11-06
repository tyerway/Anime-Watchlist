// Menarik daftar anime dari database Notion dan menulis data.js.
// Dijalankan oleh GitHub Actions: node scripts/sync-notion.mjs
// Butuh variabel lingkungan NOTION_TOKEN dan NOTION_DATABASE_ID.

import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const NOTION_VERSION = '2022-06-28';

const STATUS_MAP = {
  'Rencana': 'rencana',
  'Sedang Ditonton': 'ditonton',
  'Ditunda': 'ditunda',
  'Selesai': 'selesai',
  'Dihentikan': 'dihentikan',
};

const plain = (arr = []) => arr.map((t) => t.plain_text).join('').trim();

const slug = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'anime';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Ubah satu halaman Notion menjadi entri anime. Mengembalikan null jika tidak punya judul. */
export function mapPage(page, usedIds = new Set()) {
  if (page.archived || page.in_trash) return null;
  const p = page.properties || {};
  const judul = plain(p['Judul']?.title);
  if (!judul) return null;

  let id = slug(judul);
  for (let n = 2; usedIds.has(id); n++) id = `${slug(judul)}-${n}`;
  usedIds.add(id);

  const coverType = page.cover?.type;
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
    // Hanya cover berupa link (external). File yang diunggah ke Notion alamatnya kedaluwarsa dalam 1 jam.
    cover: coverType === 'external' ? page.cover.external.url : null,
    _coverSkipped: coverType === 'file',
  };
}

export function buildItems(pages) {
  const used = new Set();
  return pages.map((pg) => mapPage(pg, used)).filter(Boolean);
}

export function renderDataJs(items, now = new Date()) {
  const clean = items.map(({ _coverSkipped, ...rest }) => rest);
  const meta = { sumber: 'notion', diperbarui: now.toISOString() };
  return [
    '// Dibuat otomatis dari Notion oleh scripts/sync-notion.mjs. Jangan diedit; ubah data di Notion.',
    `window.ANIME_META = ${JSON.stringify(meta)};`,
    `window.ANIME = ${JSON.stringify(clean, null, 2)};`,
    '',
  ].join('\n');
}

async function fetchAllPages(token, databaseId) {
  const pages = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: 100,
        // Yang pertama ditambahkan jadi yang pertama di antrean.
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      let hint = '';
      if (res.status === 401) hint = ' Token tidak valid atau salah salin.';
      if (res.status === 404) hint = ' Database tidak ditemukan. Pastikan integrasi sudah ditambahkan lewat menu Connections di database.';
      throw new Error(`Notion API membalas ${res.status}.${hint} ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    pages.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = (process.env.NOTION_DATABASE_ID || '').trim();
  if (!token || !databaseId) {
    console.error('NOTION_TOKEN dan NOTION_DATABASE_ID harus diisi (Settings > Secrets and variables > Actions).');
    process.exit(1);
  }

  const pages = await fetchAllPages(token, databaseId);
  const items = buildItems(pages);
  const skipped = items.filter((i) => i._coverSkipped).length;

  await writeFile('data.js', renderDataJs(items), 'utf8');
  console.log(`Berhasil: ${items.length} anime ditulis ke data.js.`);
  if (skipped) {
    console.log(`Catatan: ${skipped} anime memakai cover hasil unggahan Notion dan dilewati. Pakai Add cover > Link agar cover tampil.`);
  }
  if (!items.length) console.log('Peringatan: database kosong, situs akan menampilkan daftar kosong.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
