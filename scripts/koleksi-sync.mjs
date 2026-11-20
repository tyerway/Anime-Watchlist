// Sinkron "List Game.xlsx" (OneDrive) -> database Notion "Koleksi Game".
// Dijalankan GitHub Actions (atau manual):  node scripts/koleksi-sync.mjs [berkas.xlsx]
//
// Env:
//   NOTION_TOKEN, KOLEKSI_DATABASE_ID   wajib
//   LIST_GAME_URL    link berbagi OneDrive ("siapa saja dengan link"); atau beri berkas lokal sebagai argumen
//   SHEET_NAME       nama sheet (bawaan "List Game")
//   MAKS_DATA_BARU   maksimal judul yang dicari datanya per eksekusi (bawaan 250)
//   ULANG_TIDAK_KETEMU=1  cari ulang judul yang sebelumnya "Tidak ketemu"
//
// Aturan: judul baru ditambahkan lalu diperkaya dari Steam (cadangan Wikipedia). Judul yang sudah ada hanya
// diperbarui kolom Lokasi, Edisi, Berkas, dan "Ada di Excel". Deskripsi, cover, dan kolom lain tidak ditimpa
// kalau "Dikunci" dicentang atau Sumber = Manual. Tidak ada baris yang dihapus: judul yang hilang dari Excel
// hanya dicentang "Ada di Excel" = tidak.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { bacaDaftar, kelompokkan, normal } from './koleksi-judul.mjs';

const NOTION = 'https://api.notion.com/v1';
const UA = 'watchlist-koleksi-sync/1.0 (https://github.com/tyerway/Anime-Watchlist)';
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (arr = []) => arr.map((t) => t.plain_text).join('').trim();
const potong = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1).trimEnd() + '…' : String(s || ''));
const teks = (s) => ({ rich_text: s ? [{ type: 'text', text: { content: potong(s, 2000) } }] : [] });

// ---------- Kemiripan judul ----------
function bigram(s) {
  const t = ` ${s} `, out = new Map();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); }
  return out;
}
export function mirip(a, b) {
  const x = normal(a), y = normal(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigram(x), B = bigram(y);
  let irisan = 0, nA = 0, nB = 0;
  for (const v of A.values()) nA += v;
  for (const v of B.values()) nB += v;
  for (const [g, v] of A) irisan += Math.min(v, B.get(g) || 0);
  return (2 * irisan) / (nA + nB);
}
// Angka dan seri harus sama: "Alan Wake 2" tidak boleh cocok dengan "Alan Wake".
const angka = (s) => (normal(s).replace(/\b(19|20)\d\d\b/g, ' ').match(/\b(\d+|ii|iii|iv|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi)\b/g) || []).join(' ');
export const cocok = (cari, kandidat, batas = 0.8) => mirip(cari, kandidat) >= batas && angka(cari) === angka(kandidat);

// ---------- Steam ----------
async function jsonDari(url, headers = {}) {
  for (let coba = 0; coba < 3; coba++) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA, ...headers } });
    if (res.status === 429 || res.status >= 500) { await tidur(3000 * (coba + 1)); continue; }
    if (!res.ok) throw new Error(`${new URL(url).host} membalas kode ${res.status}`);
    return res.json();
  }
  throw new Error(`${new URL(url).host} terus membatasi permintaan`);
}
const dekode = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Teks syarat sistem dari HTML Steam ("<strong>OS:</strong> Windows 10<br>...") menjadi baris biasa.
export function syaratTeks(html) {
  const t = String(html || '').replace(/<br\s*\/?>|<\/li>|<\/p>|<\/ul>/gi, '\n').replace(/<li[^>]*>/gi, '');
  return dekode(t.replace(/\n/g, '¶')).split('¶').map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/^(minimum|recommended|disarankan)\s*:?$/i.test(x)).join('\n').slice(0, 1900);
}
const tanpaT = (u) => String(u || '').split('?')[0];

// Cover potret (600x900) hanya ada untuk sebagian game; sisanya memakai gambar lanskap dari Steam.
async function potretAda(id) {
  try {
    const res = await fetch(`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`, { method: 'HEAD', headers: { 'User-Agent': UA } });
    return res.ok;
  } catch { return false; }
}

