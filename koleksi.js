// Halaman Koleksi Game. Berdiri sendiri (tidak memakai app.js). Data dari penghubung: GET /api/koleksi.
(() => {
  'use strict';
  const PW_KEY = 'anime-admin-pw'; // kata sandi yang sama dengan halaman Tambah
  const PER_HAL = 48;
  const apiBase = () => ((window.SITE_CONFIG || {}).apiUrl || '').trim().replace(/\/+$/, '');
  const app = document.getElementById('k-app');

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  const simpan = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* diabaikan */ } };
  const baca = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

  function coverSrc(u) {
    const base = apiBase();
    if (base && /^https:\/\/([\w.]+\.steamstatic\.com|upload\.wikimedia\.org|image\.tmdb\.org|images\.igdb\.com|media\.rawg\.io)\//.test(u)) return base + '/api/gambar?u=' + encodeURIComponent(u);
    return u;
  }
  const WARNA = ['#5b4a1e', '#4a2a5e', '#1f4a5e', '#5e2a2a', '#1f5e3a', '#3a2a5e', '#5e4a2a'];
  // Daftar developer dari Steam bisa belasan studio: kartu hanya menampilkan dua pertama.
  function ringkasDev(dev) {
    const d = String(dev || '').split(',').map((x) => x.trim()).filter(Boolean);
    return d.length > 2 ? `${d.slice(0, 2).join(', ')} +${d.length - 2} lainnya` : d.join(', ');
  }
  const inisial = (j) => j.split(/[\s:;]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const warna = (j) => WARNA[[...j].reduce((a, c) => a + c.charCodeAt(0), 0) % WARNA.length];

  // Cover: potret Steam -> banner lanskap -> kotak inisial. Gambar lanskap diletakkan utuh di atas latar kabur dari gambar yang sama.
  function gambar(item, kelas = '') {
    const kotak = h('div', { class: 'k-cover ' + kelas });
    const ph = h('div', { class: 'k-ph', text: inisial(item.judul), style: `background:linear-gradient(160deg, ${warna(item.judul)}, #10141f)`, 'aria-hidden': 'true' });
    kotak.append(ph);
    const urut = [item.cover, item.banner, item.cover && item.cover.replace(/library_600x900\.jpg$/, 'header.jpg')].filter((u, i, a) => u && a.indexOf(u) === i);
    if (!urut.length) return kotak;
    let n = 0;
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', src: coverSrc(urut[0]) });
    img.addEventListener('error', () => { if (++n < urut.length) img.src = coverSrc(urut[n]); else img.remove(); });
    img.addEventListener('load', () => {
      ph.remove();
      if (img.naturalWidth > img.naturalHeight * 1.15) { kotak.classList.add('lanskap'); kotak.style.setProperty('--bg', `url("${img.currentSrc.replace(/"/g, '%22')}")`); }
    });
    kotak.append(img);
    return kotak;
  }

  const miniatur = (u) => u.replace(/\.1920x1080\.jpg$/, '.600x338.jpg');
  // "OS: Windows 10" -> daftar label dan nilai; baris tanpa label tetap tampil.
  function daftarSpek(teks) {
    return h('dl', { class: 'k-spek' }, String(teks).split('\n').flatMap((baris) => {
      const i = baris.indexOf(':');
      return i > 0 && i < 28 ? [h('dt', { text: baris.slice(0, i) }), h('dd', { text: baris.slice(i + 1).trim() })] : [h('dt', { text: '' }), h('dd', { text: baris })];
    }));
  }

  let semua = [];
  const f = { q: '', lokasi: 'semua', genre: '', urut: 'az', tampil: PER_HAL, data: 'semua' };

  function gerbang(pesan) {
    const input = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Kata sandi', placeholder: 'Kata sandi' });
    const ingat = h('input', { type: 'checkbox', checked: true });
    const err = h('p', { class: 'k-err', role: 'alert', text: pesan || '' });
    const tombol = h('button', { type: 'submit', class: 'k-btn', text: 'Buka koleksi' });
    app.replaceChildren(h('form', { class: 'k-gate', onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value) { err.textContent = 'Isi kata sandi dulu.'; return; }
      tombol.disabled = true; err.textContent = '';
      const ok = await muat(input.value, ingat.checked);
      if (!ok.ok) { tombol.disabled = false; err.textContent = ok.pesan; }
    } },
      h('h1', { text: 'Koleksi Game' }),
      h('p', { class: 'k-sub', text: 'Halaman ini pribadi. Masukkan kata sandi yang sama dengan halaman Tambah.' }),
      input, h('label', { class: 'k-ingat' }, ingat, 'Ingat kata sandi di perangkat ini'), err, tombol));
    input.focus();
  }

  async function muat(pw, ingat) {
    const base = apiBase();
    if (!base) return { ok: false, pesan: 'Penghubung belum dipasang: isi apiUrl di config.js.' };
    let res;
    try { res = await fetch(base + '/api/koleksi', { headers: { 'X-Admin-Password': pw }, cache: 'no-store' }); }
    catch { return { ok: false, pesan: 'Tidak bisa menghubungi penghubung. Periksa koneksi, lalu coba lagi.' }; }
    let json = {};
    try { json = await res.json(); } catch { /* bukan JSON */ }
    if (res.status === 401) { simpan(PW_KEY, null); return { ok: false, pesan: 'Kata sandi salah.' }; }
    if (!res.ok) return { ok: false, pesan: json.error || `Penghubung membalas kode ${res.status}.` };
    if (ingat) simpan(PW_KEY, pw);
    semua = json.items || [];
    tampilkan(json.diperbarui);
    return { ok: true };
  }

  function tampilkan(diperbarui) {
    const lokasiList = [...new Set(semua.flatMap((x) => x.lokasi))].sort();
    const genreList = [...new Set(semua.flatMap((x) => x.genre))].sort((a, b) => a.localeCompare(b));
    const hitung = (l) => semua.filter((x) => x.lokasi.includes(l)).length;
    const tagList = [...new Set(semua.flatMap((x) => x.tag || []))].sort();
    const belumData = semua.filter((x) => !x.sumber || x.sumber === 'Tidak ketemu').length;

    const q = h('input', { type: 'search', 'aria-label': 'Cari judul', placeholder: 'Cari judul, developer, genre…', autocomplete: 'off' });
    const gSel = h('select', { 'aria-label': 'Genre' }, h('option', { value: '', text: 'Semua genre' }), genreList.map((g) => h('option', { value: g, text: g })));
    const uSel = h('select', { 'aria-label': 'Urutkan' },
      h('option', { value: 'az', text: 'A–Z' }), h('option', { value: 'tahun', text: 'Tahun terbaru' }), h('option', { value: 'baru', text: 'Terakhir ditambahkan' }));
    const dSel = h('select', { 'aria-label': 'Kelengkapan data' }, h('option', { value: 'semua', text: 'Semua data' }),
      h('option', { value: 'belum', text: `Belum ada data (${belumData})` }), h('option', { value: 'hilang', text: 'Tidak ada lagi di Excel' }),
      tagList.map((t) => h('option', { value: 'tag:' + t, text: `Tag: ${t} (${semua.filter((x) => (x.tag || []).includes(t)).length})` })));
    const chipBox = h('div', { class: 'k-chips', role: 'group', 'aria-label': 'Hardisk' });
    const info = h('p', { class: 'k-info', 'aria-live': 'polite' });
    const grid = h('ul', { class: 'k-grid' });
    const lagi = h('button', { type: 'button', class: 'k-btn quiet k-more', text: 'Tampilkan lebih banyak', onclick: () => { f.tampil += PER_HAL; gambarDaftar(); } });
    const dlg = h('dialog', { class: 'k-dlg', 'aria-label': 'Detail game' });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

    const chipDef = [['semua', 'Semua', semua.length], ...lokasiList.map((l) => [l, l, hitung(l)])];
    function chips() {
      chipBox.replaceChildren(...chipDef.map(([k, label, n]) =>
        h('button', { type: 'button', 'aria-pressed': String(f.lokasi === k), onclick: () => { f.lokasi = k; f.tampil = PER_HAL; chips(); gambarDaftar(); } }, label, h('small', { text: n }))));
    }

    function saring() {
      const kata = f.q.trim().toLowerCase();
      let r = semua.filter((x) =>
        (f.lokasi === 'semua' || x.lokasi.includes(f.lokasi)) &&
        (!f.genre || x.genre.includes(f.genre)) &&
        (f.data === 'semua' || (f.data.startsWith('tag:') ? (x.tag || []).includes(f.data.slice(4)) : f.data === 'belum' ? (!x.sumber || x.sumber === 'Tidak ketemu') : !x.adaDiExcel)) &&
        (!kata || `${x.judul} ${x.developer} ${x.genre.join(' ')} ${x.edisi}`.toLowerCase().includes(kata)));
      if (f.urut === 'tahun') r = r.slice().sort((a, b) => (b.tahun || 0) - (a.tahun || 0) || a.judul.localeCompare(b.judul));
      else if (f.urut === 'baru') r = r.slice().sort((a, b) => String(b.ditambahkan).localeCompare(String(a.ditambahkan)));
      else r = r.slice().sort((a, b) => a.judul.localeCompare(b.judul, 'id', { sensitivity: 'base', numeric: true }));
      return r;
    }

    function gambarDaftar() {
      const r = saring();
      const potong = r.slice(0, f.tampil);
      info.textContent = r.length === semua.length ? `${semua.length} game` : `${r.length} dari ${semua.length} game`;
      if (!r.length) { grid.replaceChildren(h('li', { class: 'k-empty', text: 'Tidak ada game yang cocok.' })); lagi.hidden = true; return; }
      grid.replaceChildren(...potong.map((x) => h('li', {}, h('button', { type: 'button', class: 'k-card', onclick: () => detail(x) },
        gambar(x),
        h('div', { class: 'k-meta' }, h('b', { text: x.judul }),
          h('span', { class: 'k-sub1', title: x.developer || null, text: [x.tahun, ringkasDev(x.developer)].filter(Boolean).join(' · ') || '\u00a0' }),
          h('div', { class: 'k-hds' }, [...(x.tag || []).map((t) => h('span', { class: 'k-hd k-tag', text: t })), ...x.lokasi.map((l) => h('span', { class: 'k-hd', text: l }))]))))));
      lagi.hidden = r.length <= f.tampil;
    }

    function detail(x) {
      const info = [['Judul', x.edisi ? `${x.judul} (${x.edisi})` : x.judul], ['Genre', x.genre.join(', ')], ['Developer', x.developer], ['Publisher', x.publisher],
        ['Tanggal rilis', x.rilis || x.tahun], ['Tag', (x.tag || []).join(', ')], ['Hardisk', x.lokasi.join(', ')], ['Sumber data', x.sumber === 'Tidak ketemu' ? 'Belum ketemu otomatis' : x.sumber], ['Catatan', x.catatan]].filter(([, v]) => v);
      const bannerUrl = x.banner || x.cover;
      const banner = bannerUrl ? h('img', { class: 'k-banner', alt: '', decoding: 'async', src: coverSrc(bannerUrl) }) : null;
      if (banner) banner.addEventListener('error', () => banner.remove());

      // Jendela besar untuk screenshot
      let idx = 0;
      const viewer = h('div', { class: 'k-viewer', hidden: true, role: 'dialog', 'aria-label': 'Screenshot' });
      const vImg = h('img', { alt: '' });
      const tutupViewer = () => { viewer.hidden = true; vImg.removeAttribute('src'); };
      const tampilVw = (i) => { idx = (i + x.screenshots.length) % x.screenshots.length; vImg.src = coverSrc(x.screenshots[idx]); vCount.textContent = `${idx + 1} / ${x.screenshots.length}`; viewer.hidden = false; };
      const vCount = h('span', { class: 'k-vcount' });
      viewer.append(vImg, vCount,
        h('button', { type: 'button', class: 'k-vbtn k-vprev', 'aria-label': 'Sebelumnya', text: '‹', onclick: (e) => { e.stopPropagation(); tampilVw(idx - 1); } }),
        h('button', { type: 'button', class: 'k-vbtn k-vnext', 'aria-label': 'Berikutnya', text: '›', onclick: (e) => { e.stopPropagation(); tampilVw(idx + 1); } }),
        h('button', { type: 'button', class: 'k-vbtn k-vclose', 'aria-label': 'Tutup gambar', text: '✕', onclick: (e) => { e.stopPropagation(); tutupViewer(); } }));
      viewer.addEventListener('click', tutupViewer);

      const tab = [];
      tab.push(['deskripsi', 'Deskripsi', () => h('div', { class: 'k-teks' },
        x.deskripsi ? h('p', { text: x.deskripsi }) : h('p', { class: 'k-sub', text: 'Belum ada deskripsi. Isi manual di Notion, atau isi kolom Steam ID lalu sinkron berikutnya akan mengambilnya.' }),
        x.tentang ? h('p', { text: x.tentang }) : null)]);
      if (x.screenshots.length) tab.push(['screenshot', `Screenshot (${x.screenshots.length})`, () => h('div', { class: 'k-shots' }, x.screenshots.map((u, i) =>
        h('button', { type: 'button', class: 'k-shot', 'aria-label': `Buka screenshot ${i + 1}`, onclick: () => tampilVw(i) }, h('img', { alt: '', loading: 'lazy', decoding: 'async', src: coverSrc(miniatur(u)) }))))]);
      if (x.spekMin || x.spekRek) tab.push(['spek', 'System Requirements', () => h('div', { class: 'k-speks' },
        x.spekMin ? h('section', {}, h('h3', { text: 'Minimum' }), daftarSpek(x.spekMin)) : null,
        x.spekRek ? h('section', {}, h('h3', { text: 'Disarankan' }), daftarSpek(x.spekRek)) : null)]);

      const panel = h('div', { class: 'k-panel', role: 'tabpanel' });
      const bar = h('div', { class: 'k-tabs', role: 'tablist' });
      const pilih = (id) => {
        for (const b of bar.children) b.setAttribute('aria-selected', String(b.dataset.id === id));
        panel.replaceChildren(tab.find((t) => t[0] === id)[2]());
      };
      for (const [id, label] of tab) bar.append(h('button', { type: 'button', role: 'tab', 'data-id': id, 'aria-selected': 'false', text: label, onclick: () => pilih(id) }));

      dlg.replaceChildren(
        h('button', { type: 'button', class: 'k-btn quiet k-dclose', text: 'Tutup', onclick: () => dlg.close() }),
        h('article', { class: 'k-post' },
          h('p', { class: 'k-kat' }, x.genre.length ? x.genre.join(', ') : 'Koleksi Game'),
          h('h2', { text: x.judul }),
          banner,
          h('dl', { class: 'k-info2' }, info.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: String(v) })])),
          x.tautan ? h('a', { class: 'k-sumber', href: x.tautan, target: '_blank', rel: 'noopener noreferrer', text: 'Buka halaman sumber' }) : null,
          bar, panel),
        viewer);
      pilih('deskripsi');
      dlg.oncancel = (e) => { if (!viewer.hidden) { e.preventDefault(); tutupViewer(); } };
      dlg.onkeydown = (e) => { if (viewer.hidden || !x.screenshots.length) return; if (e.key === 'ArrowLeft') tampilVw(idx - 1); else if (e.key === 'ArrowRight') tampilVw(idx + 1); };
      dlg.scrollTop = 0;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    }

    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value; f.tampil = PER_HAL; gambarDaftar(); }, 150); });
    gSel.addEventListener('change', () => { f.genre = gSel.value; f.tampil = PER_HAL; gambarDaftar(); });
    uSel.addEventListener('change', () => { f.urut = uSel.value; f.tampil = PER_HAL; gambarDaftar(); });
    dSel.addEventListener('change', () => { f.data = dSel.value; f.tampil = PER_HAL; gambarDaftar(); });

    const kapan = diperbarui ? new Date(diperbarui).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    app.replaceChildren(
      h('div', { class: 'k-head' }, h('h1', { text: 'Koleksi Game' }),
        h('p', { class: 'k-sub', text: `Database game di hardisk eksternal. Disinkronkan otomatis dari List Game.xlsx.${kapan ? ' Dimuat ' + kapan + '.' : ''}` })),
      h('div', { class: 'k-tools' }, q, gSel, dSel, uSel), chipBox, info, grid, lagi, dlg);
    chips(); gambarDaftar();
  }

  const tersimpan = baca(PW_KEY);
  if (!apiBase()) gerbang('Penghubung belum dipasang: isi apiUrl di config.js.');
  else if (tersimpan) { app.replaceChildren(h('p', { class: 'k-info', text: 'Memuat koleksi…' })); muat(tersimpan, true).then((r) => { if (!r.ok) gerbang(r.pesan); }); }
  else gerbang('');
})();
