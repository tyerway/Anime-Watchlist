(() => {
  const STATUS = {
    ditonton: 'Sedang Ditonton',
    rencana: 'Rencana',
    ditunda: 'Ditunda',
    selesai: 'Selesai',
    dihentikan: 'Dihentikan',
  };
  const ORDER = ['ditonton', 'rencana', 'ditunda', 'selesai', 'dihentikan'];
  const PW_KEY = 'anime-admin-pw';
  const apiBase = () => ((window.SITE_CONFIG || {}).apiUrl || '').trim().replace(/\/+$/, '');

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return e;
  }

  // Data dari Notion bisa punya kolom yang masih kosong; beri nilai bawaan agar tampilan tidak rusak.
  function items() {
    return (window.ANIME || []).map((a) => ({
      ...a,
      status: STATUS[a.status] ? a.status : 'rencana',
      ep: a.ep || 0,
      total: a.total ?? null,
      rating: a.rating ?? null,
      genre: a.genre || [],
      studio: a.studio || null,
      tipe: a.tipe || null,
      sinopsis: a.sinopsis || null,
    }));
  }

  // Ambil daftar langsung dari penghubung. Gagal -> pakai data.js (hasil sinkronisasi terakhir).
  async function loadData() {
    const api = apiBase();
    if (!api) return 'snapshot';
    try {
      const res = await fetch(api + '/api/anime', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data.items)) throw new Error('format');
      window.ANIME = data.items;
      window.ANIME_META = { sumber: 'langsung', diperbarui: data.diperbarui };
      return 'live';
    } catch {
      return 'fallback';
    }
  }

  // ---------- Komponen ----------
  function hue(text) {
    let n = 0;
    for (const c of text) n = (n * 31 + c.charCodeAt(0)) % 360;
    return n;
  }

  function poster(a) {
    const box = h('div', { class: 'poster', style: `--h:${hue(a.judul)}` });
    const initials = a.judul.split(/[\s:;]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    box.append(h('span', { class: 'poster-fallback', 'aria-hidden': 'true', text: initials }));
    if (a.cover) {
      const img = h('img', { src: a.cover, alt: 'Poster ' + a.judul, loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      box.append(img);
    }
    return box;
  }

  function facts(a) {
    return h('div', { class: 'facts' },
      a.tipe ? h('span', { text: a.tipe }) : null,
      a.tahun ? h('span', { text: String(a.tahun) }) : null,
      a.total ? h('span', { text: a.total + ' episode' }) : null,
      a.studio ? h('span', { text: a.studio }) : null);
  }

  function chipRow(genre) {
    return genre.length ? h('div', { class: 'chips' }, genre.map((g) => h('span', { class: 'chip', text: g }))) : null;
  }

  function progress(a) {
    const pct = a.total ? Math.min(100, Math.round((a.ep / a.total) * 100)) : 0;
    if (a.status === 'ditonton' || a.status === 'selesai') {
      return h('div', { class: 'prog' },
        h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
        h('span', { text: `Ep ${a.ep}${a.total ? ' / ' + a.total : ''}` }));
    }
    return h('div', { class: 'prog' }, h('span', { class: 'tag', text: STATUS[a.status] }));
  }

  function card(a) {
    return h('a', { class: 'card', href: 'anime.html?id=' + encodeURIComponent(a.id) },
      poster(a),
      h('div', { class: 'card-body' },
        h('h3', { text: a.judul }),
        facts(a),
        chipRow(a.genre),
        a.sinopsis ? h('p', { class: 'syn', text: a.sinopsis }) : null,
        progress(a)));
  }

  function header() {
    const page = document.body.dataset.page;
    const nav = [['index.html', 'Beranda', 'home'], ['daftar.html', 'Semua anime', 'list']];
    if (apiBase()) nav.push(['tambah.html', 'Tambah anime', 'add']);
    $('#top').append(h('div', { class: 'wrap top-in' },
      h('a', { class: 'logo', href: 'index.html', text: 'Watchlist Anime' }),
      h('nav', { 'aria-label': 'Utama' }, nav.map(([href, label, p]) =>
        h('a', { href, text: label, 'aria-current': (p === page || (page === 'detail' && p === 'list')) ? 'page' : null })))));
  }

  function footer(source) {
    const meta = window.ANIME_META || {};
    const when = meta.diperbarui
      ? new Date(meta.diperbarui).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : null;
    let note;
    if (source === 'live') {
      note = 'Data langsung dari Notion. Anime baru bisa ditambahkan di halaman Tambah anime.';
    } else if (source === 'fallback') {
      note = 'Tidak bisa menghubungi Notion saat ini. Yang tampil adalah data hasil sinkronisasi terakhir' + (when ? `, ${when}` : '') + '.';
    } else if (meta.sumber === 'notion' && when) {
      note = `Data dari Notion, terakhir disinkronkan ${when}. Untuk menambah atau mengubah anime, buka Notion.`;
    } else {
      note = 'Menampilkan data contoh. Setelah tersambung ke Notion, daftar ini diganti otomatis.';
    }
    document.body.append(h('footer', {}, h('div', { class: 'wrap' }, h('span', { text: note }))));
  }

  // ---------- Beranda ----------
  function home() {
    const app = $('#app');
    const all = items();
    const next = all.find((a) => a.status === 'ditonton') || all.find((a) => a.status === 'rencana');

    if (next) {
      const lede = next.status === 'ditonton'
        ? `Lanjutkan dari episode ${next.ep + 1}${next.total ? ' dari ' + next.total : ''}.`
        : 'Berikutnya di antreanmu' + [next.total ? next.total + ' episode' : null, next.studio ? 'oleh ' + next.studio : null].filter(Boolean).map((s, i) => (i ? ', ' : ': ') + s).join('') + '.';
      app.append(h('section', { class: 'wrap hero' },
        poster(next),
        h('div', {},
          h('h1', { text: next.judul }),
          h('p', { class: 'lede', text: lede }),
          next.sinopsis ? h('p', { class: 'syn-big', text: next.sinopsis }) : null,
          h('a', { class: 'btn primary', href: 'anime.html?id=' + encodeURIComponent(next.id), text: 'Buka detail' }))));
    }

    let shown = 0;
    for (const st of ['ditonton', 'rencana', 'selesai']) {
      const list = all.filter((a) => a.status === st);
      if (!list.length) continue;
      shown++;
      app.append(h('section', { class: 'wrap shelf' },
        h('div', { class: 'shelf-head' },
          h('h2', {}, STATUS[st], h('small', { text: String(list.length) })),
          list.length > 4 ? h('a', { href: 'daftar.html?status=' + st, text: 'Lihat semua' }) : null),
        h('div', { class: 'cards' }, list.slice(0, 4).map(card))));
    }
    if (!shown) {
      app.append(h('section', { class: 'wrap' },
        h('p', { class: 'empty', text: apiBase()
          ? 'Belum ada anime. Tambahkan lewat halaman Tambah anime.'
          : 'Belum ada anime. Tambahkan anime baru di database Notion, lalu tunggu sinkronisasi berikutnya.' })));
    }
  }

  // ---------- Daftar ----------
  function list() {
    const app = $('#app');
    const all = items();
    const params = new URLSearchParams(location.search);
    const startStatus = ORDER.includes(params.get('status')) ? params.get('status') : 'semua';
    const state = { q: '', status: startStatus, genre: 'semua', sort: 'judul' };

    const genres = [...new Set(all.flatMap((a) => a.genre))].sort();
    const out = h('div', { class: 'cards' });
    const count = h('p', { class: 'count', 'aria-live': 'polite' });
    const empty = h('p', { class: 'empty', text: 'Tidak ada anime yang cocok. Ubah filter atau kata kunci.' });

    const chipDefs = [['semua', 'Semua'], ...ORDER.map((s) => [s, STATUS[s]])];
    const chips = chipDefs.map(([value, label]) =>
      h('button', {
        type: 'button', class: 'chip', text: label, 'data-value': value,
        onclick: () => { state.status = value; draw(); },
      }));

    const search = h('input', { type: 'search', placeholder: 'Cari judul', 'aria-label': 'Cari judul', oninput: (e) => { state.q = e.target.value.trim(); draw(); } });
    const genreSel = h('select', { 'aria-label': 'Genre', onchange: (e) => { state.genre = e.target.value; draw(); } },
      h('option', { value: 'semua', text: 'Semua genre' }), genres.map((g) => h('option', { value: g, text: g })));
    const sortSel = h('select', { 'aria-label': 'Urutkan', onchange: (e) => { state.sort = e.target.value; draw(); } },
      h('option', { value: 'judul', text: 'Judul A-Z' }),
      h('option', { value: 'rating', text: 'Rating tertinggi' }),
      h('option', { value: 'progres', text: 'Progres terbanyak' }));

    function draw() {
      const r = all.filter((a) =>
        (state.status === 'semua' || a.status === state.status) &&
        (state.genre === 'semua' || a.genre.includes(state.genre)) &&
        a.judul.toLowerCase().includes(state.q.toLowerCase()));
      if (state.sort === 'judul') r.sort((a, b) => a.judul.localeCompare(b.judul));
      if (state.sort === 'rating') r.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      if (state.sort === 'progres') r.sort((a, b) => (b.total ? b.ep / b.total : 0) - (a.total ? a.ep / a.total : 0));
      out.replaceChildren(...r.map(card));
      empty.hidden = r.length > 0;
      count.textContent = `${r.length} dari ${all.length} anime`;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === state.status)));
    }

    app.append(h('section', { class: 'wrap page-head' }, h('h1', { text: 'Semua anime' })),
      h('section', { class: 'wrap' },
        h('div', { class: 'filters' },
          h('div', { class: 'filter-row' }, chips),
          h('div', { class: 'filter-row' }, search, genreSel, sortSel)),
        count, out, empty));
    draw();
  }

  // ---------- Detail ----------
  function detail() {
    const app = $('#app');
    const id = new URLSearchParams(location.search).get('id');
    const a = items().find((x) => x.id === id);

    if (!a) {
      app.append(h('section', { class: 'wrap' },
        h('a', { class: 'back', href: 'daftar.html', text: 'Kembali ke semua anime' }),
        h('p', { class: 'empty', text: 'Anime ini tidak ditemukan. Mungkin judulnya diubah atau sudah dihapus di Notion.' })));
      return;
    }
    document.title = a.judul + ' | Watchlist Anime';

    const ticks = a.total && a.total <= 100
      ? h('div', { class: 'ticks', role: 'img', 'aria-label': `${a.ep} dari ${a.total} episode sudah ditonton` },
          Array.from({ length: a.total }, (_, i) => h('span', { class: i < a.ep ? 'tick on' : 'tick' })))
      : null;

    app.append(h('section', { class: 'wrap' },
      h('a', { class: 'back', href: 'daftar.html', text: 'Kembali ke semua anime' }),
      h('div', { class: 'detail' },
        poster(a),
        h('div', {},
          h('h1', { text: a.judul }),
          h('div', { class: 'facts' },
            a.tipe ? h('span', { text: a.tipe }) : null,
            a.total ? h('span', { text: a.total + ' episode' }) : null,
            a.studio ? h('span', { text: a.studio }) : null,
            a.rating ? h('span', { text: 'Rating kamu ' + a.rating + '/10' }) : null),
          chipRow(a.genre),
          h('p', { class: a.sinopsis ? 'syn-full' : 'syn-full muted', text: a.sinopsis || 'Belum ada sinopsis. Isi kolom Sinopsis di Notion.' }),
          h('div', { class: 'panel' },
            h('h2', { text: STATUS[a.status] }),
            h('p', { class: 'big-count' }, String(a.ep), h('span', { text: a.total ? ' / ' + a.total + ' episode' : ' episode' })),
            ticks,
            h('p', { class: 'note', text: 'Progres diubah lewat Notion dan muncul di sini setelah data dimuat ulang.' })),
          a.mal ? h('a', { class: 'btn', href: a.mal, target: '_blank', rel: 'noopener', text: 'Buka di MyAnimeList' }) : null))));
  }

  // ---------- Tambah anime ----------
  // Pencarian lewat penghubung (server yang memanggil Jikan), bukan langsung dari browser.
  async function searchAnime(query, api, password) {
    let res;
    try {
      res = await fetch(api + '/api/cari?q=' + encodeURIComponent(query), { headers: { 'X-Admin-Password': password } });
    } catch {
      throw new Error('Tidak bisa terhubung ke penghubung. Periksa apiUrl di config.js dan koneksi internetmu.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Pencarian gagal (kode ${res.status}).`);
    return data.results || [];
  }

  function add() {
    const app = $('#app');
    const api = apiBase();

    if (!api) {
      app.append(h('section', { class: 'wrap page-head' },
        h('h1', { text: 'Tambah anime' }),
        h('p', { class: 'empty', text: 'Fitur ini belum aktif. Pasang penghubung Cloudflare (lihat README), lalu isi apiUrl di config.js.' })));
      return;
    }

    const say = h('p', { class: 'msg', role: 'status' });
    const notify = (text, kind = '') => { say.textContent = text; say.className = ('msg ' + kind).trim(); };

    let saved = '';
    try { saved = localStorage.getItem(PW_KEY) || ''; } catch { /* penyimpanan diblokir */ }
    const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', value: saved });
    const remember = h('input', { type: 'checkbox', id: 'remember', checked: saved ? true : null });
    const status = h('select', { id: 'status' },
      h('option', { value: 'rencana', text: 'Rencana' }),
      h('option', { value: 'ditonton', text: 'Sedang Ditonton' }));

    const field = (label, input) => h('label', { class: 'field' }, h('span', { text: label }), input);

    async function post(payload) {
      let res;
      try {
        res = await fetch(api + '/api/anime', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw.value },
          body: JSON.stringify(payload),
        });
      } catch {
        throw new Error('Tidak bisa terhubung ke penghubung. Periksa apiUrl di config.js dan koneksi internetmu.');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(data.error || `Gagal menambah (kode ${res.status}).`);
        e.status = res.status;
        throw e;
      }
      return data;
    }

    async function send(payload, btn) {
      if (!pw.value) { notify('Isi kata sandi dulu.', 'err'); pw.focus(); return false; }
      if (btn) { btn.disabled = true; btn.textContent = 'Menambah...'; }
      try {
        await post(payload);
        try {
          if (remember.checked) localStorage.setItem(PW_KEY, pw.value);
          else localStorage.removeItem(PW_KEY);
        } catch { /* abaikan */ }
        notify(`"${payload.judul}" sudah ditambahkan ke Notion.`, 'ok');
        if (btn) btn.textContent = 'Ditambahkan';
        await loadData();
        return true;
      } catch (err) {
        if (btn) {
          const dup = err.status === 409;
          btn.disabled = dup;
          btn.textContent = dup ? 'Sudah ada' : 'Tambah';
        }
        notify(err.message, 'err');
        return false;
      }
    }

    // --- Pencarian MyAnimeList ---
    const results = h('div', { class: 'results' });
    const q = h('input', { type: 'search', id: 'q', placeholder: 'Ketik judul anime', autocomplete: 'off' });
    const existingIds = () => new Set(items().map((a) => ((a.mal || '').match(/anime\/(\d+)/) || [])[1]).filter(Boolean));

    function renderResults(list) {
      const have = existingIds();
      results.replaceChildren(...list.map((r) => {
        const already = have.has(String(r.malId));
        const btn = h('button', { type: 'button', class: 'btn primary', text: already ? 'Sudah ada' : 'Tambah', disabled: already ? true : null });
        btn.addEventListener('click', () => send({
          judul: r.judul, status: status.value, total: r.total, genre: r.genre, studio: r.studio,
          tipe: r.tipe, sinopsis: r.sinopsis, mal: `https://myanimelist.net/anime/${r.malId}`, cover: r.cover,
        }, btn));
        return h('div', { class: 'card result' },
          poster({ judul: r.judul, cover: r.cover }),
          h('div', { class: 'card-body' },
            h('h3', { text: r.judul }),
            facts(r),
            chipRow(r.genre),
            r.sinopsis ? h('p', { class: 'syn', text: r.sinopsis }) : null,
            h('div', { class: 'prog' }, btn)));
      }));
    }

    async function doSearch() {
      const term = q.value.trim();
      if (term.length < 2) { notify('Ketik minimal 2 huruf untuk mencari.', 'err'); return; }
      notify('Mencari di MyAnimeList...');
      results.replaceChildren();
      try {
        const list = await searchAnime(term, api, pw.value);
        notify(list.length ? '' : 'Tidak ada hasil. Coba judul lain atau tambah manual di bawah.');
        renderResults(list);
      } catch (err) {
        notify(err.message, 'err');
      }
    }
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

    // --- Tambah manual ---
    const m = {
      judul: h('input', { type: 'text', id: 'm-judul', maxlength: '300', required: true }),
      total: h('input', { type: 'number', id: 'm-total', min: '0', max: '9999' }),
      cover: h('input', { type: 'url', id: 'm-cover', placeholder: 'https://' }),
      sinopsis: h('textarea', { id: 'm-sinopsis', rows: '3', maxlength: '2000' }),
    };
    const manual = h('form', { class: 'manual' },
      field('Judul', m.judul),
      field('Total episode (boleh kosong)', m.total),
      field('Alamat gambar poster (boleh kosong)', m.cover),
      field('Sinopsis (boleh kosong)', m.sinopsis),
      h('button', { type: 'submit', class: 'btn primary', text: 'Tambah' }));
    manual.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await send({
        judul: m.judul.value, status: status.value,
        total: m.total.value === '' ? null : m.total.value,
        cover: m.cover.value.trim() || null, sinopsis: m.sinopsis.value.trim() || null,
      }, null);
      if (ok) manual.reset();
    });

    app.append(
      h('section', { class: 'wrap page-head' }, h('h1', { text: 'Tambah anime' })),
      h('section', { class: 'wrap add' },
        h('div', { class: 'panel' },
          h('div', { class: 'add-row' },
            field('Kata sandi', pw),
            field('Status awal', status)),
          h('label', { class: 'check', for: 'remember' }, remember, 'Ingat kata sandi di perangkat ini')),
        h('div', { class: 'panel' },
          h('div', { class: 'add-search' },
            h('label', { class: 'field grow', for: 'q' }, h('span', { text: 'Cari di MyAnimeList' }), q),
            h('button', { type: 'button', class: 'btn primary', text: 'Cari', onclick: doSearch }))),
        say,
        results,
        h('details', { class: 'panel' }, h('summary', { text: 'Tidak ketemu? Tambah manual' }), manual)));
  }

  // ---------- Mulai ----------
  async function start() {
    header();
    const page = document.body.dataset.page;
    const app = $('#app');
    let source = 'snapshot';

    if (apiBase()) {
      const loading = h('section', { class: 'wrap' }, h('p', { class: 'empty', role: 'status', text: 'Memuat daftar dari Notion...' }));
      app.append(loading);
      source = await loadData();
      loading.remove();
    }
    footer(source);

    if (page === 'home') home();
    else if (page === 'list') list();
    else if (page === 'detail') detail();
    else if (page === 'add') add();
  }
  start();
})();