export async function dataSteam(id) {
  const j = await jsonDari(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=english`);
  const d = j?.[id]?.success ? j[id].data : null;
  if (!d) return null;
  const tahun = Number((String(d.release_date?.date || '').match(/\b(19|20)\d{2}\b/) || [])[0]) || null;
  const banner = tanpaT(d.header_image) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
  const potret = `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
  const pendek = dekode(d.short_description || '');
  const panjang = dekode(d.about_the_game || '');
  const req = (x) => (x && !Array.isArray(x) ? x : {});
  return {
    sumber: 'Steam', steamId: Number(id), judul: d.name,
    deskripsi: pendek || panjang,
    tentang: panjang && panjang !== pendek ? potong(panjang, 1900) : '',
    cover: (await potretAda(id)) ? potret : banner,
    banner,
    tautan: `https://store.steampowered.com/app/${id}`,
    developer: (d.developers || []).join(', '),
    publisher: (d.publishers || []).join(', '),
    rilis: d.release_date?.coming_soon ? 'Segera rilis' : String(d.release_date?.date || ''),
    genre: (d.genres || []).map((g) => g.description).filter(Boolean).slice(0, 5),
    screenshots: (d.screenshots || []).slice(0, 5).map((x) => tanpaT(x.path_full)).filter(Boolean),
    spekMin: syaratTeks(req(d.pc_requirements).minimum),
    spekRek: syaratTeks(req(d.pc_requirements).recommended),
    tahun,
  };
}

// Varian pencarian: judul penuh, lalu tanpa 1-4 kata di ujung (sisa nama grup/edisi). Varian yang dipangkas
// harus sama persis (setelah dinormalkan) dengan nama di Steam, supaya "Grand Theft Auto" tidak jadi "Grand Theft Auto V".
export function varianCari(judul) {
  const kata = String(judul).replace(/[™®©℠]/g, '').split(/\s+/).filter(Boolean);
  const out = [{ q: kata.join(' '), persis: false }];
  for (let k = 1; k <= 4 && kata.length - k >= 2; k++) out.push({ q: kata.slice(0, kata.length - k).join(' '), persis: true });
  return out;
}
export async function cariSteam(judul) {
  for (const [i, v] of varianCari(judul).entries()) {
    if (i) await tidur(600);
    const j = await jsonDari(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(v.q)}&cc=us&l=english`);
    const hasil = (j.items || []).filter((x) => x.type === 'app' || !x.type);
    let terbaik = null, skor = 0;
    for (const x of hasil) {
      if (v.persis ? normal(x.name) !== normal(v.q) : !cocok(v.q, x.name)) continue;
      const s = mirip(v.q, x.name);
      if (s > skor) { skor = s; terbaik = x; }
    }
    if (terbaik) { await tidur(900); return dataSteam(terbaik.id); }
  }
  return null;
}

// ---------- Wikipedia (cadangan, tanpa kunci) ----------
export async function cariWikipedia(judul) {
  const u = new URL('https://en.wikipedia.org/w/api.php');
  for (const [k, v] of Object.entries({
    action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${judul} video game`, gsrlimit: '5',
    prop: 'pageimages|extracts', piprop: 'thumbnail', pilicense: 'any', pithumbsize: '500', exintro: '1', explaintext: '1', exsentences: '3', exlimit: 'max',
  })) u.searchParams.set(k, v);
  const j = await jsonDari(u.toString());
  const hal = (j.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const p of hal) {
    const t = p.title.replace(/\s*\([^)]*\)$/, '');
    if (!cocok(judul, t) || !/\bgame\b/i.test(p.extract || '')) continue;
    return {
      sumber: 'Wikipedia', steamId: null, judul: t,
      deskripsi: dekode(p.extract),
      cover: p.thumbnail?.source ? p.thumbnail.source.split('?')[0] : null,
      tautan: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')).replace(/%28/g, '(').replace(/%29/g, ')'),
      developer: '', genre: [], banner: null, screenshots: [], spekMin: '', spekRek: '', publisher: '', rilis: '', tentang: '',
      tahun: Number((String(p.extract).match(/\b(19[89]\d|20[0-4]\d)\b/) || [])[0]) || null,
    };
  }
  return null;
}

export async function perkaya(judul, deps = {}) {
  const steam = deps.cariSteam || cariSteam, wiki = deps.cariWikipedia || cariWikipedia;
  try { const r = await steam(judul); if (r) return r; } catch (e) { console.warn(`Steam gagal untuk "${judul}": ${e.message}`); }
  try { const r = await wiki(judul); if (r) return r; } catch (e) { console.warn(`Wikipedia gagal untuk "${judul}": ${e.message}`); }
  return null;
}

