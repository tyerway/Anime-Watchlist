// Mengisi kolom "Rilis Berikutnya" dan "Info Rilis" di Notion dari GitHub Actions.
// Memakai kode penghubung yang sama (worker/worker.js), tetapi berjalan dari server GitHub,
// yang tidak diblokir AniList seperti alamat Cloudflare Workers.
import worker from '../worker/worker.js';

const { NOTION_TOKEN, NOTION_DATABASE_ID, TMDB_API_KEY, RAWG_API_KEY } = process.env;
if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('NOTION_TOKEN dan NOTION_DATABASE_ID wajib diisi (GitHub > Settings > Secrets and variables > Actions).');
  process.exit(1);
}

const sandi = crypto.randomUUID(); // hanya untuk panggilan internal ini
const env = { NOTION_TOKEN, NOTION_DATABASE_ID, ADMIN_PASSWORD: sandi, TMDB_API_KEY, RAWG_API_KEY };
const res = await worker.fetch(new Request('https://lokal.invalid/api/cek-rilis', { method: 'POST', headers: { 'X-Admin-Password': sandi } }), env);
const hasil = await res.json();
console.log(JSON.stringify(hasil, null, 2));
if (!res.ok) process.exit(1);
for (const g of hasil.galat || []) console.log(`::warning::${g}`);
