# Watchlist Anime

Situs multi-halaman yang menampilkan database Notion, lengkap dengan halaman untuk menambah anime langsung dari situs.

## Cara kerjanya

```
Situs (GitHub Pages)  <-->  Penghubung (Cloudflare Worker)  <-->  Notion
```

- **Membaca:** situs meminta daftar ke penghubung, jadi anime baru langsung tampil.
- **Menambah:** halaman Tambah anime mencari di MyAnimeList, lalu mengirim pilihanmu ke penghubung. Penghubung memeriksa kata sandimu dan menyimpannya ke Notion.
- **Token Notion hanya ada di penghubung**, tidak pernah ada di kode situs. Situs hanya menyimpan kata sandi yang kamu ketik sendiri.
- **Cadangan:** GitHub Actions menyimpan salinan data (`data.js`) tiap sekitar 15 menit. Jika penghubung sedang mati, situs menampilkan salinan itu.

## Halaman

| File | Isi |
|---|---|
| `index.html` | Beranda: anime berikutnya yang ditonton, lalu daftar per status |
| `daftar.html` | Semua anime dengan filter status, genre, pencarian, dan urutan |
| `anime.html?id=...` | Detail satu anime |
| `tambah.html` | Cari di MyAnimeList atau isi manual, lalu simpan ke Notion |
| `config.js` | Alamat penghubung (`apiUrl`) |
| `worker/worker.js` | Kode penghubung untuk Cloudflare Workers |
| `scripts/sync-notion.mjs`, `.github/workflows/sync-notion.yml` | Salinan cadangan otomatis dan deploy |
| `data.js` | Data contoh; diganti otomatis saat deploy |

## Pemasangan (sekali saja)

### A. Notion

1. Buka https://www.notion.so/profile/integrations, buat **New integration** (tipe Internal).
2. Pada **Capabilities**, centang **Read content** dan **Insert content**. Insert content wajib agar bisa menambah anime.
3. Salin **Internal Integration Secret**. Itu token Notion.
4. Buka database **Anime Watchlist**, klik `...` di kanan atas, pilih **Connections**, lalu tambahkan integrasi tadi.
5. Catat **ID database**: 32 karakter di URL database, tepat sebelum tanda `?`.

### B. Cloudflare (penghubung)

1. Buat akun gratis di https://dash.cloudflare.com, lalu buka **Workers & Pages > Create > Create Worker**.
2. Beri nama, misalnya `anime-api`, klik **Deploy**. Setelah itu klik **Edit code**, hapus semua isinya, tempel seluruh isi `worker/worker.js`, lalu **Deploy**.
3. Buka **Settings > Variables and Secrets** dan tambahkan:

   | Nama | Tipe | Isi |
   |---|---|---|
   | `NOTION_TOKEN` | Secret | token dari langkah A.3 |
   | `ADMIN_PASSWORD` | Secret | kata sandi buatanmu untuk menambah anime. Pakai minimal 16 karakter |
   | `NOTION_DATABASE_ID` | Text | ID database dari langkah A.5 |
   | `ALLOWED_ORIGIN` | Text | alamat situsmu, mis. `https://nama-kamu.github.io` (tanpa nama repo dan tanpa garis miring) |

4. Klik **Deploy** lagi. Alamat penghubung muncul di halaman Worker, bentuknya `https://anime-api.AKUN.workers.dev`.
5. Cek: buka `https://anime-api.AKUN.workers.dev/api/anime` di browser. Jika benar, yang tampil adalah daftar anime berbentuk JSON.

### C. GitHub

1. Buat repository **Public** dan unggah semua file di folder ini, termasuk `.github`, `scripts`, dan `worker`.
2. Buka `config.js`, isi `apiUrl` dengan alamat penghubung dari langkah B.4, lalu simpan dan commit.
3. Buka **Settings > Secrets and variables > Actions** dan buat secret `NOTION_TOKEN` dan `NOTION_DATABASE_ID` (isinya sama dengan di Cloudflare). Ini dipakai untuk salinan cadangan.
4. Buka **Settings > Pages**, pada **Source** pilih **GitHub Actions**.
5. Buka tab **Actions**, pilih **Sinkron Notion dan deploy**, klik **Run workflow**. Setelah sekitar satu menit, alamat situs muncul di Settings > Pages.

## Memakai

- **Tambah anime:** buka halaman Tambah anime, isi kata sandi, cari judul, klik **Tambah**. Poster, sinopsis, genre, studio, dan jumlah episode terisi otomatis dari MyAnimeList. Anime langsung muncul di daftar.
- **Ubah progres, status, dan rating:** lewat Notion. Situs hanya menampilkan.
- **Ingat kata sandi:** centang kotaknya jika perangkatnya pribadi. Kata sandi disimpan di browser itu saja.
- **Cover:** poster dari MyAnimeList disimpan sebagai cover link di Notion. Jika kamu mengganti cover di Notion, pakai tab **Link**, bukan unggah file.

## Perlu diketahui

- Isi database tampil di situs publik dan bisa dibaca siapa pun lewat alamat penghubung. Kolom `Catatan` sengaja tidak dibaca.
- Hanya orang yang tahu kata sandi yang bisa menambah anime. Pilih kata sandi yang panjang dan jangan dipakai di tempat lain. Penghubung memperlambat percobaan kata sandi yang salah, tapi tidak memblokirnya.
- Paket gratis Cloudflare cukup untuk pemakaian pribadi (100.000 permintaan per hari).
- Pencarian memakai Jikan (data MyAnimeList) yang dipanggil dari browser, dan punya batas permintaan. Jika kena batas, tunggu sebentar lalu coba lagi. Sinopsis dari MyAnimeList ikut tersimpan di database dan tampil di situsmu.
- Tanpa `apiUrl`, situs tetap jalan memakai `data.js` dan halaman Tambah anime nonaktif.
- GitHub bisa menonaktifkan jadwal otomatis pada repository publik yang tidak aktif selama 60 hari. Jika itu terjadi, aktifkan lagi di tab Actions. Situs tetap berjalan lewat penghubung.
- Font dimuat dari Google Fonts. Tanpa internet, tampilan memakai font bawaan sistem.

## Mencoba di komputer

Buka `index.html` langsung di browser. Tanpa `apiUrl`, yang tampil adalah data contoh di `data.js`.
