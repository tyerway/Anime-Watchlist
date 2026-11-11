# Watchlist

Situs multi-halaman untuk anime, film, serial drama, dan game. Isinya diambil dari satu database Notion, dan dari situs kamu bisa menambah judul, mengubah progres dan status, serta menghapus.

## Cara kerjanya

```
Situs (GitHub Pages)  <-->  Penghubung (Cloudflare Worker)  <-->  Notion
```

- **Membaca:** situs meminta daftar ke penghubung, jadi judul baru langsung tampil.
- **Menambah:** halaman Tambah mencari judul (anime lewat AniList, film dan serial lewat TMDB, game lewat RAWG, IGDB, atau Steam), lalu mengirim pilihanmu ke penghubung. Pencarian dijalankan oleh penghubung. Penghubung memeriksa kata sandimu dan menyimpannya ke Notion.
- **Token Notion hanya ada di penghubung**, tidak pernah ada di kode situs. Situs hanya menyimpan kata sandi yang kamu ketik sendiri.
- **Cadangan:** GitHub Actions menyimpan salinan data (`data.js`) tiap sekitar 15 menit. Jika penghubung sedang mati, situs menampilkan salinan itu.

## Halaman

| File | Isi |
|---|---|
| `index.html` | Beranda: dinding poster semua jenis (arahkan atau klik poster untuk melihat keterangannya, filter per jenis, Acak ulang), Baru ditambahkan, Segera tayang, lalu daftar per status |
| `daftar.html` | Semua judul dengan filter status, genre, asal, pencarian, dan urutan. `?jenis=anime`, `?jenis=film`, `?jenis=serial`, atau `?jenis=game` untuk satu jenis saja. Game difilter per platform |
| `anime.html?id=...` | Detail satu judul: progres episode (anime dan serial), status, hapus. Film dan game hanya punya status |
| `tambah.html` | Pilih jenis (Anime, Film, Serial Drama, Game), cari lalu tambah, atau isi manual |
| `config.js` | Alamat penghubung (`apiUrl`) |
| `worker/worker.js` | Kode penghubung untuk Cloudflare Workers |
| `scripts/sync-notion.mjs`, `.github/workflows/sync-notion.yml` | Salinan cadangan otomatis dan deploy |
| `scripts/rilis-anime.mjs`, `.github/workflows/rilis-anime.yml` | Mengisi jadwal rilis anime di Notion (lewat GitHub Actions) |
| `data.js` | Data contoh; diganti otomatis saat deploy |

## Pemasangan (sekali saja)

### A. Notion

1. Buka https://www.notion.so/profile/integrations, buat **New integration** (tipe Internal).
2. Pada **Capabilities**, centang **Read content** dan **Insert content**. Insert content wajib agar bisa menambah anime.
3. Salin **Internal Integration Secret**. Itu token Notion.
4. Buka database **Anime Watchlist**, klik `...` di kanan atas, pilih **Connections**, lalu tambahkan integrasi tadi.
5. Catat **ID database**: 32 karakter di URL database, tepat sebelum tanda `?`.
6. Pastikan database punya kolom **Select** ini (nama persis): **Jenis** dengan pilihan `Anime`, `Film`, `Serial Drama`, `Game`; **Asal** dengan pilihan `Barat`, `Jepang`, `Korea`, `Lainnya`; dan **Platform** dengan pilihan `PS1`, `PS2`, `PS3`, `PS4`, `PS5`, `PSP`, `PS Vita`, `PC`, `Switch`, `Xbox`, `Mobile`, `Lainnya`. Entri lama tanpa Jenis dianggap Anime.
7. Pada **Capabilities** integrasi, centang juga **Update content** agar progres, status, dan hapus bisa disimpan dari situs.
8. Untuk jadwal rilis, tambahkan kolom **Rilis Berikutnya** (tipe Date) dan **Info Rilis** (tipe Text). Keduanya diisi otomatis oleh penghubung.