// ---------- Notion ----------
async function notion(path, token, body, method = 'POST') {
  for (let coba = 0; coba < 4; coba++) {
    const res = await fetch(NOTION + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429 || res.status >= 500) { await tidur(1500 * (coba + 1)); continue; }
    if (!res.ok) throw new Error(`Notion membalas kode ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error('Notion tidak merespons setelah beberapa percobaan');
}

export function bacaHalaman(pg) {
  const p = pg.properties || {};
  return {
    id: pg.id,
    judul: plain(p['Judul']?.title),
    berkas: plain(p['Berkas']?.rich_text).split('\n').map((x) => x.trim()).filter(Boolean),
    lokasi: (p['Lokasi']?.multi_select || []).map((o) => o.name).sort(),
    edisi: plain(p['Edisi']?.rich_text),
    adaDiExcel: !!p['Ada di Excel']?.checkbox,
    dikunci: !!p['Dikunci']?.checkbox,
    sumber: p['Sumber']?.select?.name || '',
    steamId: p['Steam ID']?.number ?? null,
    cover: p['Cover']?.url || '',
    banner: p['Banner']?.url || '',
  };
}

export function propsData(d) {
  return {
    ...(d.judul ? { Judul: { title: [{ type: 'text', text: { content: potong(d.judul, 200) } }] } } : {}),
    Deskripsi: teks(d.deskripsi), Developer: teks(potong(d.developer, 300)),
    Genre: { multi_select: (d.genre || []).map((n) => ({ name: n.replace(/,/g, ' ').slice(0, 100) })) },
    Tahun: { number: d.tahun || null }, Cover: { url: d.cover || null }, Tautan: { url: d.tautan || null },
    'Steam ID': { number: d.steamId || null }, Sumber: { select: { name: d.sumber } },
    Banner: { url: d.banner || null }, Publisher: teks(potong(d.publisher, 300)), Rilis: teks(potong(d.rilis, 100)),
    Tentang: teks(d.tentang), Screenshot: teks((d.screenshots || []).join('\n')),
    'Spek Minimum': teks(d.spekMin), 'Spek Disarankan': teks(d.spekRek),
  };
}

async function semuaHalaman(token, db) {
  const out = [];
  let cursor;
  do {
    const j = await notion(`/databases/${db}/query`, token, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...j.results.filter((p) => !p.archived && !p.in_trash));
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}

// ---------- Unduh dari OneDrive ----------
const b64url = (s) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
// Ikuti pengalihan link berbagi OneDrive baru (1drv.ms/x/c/... -> onedrive.live.com/:x:/g/personal/...?redeem=...)
// dan kumpulkan alamat unduhan yang mungkin. Parameter download=1 hilang saat pengalihan, jadi ditambahkan lagi di ujung.
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
async function calonUnduhanLangsung(link, fetchFn) {
  const calon = [];
  let u = link;
  for (let i = 0; i < 6; i++) {
    const res = await fetchFn(u, { redirect: 'manual', headers: { 'User-Agent': UA_BROWSER } });
    const lokasi = res.headers?.get?.('location');
    if (!lokasi) break;
    u = new URL(lokasi, u).toString();
    const q = new URL(u).searchParams;
    const resid = q.get('resid') || q.get('id');
    if (resid && (q.get('cid') || /\bcid=|\/personal\//i.test(u))) {
      const cid = q.get('cid') || (u.match(/\/personal\/([0-9a-f]+)\//i) || [])[1];
      const d = new URL('https://onedrive.live.com/download');
      if (cid) d.searchParams.set('cid', cid);
      d.searchParams.set('resid', resid);
      if (q.get('authkey')) d.searchParams.set('authkey', q.get('authkey'));
      calon.push(d.toString());
    }
    if (/onedrive\.live\.com/i.test(u)) {
      calon.push(u + (u.includes('?') ? '&' : '?') + 'download=1');
      calon.push(`https://api.onedrive.com/v1.0/shares/u!${b64url(u)}/root/content`);
    }
  }
  return [...new Set(calon)];
}