### B. Cloudflare (penghubung)

1. Buat akun gratis di https://dash.cloudflare.com, lalu buka **Workers & Pages > Create > Create Worker**.
2. Beri nama, misalnya `anime-api`, klik **Deploy**. Setelah itu klik **Edit code**, hapus semua isinya, tempel seluruh isi `worker/worker.js`, lalu **Deploy**.
3. Buka **Settings > Variables and Secrets** dan tambahkan:

   | Nama | Tipe | Isi |
   |---|---|---|
   | `NOTION_TOKEN` | Secret | token dari langkah A.3 |
   | `ADMIN_PASSWORD` | Secret | kata sandi buatanmu untuk menambah anime. Pakai minimal 16 karakter |
   | `NOTION_DATABASE_ID` | Text | ID database dari langkah A.5 |
   | `ALLOWED_ORIGIN` | Text | alamat situsmu, mis. `https://nama-kamu.workers.dev` (tanpa garis miring di akhir) |
   | `TMDB_API_KEY` | Secret (opsional) | kunci API TMDB untuk mencari film dan serial. Tanpa ini, film dan drama tetap bisa ditambah lewat **Tambah manual** |
   | `RAWG_API_KEY` | Secret (opsional) | kunci API RAWG untuk mencari game. Tanpa ini, game tetap bisa ditambah lewat **Tambah manual** |
   | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Secret (opsional) | akun Twitch untuk pencarian game lewat IGDB (cadangan RAWG) |
   | `KALENDER_TOKEN` | Secret (opsional) | kata acak panjang (minimal 20 karakter) untuk alamat kalender Google. Lihat bagian Jadwal rilis |

4. Klik **Deploy** lagi. Alamat penghubung muncul di halaman Worker, bentuknya `https://anime-api.AKUN.workers.dev`.
5. Cek: buka `https://anime-api.AKUN.workers.dev/api/anime` di browser. Jika benar, yang tampil adalah daftar anime berbentuk JSON.

### C. GitHub

1. Buat repository **Public** dan unggah semua file di folder ini, termasuk `.github`, `scripts`, dan `worker`.
2. Buka `config.js`, isi `apiUrl` dengan alamat penghubung dari langkah B.4, lalu simpan dan commit.
3. Buka **Settings > Secrets and variables > Actions** dan buat secret `NOTION_TOKEN` dan `NOTION_DATABASE_ID` (isinya sama dengan di Cloudflare). Ini dipakai untuk salinan cadangan.
4. Buka **Settings > Pages**, pada **Source** pilih **GitHub Actions**.
5. Buka tab **Actions**, pilih **Sinkron Notion dan deploy**, klik **Run workflow**. Setelah sekitar satu menit, alamat situs muncul di Settings > Pages.

### Kunci TMDB (untuk pencarian film dan serial)

1. Buat akun gratis di https://www.themoviedb.org, lalu buka **Settings > API** dan ajukan kunci API (pilih penggunaan pribadi).
2. Salin **API Key** (atau **API Read Access Token**) dan simpan sebagai secret `TMDB_API_KEY` di worker Cloudflare, lalu **Deploy**.
3. Di halaman Tambah, pilih jenis **Film** atau **Serial Drama**, lalu cari. Poster, genre, sinopsis, jumlah episode (serial), dan asal (Barat, Jepang, Korea) terisi otomatis. Asal bisa diganti sebelum menambah.

### Kunci RAWG (untuk pencarian game)

1. Buat akun gratis di https://rawg.io/apidocs, lalu ambil **API key**.
2. Simpan sebagai secret `RAWG_API_KEY` di worker Cloudflare, lalu **Deploy**.
3. Di halaman Tambah, pilih jenis **Game**, lalu cari. Poster, genre, pengembang, deskripsi, dan tahun rilis terisi otomatis. Setiap hasil punya pilihan **Platform** (PS1, PS2, PC, dan seterusnya) yang kamu mainkan; pilih sebelum klik Tambah.

### Pencarian game: RAWG, IGDB, Steam

Penghubung mencoba sumber berurutan dan memakai yang pertama berhasil: **RAWG** (jika `RAWG_API_KEY` ada), lalu **IGDB** (jika kunci Twitch ada), lalu **Steam**. Steam tidak butuh kunci apa pun, jadi pencarian game selalu jalan, tetapi hanya mencakup game PC. Untuk game PS1, PS2, dan konsol lain, pasang RAWG atau IGDB.

Kunci IGDB: buka https://dev.twitch.tv/console (akun Twitch dengan verifikasi 2 langkah aktif), pilih **Register Your Application** (Category: Application Integration, Redirect URL `http://localhost`), lalu salin **Client ID** dan buat **Client Secret**. Simpan sebagai secret `IGDB_CLIENT_ID` dan `IGDB_CLIENT_SECRET`, lalu **Deploy**.

### Jadwal rilis dan pengingat

Penghubung mengecek jadwal untuk judul berstatus **Sedang Ditonton** dan **Rencana**, lalu mengisi kolom **Rilis Berikutnya** dan **Info Rilis** di Notion:

| Jenis | Sumber | Isi |
|---|---|---|
| Anime | AniList (lewat tautan MyAnimeList) | tanggal dan jam episode berikutnya (WIB), atau tanggal rilis perdana |
| Anime | AniList, dijalankan oleh GitHub Actions (`scripts/rilis-anime.mjs`) | tanggal dan jam episode berikutnya (WIB), atau tanggal rilis perdana |
| Serial Drama | TMDB | tanggal episode berikutnya, atau tayang perdana |
| Film | TMDB | jadwal bioskop Indonesia; jika belum ada, tanggal rilis global (diberi keterangan) |
| Game | Steam atau RAWG | tanggal rilis, hanya untuk game yang belum rilis |

Judul yang sudah Selesai, Ditunda, atau Dihentikan dibersihkan jadwalnya. Judul tanpa tautan sumber (ditambah manual) tidak dicek.

**Anime lewat GitHub Actions:** AniList memblokir alamat server Cloudflare, jadi jadwal anime diisi oleh GitHub Actions (workflow **Jadwal rilis anime**, tiap 6 jam, memakai secret `NOTION_TOKEN` dan `NOTION_DATABASE_ID` yang sudah ada). Untuk menjalankannya sekarang: tab **Actions > Jadwal rilis anime > Run workflow**. Agar worker tidak ikut menyentuh anime, tambahkan variabel Text `JADWAL_ANIME` dengan isi `github` di worker. Cadangan lewat Jikan (perkiraan dari jadwal siaran Jepang) hanya aktif jika `JIKAN_CADANGAN` diisi `ya`; Jikan sering tidak bisa dijangkau dari Cloudflare, jadi tidak disarankan.

**Menjalankan otomatis:** di Cloudflare buka worker `anime-api` > **Settings > Trigger Events** (atau **Triggers**) > **Add > Cron Triggers**, isi `0 */6 * * *` (tiap 6 jam), lalu simpan. Cron gratis. Untuk mengecek sekarang juga, kirim `POST` ke `/api/cek-rilis` dengan header `X-Admin-Password`.

**Pengingat di Notion:** buka kolom **Rilis Berikutnya** di tampilan database, klik tanggalnya, lalu aktifkan **Remind** (misalnya 1 hari sebelumnya). Karena kolomnya berubah otomatis, pengingatnya ikut mengikuti jadwal terbaru. Notion Calendar juga bisa menampilkan database ini.

**Google Calendar:**
1. Buat secret `KALENDER_TOKEN` di worker (kata acak panjang), lalu **Deploy**.
2. Di Google Calendar (versi web) buka **Lainnya (+) di samping "Kalender lain" > Dari URL**, lalu tempel `https://anime-api.AKUN.workers.dev/api/kalender.ics?t=TOKEN-KAMU`.
3. Atur pengingat di **Pengaturan > pilih kalender "Watchlist: Jadwal Rilis" > Notifikasi acara**.