export async function unduhExcel(linkMentah, fetchFn = fetch) {
  const link = String(linkMentah || '').trim().replace(/^["'<]+|["'>]+$/g, '').trim(); // buang spasi, baris baru, dan tanda kutip yang ikut tersalin
  if (!/^https:\/\/(1drv\.ms|onedrive\.live\.com|[\w-]+\.sharepoint\.com|[\w-]+-my\.sharepoint\.com)\//i.test(link)) {
    throw new Error('LIST_GAME_URL bukan link berbagi OneDrive (harus diawali https://1drv.ms/ atau https://onedrive.live.com/). Salin ulang link ke secret tanpa tanda kutip.');
  }
  const galat = [];
  const coba = async (u, nama) => {
    try {
      const res = await fetchFn(u, { redirect: 'follow', headers: { 'User-Agent': UA_BROWSER } });
      if (!res.ok) { galat.push(`${nama}: kode ${res.status}`); return null; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b) return buf; // "PK": berkas xlsx (zip)
      galat.push(`${nama}: balasan bukan berkas Excel`);
    } catch (e) { galat.push(`${nama}: ${e.message}`); }
    return null;
  };
  let buf = await coba(`https://api.onedrive.com/v1.0/shares/u!${b64url(link)}/root/content`, 'api.onedrive.com');
  if (!buf) buf = await coba(link + (link.includes('?') ? '&' : '?') + 'download=1', '1drv.ms');
  if (!buf) {
    let lain = [];
    try { lain = await calonUnduhanLangsung(link, fetchFn); } catch (e) { galat.push(`pengalihan: ${e.message}`); }
    if (!lain.length) galat.push('pengalihan: alamat tujuan tidak ditemukan');
    for (const u of lain) { buf = await coba(u, 'onedrive.live.com'); if (buf) break; }
  }
  if (buf) return buf;
  const butuhLogin = galat.some((g) => /kode 40[13]/.test(g));
  throw new Error('Tidak bisa mengunduh List Game.xlsx dari OneDrive (' + galat.join('; ') + '). ' + (butuhLogin
    ? 'OneDrive meminta login: buat ulang link lewat Bagikan > Siapa saja dengan link, salin, lalu perbarui secret LIST_GAME_URL (untuk file di folder bersama atau akun kantor, pakai Unduh langsung dari menu "Embed" atau pindahkan berkas ke OneDrive pribadi).'
    : 'Pastikan setelan berbagi "Siapa saja dengan link dapat melihat".'));
}

async function bacaExcel(buf, sheet) {
  const { default: readXlsxFile, readSheetNames } = await import('read-excel-file/node');
  const nama = await readSheetNames(buf);
  const pilih = nama.includes(sheet) ? sheet : nama[0];
  return { rows: await readXlsxFile(buf, { sheet: pilih }), sheet: pilih };
}

// ---------- Inti ----------
export async function jalankan(env, deps = {}) {
  const token = env.NOTION_TOKEN, db = env.KOLEKSI_DATABASE_ID;
  if (!token || !db) throw new Error('NOTION_TOKEN dan KOLEKSI_DATABASE_ID wajib diisi.');
  const maks = Number(env.MAKS_DATA_BARU || 250);
  const log = deps.log || console.log;
  const N = deps.notion || ((p, b, m) => notion(p, token, b, m));
  const halamanSemua = deps.semuaHalaman || (() => semuaHalaman(token, db));
  const cari = deps.perkaya || perkaya;
  const ambilById = deps.dataSteam || dataSteam;

  let rows, sheet = '-';
  if (deps.rows) rows = deps.rows;
  else {
    let buf = deps.excel;
    if (!buf && env.BERKAS) buf = await readFile(env.BERKAS);
    if (!buf && !env.LIST_GAME_URL) {
      for (const f of ['data/List Game.xlsx', 'data/List_Game.xlsx']) { try { buf = await readFile(f); log('Memakai berkas di repo: ' + f); break; } catch { /* coba berikutnya */ } }
    }
    if (!buf) {
      if (!env.LIST_GAME_URL) throw new Error('Isi LIST_GAME_URL, atau taruh berkas di repo sebagai data/List Game.xlsx, atau beri berkas .xlsx sebagai argumen.');
      buf = await unduhExcel(env.LIST_GAME_URL);
    }
    ({ rows, sheet } = await bacaExcel(buf, env.SHEET_NAME || 'List Game'));
  }
  const grup = kelompokkan(bacaDaftar(rows));
  log(`Excel (${sheet}): ${grup.length} game unik.`);

  const ada = (await halamanSemua()).map(bacaHalaman);
  const dariBerkas = new Map();
  const dariJudul = new Map();
  for (const p of ada) { for (const b of p.berkas) dariBerkas.set(b, p); dariJudul.set(normal(p.judul), p); }

  const hasil = { baru: 0, diperbarui: 0, diperkaya: 0, tidakKetemu: 0, hilang: 0, galat: [] };
  const dipakai = new Set();
  let kuota = maks;

  for (const g of grup) {
    try {
      let pg = g.berkas.map((b) => dariBerkas.get(b)).find(Boolean) || dariJudul.get(normal(g.judul));
      const dasar = {
        Lokasi: { multi_select: g.lokasi.map((name) => ({ name })) },
        Edisi: teks(g.edisi), Berkas: teks(g.berkas.join('\n')), 'Ada di Excel': { checkbox: true },
        ...(g.tambahan ? { Catatan: teks('Paket tambahan / mod') } : {}),
      };
      if (!pg) {
        let data = null, dicari = false;
        if (kuota > 0 && !g.tambahan) { kuota--; dicari = true; data = await cari(g.judul); await tidur(deps.jeda ?? 900); }
        const props = { Judul: { title: [{ type: 'text', text: { content: potong(data?.judul || g.judul, 200) } }] }, ...dasar,
          ...(data ? propsData({ ...data, judul: '' }) : { Sumber: { select: { name: 'Tidak ketemu' } } }) };
        if (!dicari && !g.tambahan) delete props.Sumber; // belum dicari: biarkan kosong agar dicoba di eksekusi berikutnya
        await N('/pages', { parent: { database_id: db }, properties: props }, 'POST');
        hasil.baru++; if (data) hasil.diperkaya++; else if (props.Sumber) hasil.tidakKetemu++;
        await tidur(deps.jeda ?? 350);
        continue;
      }
      dipakai.add(pg.id);
      const props = {};
      if (pg.lokasi.join('|') !== g.lokasi.join('|')) props.Lokasi = dasar.Lokasi;
      if (pg.edisi !== g.edisi) props.Edisi = dasar.Edisi;
      if (pg.berkas.join('\n') !== g.berkas.join('\n')) props.Berkas = dasar.Berkas;
      if (!pg.adaDiExcel) props['Ada di Excel'] = dasar['Ada di Excel'];
      // Perkaya ulang: belum pernah dicari, atau Steam ID diisi manual yang berbeda dari data tersimpan.
      const butuh = !pg.dikunci && pg.sumber !== 'Manual' && (!pg.sumber || (pg.sumber === 'Tidak ketemu' && env.ULANG_TIDAK_KETEMU === '1'));
      const idManual = !pg.dikunci && pg.steamId && pg.sumber !== 'Steam';
      // Baris Steam dari versi lama belum punya banner, screenshot, dan spesifikasi: ambil ulang berdasarkan Steam ID yang sudah ada.
      const segarkan = !pg.dikunci && pg.sumber === 'Steam' && pg.steamId && !pg.banner;
      if ((butuh || idManual || segarkan) && kuota > 0 && !g.tambahan) {
        kuota--;
        const data = (idManual || segarkan) ? await ambilById(pg.steamId) : await cari(g.judul);
        await tidur(deps.jeda ?? 900);
        if (data && segarkan) { Object.assign(props, propsData({ ...data, judul: '' })); hasil.disegarkan = (hasil.disegarkan || 0) + 1; }
        else if (data) { Object.assign(props, propsData(data)); hasil.diperkaya++; }
        else if (segarkan) { props.Banner = { url: pg.cover || null }; } // Steam sudah tidak menyediakan data: jangan diulang terus
        else { props.Sumber = { select: { name: 'Tidak ketemu' } }; hasil.tidakKetemu++; }
      }
      if (Object.keys(props).length) { await N(`/pages/${pg.id}`, { properties: props }, 'PATCH'); hasil.diperbarui++; await tidur(deps.jeda ?? 350); }
    } catch (e) {
      hasil.galat.push(`${g.judul}: ${e.message}`);
      log(`Galat: ${g.judul}: ${e.message}`);
    }
  }

  // Yang tidak ada lagi di Excel: tandai saja, jangan dihapus.
  for (const p of ada) {
    if (dipakai.has(p.id) || !p.adaDiExcel) continue;
    const dijumpai = grup.some((g) => g.berkas.some((b) => p.berkas.includes(b)) || normal(g.judul) === normal(p.judul));
    if (dijumpai) continue;
    try { await N(`/pages/${p.id}`, { properties: { 'Ada di Excel': { checkbox: false } } }, 'PATCH'); hasil.hilang++; await tidur(deps.jeda ?? 350); }
    catch (e) { hasil.galat.push(`${p.judul}: ${e.message}`); }
  }
  log(`Selesai: ${hasil.baru} baru, ${hasil.diperbarui} diperbarui, ${hasil.diperkaya} diperkaya, ${hasil.tidakKetemu} tidak ketemu, ${hasil.hilang} tidak ada lagi di Excel, ${hasil.disegarkan || 0} disegarkan (banner, screenshot, spesifikasi), ${hasil.galat.length} galat.`);
  if (kuota <= 0) log(`Batas ${maks} pencarian data per eksekusi tercapai. Jalankan lagi untuk melanjutkan sisanya.`);
  return hasil;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  jalankan({ ...process.env, BERKAS: process.argv[2] || process.env.BERKAS }).then((h) => {
    if (h.galat.length) process.exitCode = 1;
  }, (e) => { console.error(e.message); process.exit(1); });
}