Google memperbarui kalender langganan tiap beberapa jam sampai sekitar sehari, jadi jadwal baru bisa terlambat muncul. Anggap alamat kalender itu rahasia: siapa pun yang punya alamatnya bisa melihat jadwal judul-judulmu. Untuk mengganti, ubah `KALENDER_TOKEN` lalu langganan ulang.

## Memakai

- **Tambah judul:** buka halaman Tambah, isi kata sandi, pilih **Jenis**, cari judul, klik **Tambah**. Anime dicari lewat AniList (cadangan Jikan/MyAnimeList), film dan serial lewat TMDB. Judul langsung muncul di daftar.
- **Ubah progres dan status:** buka halaman detail, klik kotak episode atau pakai +1 / −1 episode, atau pilih Status. Film tidak punya episode, hanya status. Memilih **Selesai** menandai semua episode.
- **Game:** statusnya memakai kata **Sedang Dimainkan** dan **Tamat** (di Notion tetap tersimpan sebagai Sedang Ditonton dan Selesai). Game tidak punya episode.
- **Hapus:** tombol **Hapus dari daftar** di halaman detail memindahkan judul ke tempat sampah Notion, jadi masih bisa dipulihkan dari sana.
- **Rating:** diisi lewat Notion.
- **Ingat kata sandi:** centang kotaknya jika perangkatnya pribadi. Kata sandi disimpan di browser itu saja.
- **Cover:** poster dari MyAnimeList disimpan sebagai cover link di Notion. Jika kamu mengganti cover di Notion, pakai tab **Link**, bukan unggah file.

## Perlu diketahui

- Isi database tampil di situs publik dan bisa dibaca siapa pun lewat alamat penghubung. Kolom `Catatan` sengaja tidak dibaca.
- Hanya orang yang tahu kata sandi yang bisa menambah anime. Pilih kata sandi yang panjang dan jangan dipakai di tempat lain. Penghubung memperlambat percobaan kata sandi yang salah, tapi tidak memblokirnya.
- Paket gratis Cloudflare cukup untuk pemakaian pribadi (100.000 permintaan per hari).
- Pencarian dijalankan oleh penghubung, bukan browser, jadi tetap jalan walau jaringan atau ekstensi browser-mu memblokir sumbernya. Pencarian butuh kata sandi yang sama dengan menambah judul. Sumber data punya batas permintaan; jika kena batas, tunggu sebentar lalu coba lagi.
- Kolom `Tautan MAL` dipakai juga untuk tautan TMDB (film dan serial) dan menjadi kunci pencegah judul ganda.
- Data game dari RAWG, IGDB, atau Steam sesuai sumber yang dipakai; situs menampilkan tautan sumbernya di footer.
- Poster (TMDB, IGDB, Steam, RAWG) dimuat lewat penghubung (`/api/gambar`), jadi tetap tampil walau ISP atau ekstensi browser memblokir situs gambarnya.
- Data film dan serial dari TMDB. Situs ini memakai API TMDB tetapi tidak didukung atau disertifikasi oleh TMDB. Sinopsis dari MyAnimeList ikut tersimpan di database dan tampil di situsmu.
- Tanpa `apiUrl`, situs tetap jalan memakai `data.js` dan halaman Tambah nonaktif.
- GitHub bisa menonaktifkan jadwal otomatis pada repository publik yang tidak aktif selama 60 hari. Jika itu terjadi, aktifkan lagi di tab Actions. Situs tetap berjalan lewat penghubung.
- Font dimuat dari Google Fonts. Tanpa internet, tampilan memakai font bawaan sistem.

## Mencoba di komputer

Buka `index.html` langsung di browser. Tanpa `apiUrl`, yang tampil adalah data contoh di `data.js`.
