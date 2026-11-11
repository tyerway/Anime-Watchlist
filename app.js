(() => {
  const STATUS = {
    ditonton: 'Sedang Ditonton',
    rencana: 'Rencana',
    ditunda: 'Ditunda',
    selesai: 'Selesai',
    dihentikan: 'Dihentikan',
  };
  const ORDER = ['ditonton', 'rencana', 'ditunda', 'selesai', 'dihentikan'];
  const JENIS = { anime: 'Anime', film: 'Film', serial: 'Serial Drama', game: 'Game' };
  const PLATFORM = ['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP', 'PS Vita', 'PC', 'Switch', 'Xbox', 'Mobile', 'Lainnya'];
  const hasEpisodes = (a) => a.jenis === 'anime' || a.jenis === 'serial';   // film dan game: hanya status
  // Game memakai kata sendiri untuk status.
  const statusLabel = (st, jenis) => (jenis === 'game' ? { ditonton: 'Sedang Dimainkan', selesai: 'Tamat' }[st] : null) || STATUS[st];
  const ASAL = ['Barat', 'Jepang', 'Korea', 'Lainnya'];
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
      jenis: JENIS[a.jenis] ? a.jenis : 'anime',
      asal: a.asal || null,
      platform: a.platform || null,
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

  // Poster TMDB/IGDB/Steam dimuat lewat penghubung, karena sebagian jaringan memblokir situs gambarnya.
  function coverSrc(u) {
    const base = apiBase();
    if (base && /^https:\/\/(image\.tmdb\.org|images\.igdb\.com|[\w.]+\.steamstatic\.com|media\.rawg\.io)\//.test(u)) {
      return base + '/api/gambar?u=' + encodeURIComponent(u);
    }
    return u;
  }

  function poster(a) {
    const box = h('div', { class: 'poster', style: `--h:${hue(a.judul)}` });
    const initials = a.judul.split(/[\s:;]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    box.append(h('span', { class: 'poster-fallback', 'aria-hidden': 'true', text: initials }));
    if (a.cover) {
      const img = h('img', { src: coverSrc(a.cover), alt: 'Poster ' + a.judul, loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      box.append(img);
    }
    return box;
  }

  function facts(a, extra = []) {
    const jenis = JENIS[a.jenis] ? a.jenis : 'anime';
    return h('div', { class: 'facts' },
      h('span', { class: 'jenis', text: JENIS[jenis] }),
      a.asal && jenis !== 'game' && !(jenis === 'anime' && a.asal === 'Jepang') ? h('span', { text: a.asal }) : null,
      jenis === 'game' && a.platform ? h('span', { text: a.platform }) : null,
      jenis === 'anime' && a.tipe ? h('span', { text: a.tipe }) : null,
      a.tahun ? h('span', { text: String(a.tahun) }) : null,
      (jenis === 'anime' || jenis === 'serial') && a.total ? h('span', { text: a.total + ' episode' }) : null,
      a.studio ? h('span', { text: a.studio }) : null,
      extra);
  }

  function chipRow(genre) {
    return genre.length ? h('div', { class: 'chips' }, genre.map((g) => h('span', { class: 'chip', text: g }))) : null;
  }

  function progress(a) {
    const pct = a.total ? Math.min(100, Math.round((a.ep / a.total) * 100)) : 0;
    if ((a.status === 'ditonton' || a.status === 'selesai') && hasEpisodes(a)) {
      return h('div', { class: 'prog' },
        h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
        h('span', { text: `Ep ${a.ep}${a.total ? ' / ' + a.total : ''}` }));
    }
    return h('div', { class: 'prog' }, h('span', { class: 'tag', text: statusLabel(a.status, a.jenis) }));
  }

  // Jadwal rilis berikutnya (diisi otomatis oleh penghubung). Disembunyikan jika sudah lewat.
  // Tanggal rilis berikutnya sebagai {d, jam}; null jika kosong atau sudah lewat.
  function rilisDate(a) {
    if (!a.rilis) return null;
    const jam = a.rilis.length > 10;
    const d = new Date(jam ? a.rilis : a.rilis + 'T00:00:00+07:00');
    if (Number.isNaN(d.getTime())) return null;
    if (d.getTime() < Date.now() - (jam ? 3 * 3600e3 : 0) - (jam ? 0 : 86400e3 - 1)) return null;
    return { d, jam };
  }

  function rilisInfo(a) {
    const r = rilisDate(a);
    if (!r) return null;
    const opsi = r.jam ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    const teks = new Intl.DateTimeFormat('id-ID', { ...opsi, timeZone: 'Asia/Jakarta' }).format(r.d) + (r.jam ? ' WIB' : '');
    return h('p', { class: 'rilis', text: '🗓 ' + teks + (a.infoRilis ? ' · ' + a.infoRilis : '') });
  }

  function card(a) {
    return h('a', { class: 'card', href: 'anime.html?id=' + encodeURIComponent(a.id) },
      poster(a),
      h('div', { class: 'card-body' },
        h('h3', { text: a.judul }),
        facts(a),
        rilisInfo(a),
        chipRow(a.genre),
        a.sinopsis ? h('p', { class: 'syn', text: a.sinopsis }) : null,
        progress(a)));
  }

  function header() {
    const page = document.body.dataset.page;
    const jenisParam = new URLSearchParams(location.search).get('jenis');
    const nav = [
      ['index.html', 'Beranda', 'home'],
      ['daftar.html', 'Semua', 'list:semua'],
      ['daftar.html?jenis=anime', 'Anime', 'list:anime'],
      ['daftar.html?jenis=film', 'Film', 'list:film'],
      ['daftar.html?jenis=serial', 'Drama', 'list:serial'],
      ['daftar.html?jenis=game', 'Game', 'list:game'],
    ];
    if (apiBase()) nav.push(['tambah.html', 'Tambah', 'add']);
    const current = page === 'list' ? 'list:' + (JENIS[jenisParam] ? jenisParam : 'semua')
      : page === 'detail' ? 'list:semua' : page;
    $('#top').append(h('div', { class: 'wrap top-in' },
      h('a', { class: 'logo', href: 'index.html', text: 'Watchlist' }),
      h('nav', { 'aria-label': 'Utama' }, nav.map(([href, label, p]) =>
        h('a', { href, text: label, 'aria-current': p === current ? 'page' : null })))));
  }

  function footer(source) {
    const meta = window.ANIME_META || {};
    const when = meta.diperbarui
      ? new Date(meta.diperbarui).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : null;
    let note;
    if (source === 'live') {
      note = 'Data langsung dari Notion. Judul baru bisa ditambahkan di halaman Tambah.';
    } else if (source === 'fallback') {
      note = 'Tidak bisa menghubungi Notion saat ini. Yang tampil adalah data hasil sinkronisasi terakhir' + (when ? `, ${when}` : '') + '.';
    } else if (meta.sumber === 'notion' && when) {
      note = `Data dari Notion, terakhir disinkronkan ${when}. Untuk menambah atau mengubah judul, buka Notion.`;
    } else {
      note = 'Menampilkan data contoh. Setelah tersambung ke Notion, daftar ini diganti otomatis.';
    }
    const tmdb = (window.ANIME || []).some((a) => /themoviedb\.org/.test(a.mal || ''));
    const rawgUsed = (window.ANIME || []).some((a) => /rawg\.io/.test(a.mal || ''));
    const igdbUsed = (window.ANIME || []).some((a) => /igdb\.com/.test(a.mal || ''));
    const steamUsed = (window.ANIME || []).some((a) => /steampowered\.com/.test(a.mal || ''));
    document.body.append(h('footer', {}, h('div', { class: 'wrap' },
      h('span', { text: note }),
      tmdb ? h('span', { text: 'Data film dan serial dari TMDB. Situs ini memakai API TMDB tetapi tidak didukung atau disertifikasi oleh TMDB.' }) : null,
      rawgUsed ? h('span', {}, 'Data game dari ', h('a', { href: 'https://rawg.io', target: '_blank', rel: 'noopener', text: 'RAWG' }), '.') : null,
      igdbUsed ? h('span', {}, 'Data game dari ', h('a', { href: 'https://www.igdb.com', target: '_blank', rel: 'noopener', text: 'IGDB' }), '.') : null,
      steamUsed ? h('span', {}, 'Data game dari ', h('a', { href: 'https://store.steampowered.com', target: '_blank', rel: 'noopener', text: 'Steam' }), '.') : null)));
  }

  // ---------- Beranda ----------
  const JENIS_PENDEK = { anime: 'Anime', film: 'Film', serial: 'Drama', game: 'Game' };
  const acak = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const hariWib = (d) => Math.floor((d.getTime() + 7 * 3600e3) / 86400e3);
  const link = (a) => 'anime.html?id=' + encodeURIComponent(a.id);

  function home() {
    const app = $('#app');
    const all = items();
    if (!all.length) {
      app.append(h('section', { class: 'wrap' },
        h('p', { class: 'empty', text: apiBase()
          ? 'Belum ada judul. Tambahkan lewat halaman Tambah.'
          : 'Belum ada judul. Tambahkan judul baru di database Notion, lalu tunggu sinkronisasi berikutnya.' })));
      return;
    }
    const next = all.find((a) => a.status === 'ditonton') || all.find((a) => a.status === 'rencana') || all[all.length - 1];
    let filter = 'semua';
    let pertama = true;
    let urut = [];
    let idx = 0;

    // --- bilah filter ---
    const hitung = { semua: all.length };
    for (const k of Object.keys(JENIS_PENDEK)) hitung[k] = all.filter((a) => a.jenis === k).length;
    const chipEls = {};
    const bar = h('div', { class: 'wrap wall-bar' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter jenis' },
        ['semua', ...Object.keys(JENIS_PENDEK)].filter((k) => k === 'semua' || hitung[k]).map((k) => {
          chipEls[k] = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(k === filter), onclick: () => { filter = k; susun(); } },
            (k === 'semua' ? 'Semua' : JENIS_PENDEK[k]) + ' ', h('small', { text: String(hitung[k]) }));
          return chipEls[k];
        })),
      h('button', { type: 'button', class: 'btn quiet', onclick: () => susun(), text: 'Acak ulang' }));

    // --- deretan poster besar (bertumpuk, bisa digeser) ---
    const deck = h('div', { class: 'deck', tabindex: '0', role: 'group', 'aria-roledescription': 'carousel', 'aria-label': 'Poster koleksi. Pakai panah kiri dan kanan untuk berpindah.' });
    const hitungEl = h('p', { class: 'deck-count', 'aria-hidden': 'true' });
    const prevBtn = h('button', { type: 'button', class: 'deck-nav prev', 'aria-label': 'Poster sebelumnya', onclick: () => geser(-1) });
    const nextBtn = h('button', { type: 'button', class: 'deck-nav next', 'aria-label': 'Poster berikutnya', onclick: () => geser(1) });
    const cap = h('section', { class: 'wrap cap', 'aria-live': 'polite' });

    function tampil(a) {
      let status;
      if (a.status === 'ditonton' && a.jenis === 'game') status = `Sedang dimainkan${a.platform ? ' di ' + a.platform : ''}.`;
      else if (a.status === 'ditonton' && hasEpisodes(a)) status = `Lanjutkan dari episode ${a.ep + 1}${a.total ? ' dari ' + a.total : ''}.`;
      else if (a.status === 'selesai') status = a.jenis === 'game' ? 'Sudah tamat.' : 'Sudah selesai.';
      else status = statusLabel(a.status, a.jenis) + '.';
      cap.replaceChildren(
        h('div', { class: 'cap-main' },
          h('h1', { text: a.judul }),
          facts(a),
          h('p', { class: 'cap-status', text: status }),
          rilisInfo(a)),
        h('div', { class: 'cap-side' },
          a.sinopsis ? h('p', { class: 'cap-syn', text: a.sinopsis }) : null,
          h('a', { class: 'btn primary', href: link(a), text: 'Buka detail' })));
    }

    // Posisi tiap poster relatif ke yang di tengah: -2 -1 0 1 2 (melingkar).
    function atur() {
      const n = urut.length;
      [...deck.children].forEach((el, i) => {
        let d = (((i - idx) % n) + n) % n;
        if (d > n / 2) d -= n;
        const j = Math.abs(d);
        el.style.setProperty('--d', d);
        el.style.setProperty('--a', Math.min(j, 3));
        el.style.zIndex = String(50 - j);
        el.classList.toggle('on', d === 0);
        el.classList.toggle('far', j > 2);
        el.tabIndex = d === 0 ? 0 : -1;
        el.setAttribute('aria-hidden', j > 2 ? 'true' : 'false');
      });
      tampil(urut[idx]);
      hitungEl.textContent = `${idx + 1} dari ${n}`;
      prevBtn.hidden = nextBtn.hidden = n < 2;
    }
    function geser(k) { idx = (idx + k + urut.length) % urut.length; atur(); }

    function susun() {
      for (const [k, el] of Object.entries(chipEls)) el.setAttribute('aria-pressed', String(k === filter));
      const list = filter === 'semua' ? all : all.filter((a) => a.jenis === filter);
      urut = [...(list.includes(next) ? [next] : []), ...acak(list.filter((a) => a !== next))].slice(0, 30);
      idx = 0;
      deck.classList.toggle('reveal', pertama);
      pertama = false;
      deck.replaceChildren(...urut.map((a, i) => h('button', {
        type: 'button',
        class: `deck-card j-${a.jenis}`,
        'aria-label': `${a.judul}, ${JENIS[a.jenis] || 'Anime'}, ${statusLabel(a.status, a.jenis)}`,
        onclick: () => { if (i === idx) location.href = link(a); else { idx = i; atur(); } },
      }, poster(a), a.status === 'ditonton' ? h('i', { class: 'tile-live', title: statusLabel(a.status, a.jenis) }) : null)));
      atur();
    }

    deck.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); geser(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); geser(1); }
    });
    let sentuhX = null;
    deck.addEventListener('pointerdown', (e) => { sentuhX = e.clientX; deck._geser = false; });
    deck.addEventListener('pointerup', (e) => {
      if (sentuhX == null) return;
      const dx = e.clientX - sentuhX; sentuhX = null;
      if (Math.abs(dx) > 45) { deck._geser = true; geser(dx < 0 ? 1 : -1); } // klik yang menyusul geseran diabaikan
    });
    deck.addEventListener('click', (e) => { if (deck._geser) { deck._geser = false; e.stopPropagation(); e.preventDefault(); } }, true);

    app.append(bar, h('div', { class: 'wrap deck-wrap' }, deck, prevBtn, nextBtn, hitungEl), cap);
    susun();

    // --- baru ditambahkan (urutan database = urutan ditambahkan) ---
    const baru = all.slice(-10).reverse();
    app.append(h('section', { class: 'wrap shelf' },
      h('div', { class: 'shelf-head' }, h('h2', {}, 'Baru ditambahkan'), h('a', { href: 'daftar.html', text: 'Lihat semua' })),
      h('div', { class: 'strip' }, baru.map((a) =>
        h('a', { class: 'mini', href: link(a) },
          poster(a),
          h('b', { text: a.judul }),
          h('span', { text: `${JENIS_PENDEK[a.jenis] || 'Anime'} · ${statusLabel(a.status, a.jenis)}` }))))));

    // --- segera tayang ---
    const hariIni = hariWib(new Date());
    const segera = all.map((a) => ({ a, r: rilisDate(a) })).filter((x) => x.r).sort((x, y) => x.r.d - y.r.d).slice(0, 6);
    if (segera.length) {
      const bln = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' });
      const tgl = new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: 'Asia/Jakarta' });
      const jamF = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      app.append(h('section', { class: 'wrap shelf' },
        h('div', { class: 'shelf-head' }, h('h2', {}, 'Segera tayang')),
        h('ul', { class: 'agenda' }, segera.map(({ a, r }) => {
          const sel = hariWib(r.d) - hariIni;
          const kapan = sel <= 0 ? 'Hari ini' : sel === 1 ? 'Besok' : `${sel} hari lagi`;
          return h('li', {}, h('a', { href: link(a) },
            h('div', { class: 'ag-date' }, h('b', { text: tgl.format(r.d) }), h('span', { text: bln.format(r.d) })),
            h('div', { class: 'ag-poster' }, poster(a)),
            h('div', { class: 'ag-body' },
              h('strong', { text: a.judul }),
              h('span', { text: [JENIS_PENDEK[a.jenis] || 'Anime', a.infoRilis].filter(Boolean).join(' · ') })),
            h('div', { class: 'ag-when' }, kapan, r.jam ? h('small', { text: jamF.format(r.d).replace('.', ':') + ' WIB' }) : null)));
        }))));
    }

    // --- rak per status ---
    for (const st of ['ditonton', 'rencana', 'selesai']) {
      const list = all.filter((a) => a.status === st);
      if (!list.length) continue;
      app.append(h('section', { class: 'wrap shelf' },
        h('div', { class: 'shelf-head' },
          h('h2', {}, STATUS[st], h('small', { text: String(list.length) })),
          list.length > 4 ? h('a', { href: 'daftar.html?status=' + st, text: 'Lihat semua' }) : null),
        h('div', { class: 'cards' }, list.slice(0, 4).map(card))));
    }
  }

  // ---------- Daftar ----------
  function list() {
    const app = $('#app');
    const everything = items();
    const params = new URLSearchParams(location.search);
    const startStatus = ORDER.includes(params.get('status')) ? params.get('status') : 'semua';
    const jenis = JENIS[params.get('jenis')] ? params.get('jenis') : 'semua';
    const state = { q: '', status: startStatus, genre: 'semua', asal: 'semua', sort: 'judul' };
    const all = jenis === 'semua' ? everything : everything.filter((a) => a.jenis === jenis);
    const heading = jenis === 'semua' ? 'Semua judul' : JENIS[jenis];
    document.title = heading + ' | Watchlist';

    const genres = [...new Set(all.flatMap((a) => a.genre))].sort();
    const byPlatform = jenis === 'game';   // game difilter per platform, bukan asal
    const asalAda = byPlatform ? PLATFORM.filter((x) => all.some((a) => a.platform === x)) : ASAL.filter((x) => all.some((a) => a.asal === x));
    const out = h('div', { class: 'cards' });
    const count = h('p', { class: 'count', 'aria-live': 'polite' });
    const empty = h('p', { class: 'empty', text: 'Tidak ada judul yang cocok. Ubah filter atau kata kunci.' });

    const chipDefs = [['semua', 'Semua'], ...ORDER.map((s) => [s, statusLabel(s, jenis)])];
    const chips = chipDefs.map(([value, label]) =>
      h('button', {
        type: 'button', class: 'chip', text: label, 'data-value': value,
        onclick: () => { state.status = value; draw(); },
      }));

    const search = h('input', { type: 'search', placeholder: 'Cari judul', 'aria-label': 'Cari judul', oninput: (e) => { state.q = e.target.value.trim(); draw(); } });
    const genreSel = h('select', { 'aria-label': 'Genre', onchange: (e) => { state.genre = e.target.value; draw(); } },
      h('option', { value: 'semua', text: 'Semua genre' }), genres.map((g) => h('option', { value: g, text: g })));
    const asalSel = h('select', { 'aria-label': byPlatform ? 'Platform' : 'Asal', onchange: (e) => { state.asal = e.target.value; draw(); } },
      h('option', { value: 'semua', text: byPlatform ? 'Semua platform' : 'Semua asal' }), asalAda.map((x) => h('option', { value: x, text: x })));
    const sortSel = h('select', { 'aria-label': 'Urutkan', onchange: (e) => { state.sort = e.target.value; draw(); } },
      h('option', { value: 'judul', text: 'Judul A-Z' }),
      h('option', { value: 'rating', text: 'Rating tertinggi' }),
      h('option', { value: 'progres', text: 'Progres terbanyak' }));

    function draw() {
      const r = all.filter((a) =>
        (state.status === 'semua' || a.status === state.status) &&
        (state.genre === 'semua' || a.genre.includes(state.genre)) &&
        (state.asal === 'semua' || (byPlatform ? a.platform : a.asal) === state.asal) &&
        a.judul.toLowerCase().includes(state.q.toLowerCase()));
      if (state.sort === 'judul') r.sort((a, b) => a.judul.localeCompare(b.judul));
      if (state.sort === 'rating') r.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      if (state.sort === 'progres') r.sort((a, b) => (b.total ? b.ep / b.total : 0) - (a.total ? a.ep / a.total : 0));
      out.replaceChildren(...r.map(card));
      empty.hidden = r.length > 0;
      count.textContent = `${r.length} dari ${all.length} judul`;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === state.status)));
    }

    app.append(h('section', { class: 'wrap page-head' }, h('h1', { text: heading })),
      h('section', { class: 'wrap' },
        h('div', { class: 'filters' },
          h('div', { class: 'filter-row' }, chips),
          h('div', { class: 'filter-row' }, search, genreSel, asalSel, sortSel)),
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
        h('a', { class: 'back', href: 'daftar.html', text: 'Kembali ke daftar' }),
        h('p', { class: 'empty', text: 'Judul ini tidak ditemukan. Mungkin diubah atau sudah dihapus di Notion.' })));
      return;
    }
    document.title = a.judul + ' | Watchlist';

    const api = apiBase();
    const canEdit = !!(api && a.notionId);
    const isFilm = !hasEpisodes(a);   // film dan game: hanya status, tanpa episode

    const panel = h('div', { class: 'panel' });
    const say = h('p', { class: 'msg', role: 'status' });
    const notify = (text, kind = '') => { say.textContent = text; say.className = ('msg ' + kind).trim(); };

    let saved = '';
    try { saved = localStorage.getItem(PW_KEY) || ''; } catch { /* penyimpanan diblokir */ }
    const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', value: saved });
    const remember = h('input', { type: 'checkbox', id: 'remember', checked: saved ? true : null });
    let busy = false;

    // Status ikut menyesuaikan progres, supaya tidak perlu diubah manual di Notion.
    function statusFor(ep) {
      if (a.total && ep >= a.total) return 'selesai';
      if (ep > 0 && (a.status === 'rencana' || a.status === 'selesai')) return 'ditonton';
      return a.status;
    }

    // Kirim perubahan ke penghubung (PATCH). `patch` berisi ep dan/atau status.
    async function save(patch) {
      if (busy) return;
      if (!pw.value) { notify('Isi kata sandi dulu untuk mengubah data.', 'err'); pw.focus(); return; }
      busy = true; draw(); notify('Menyimpan ke Notion...');
      try {
        let res;
        try {
          res = await fetch(api + '/api/anime', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw.value },
            body: JSON.stringify({ notionId: a.notionId, ...patch }),
          });
        } catch {
          throw new Error('Tidak bisa terhubung ke penghubung. Periksa koneksi internetmu.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Gagal menyimpan (kode ${res.status}).`);
        a.ep = data.item.ep; a.status = data.item.status;
        const src = (window.ANIME || []).find((x) => x.notionId === a.notionId);
        if (src) { src.ep = a.ep; src.status = a.status; }
        rememberPw();
        notify(a.status === 'selesai' ? (a.jenis === 'game' ? 'Tersimpan. Tamat!' : 'Tersimpan. Selesai ditonton!') : isFilm ? `Tersimpan: ${statusLabel(a.status, a.jenis)}.` : `Tersimpan: ${STATUS[a.status]}, episode ${a.ep}.`, 'ok');
      } catch (err) {
        notify(err.message, 'err');
      } finally {
        busy = false; draw();
      }
    }

    function rememberPw() {
      try {
        if (remember.checked) localStorage.setItem(PW_KEY, pw.value);
        else localStorage.removeItem(PW_KEY);
      } catch { /* abaikan */ }
    }

    function setProgress(target) {
      const ep = Math.max(0, a.total ? Math.min(a.total, target) : target);
      if (ep === a.ep) return;
      save({ ep, status: statusFor(ep) });
    }

    // Pilih status sendiri (mis. Ditunda, Dihentikan). "Selesai" sekalian menandai semua episode.
    function setStatus(status) {
      if (status === a.status) return;
      save(status === 'selesai' && a.total ? { status, ep: a.total } : { status });
    }

    async function removeAnime() {
      if (busy) return;
      if (!pw.value) { notify('Isi kata sandi dulu untuk menghapus.', 'err'); pw.focus(); return; }
      if (!window.confirm(`Hapus "${a.judul}" dari daftar?\n\nJudul ini dipindahkan ke tempat sampah Notion, jadi masih bisa dipulihkan dari sana.`)) return;
      busy = true; draw(); notify('Menghapus...');
      try {
        let res;
        try {
          res = await fetch(api + '/api/anime', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw.value },
            body: JSON.stringify({ notionId: a.notionId }),
          });
        } catch {
          throw new Error('Tidak bisa terhubung ke penghubung. Periksa koneksi internetmu.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Gagal menghapus (kode ${res.status}).`);
        rememberPw();
        window.ANIME = (window.ANIME || []).filter((x) => x.notionId !== a.notionId);
        location.href = 'daftar.html';
      } catch (err) {
        busy = false; draw(); notify(err.message, 'err');
      }
    }

    function draw() {
      const ticks = !isFilm && a.total && a.total <= 100
        ? h('div', canEdit
            ? { class: 'ticks', role: 'group', 'aria-label': 'Pilih episode terakhir yang sudah ditonton' }
            : { class: 'ticks', role: 'img', 'aria-label': `${a.ep} dari ${a.total} episode sudah ditonton` },
          Array.from({ length: a.total }, (_, i) => {
            const n = i + 1;
            const cls = n <= a.ep ? 'tick on' : 'tick';
            if (!canEdit) return h('span', { class: cls });
            return h('button', {
              type: 'button', class: cls, disabled: busy ? true : null,
              title: `Episode ${n}`, 'aria-label': n === a.ep ? `Batalkan episode ${n}` : `Tandai sampai episode ${n}`,
              onclick: () => setProgress(n === a.ep ? n - 1 : n),
            });
          }))
        : null;

      const controls = canEdit && !isFilm ? h('div', { class: 'controls' },
        h('button', { type: 'button', class: 'btn', disabled: busy || a.ep <= 0 ? true : null, text: '\u22121 episode', onclick: () => setProgress(a.ep - 1) }),
        h('button', { type: 'button', class: 'btn primary', disabled: busy || (a.total && a.ep >= a.total) ? true : null, text: '+1 episode', onclick: () => setProgress(a.ep + 1) })) : null;

      const statusRow = canEdit ? h('label', { class: 'field status-set', for: 'status-set' },
        h('span', { text: 'Status' }),
        h('select', { id: 'status-set', disabled: busy ? true : null, onchange: (e) => setStatus(e.target.value) },
          Object.keys(STATUS).map((k) => h('option', { value: k, text: statusLabel(k, a.jenis), selected: k === a.status ? true : null })))) : null;

      const pwRow = canEdit ? h('div', { class: 'progress-pw' },
        h('label', { class: 'field', for: 'pw' }, h('span', { text: 'Kata sandi (untuk mengubah atau menghapus)' }), pw),
        h('label', { class: 'check', for: 'remember' }, remember, h('span', { text: 'Ingat kata sandi di perangkat ini' }))) : null;

      const removeRow = canEdit ? h('div', { class: 'danger-zone' },
        h('button', { type: 'button', class: 'btn danger', disabled: busy ? true : null, text: 'Hapus dari daftar', onclick: removeAnime })) : null;

      panel.replaceChildren(...[
        h('h2', { text: statusLabel(a.status, a.jenis) }),
        isFilm ? null : h('p', { class: 'big-count' }, String(a.ep), h('span', { text: a.total ? ' / ' + a.total + ' episode' : ' episode' })),
        ticks, controls, statusRow,
        canEdit ? say : null,
        pwRow, removeRow,
        canEdit ? null : h('p', { class: 'note', text: 'Data diubah lewat Notion dan muncul di sini setelah data dimuat ulang.' }),
      ].filter(Boolean));
    }
    draw();

    app.append(h('section', { class: 'wrap' },
      h('a', { class: 'back', href: 'daftar.html', text: 'Kembali ke daftar' }),
      h('div', { class: 'detail' },
        poster(a),
        h('div', {},
          h('h1', { text: a.judul }),
          facts(a, a.rating ? h('span', { text: 'Rating kamu ' + a.rating + '/10' }) : null),
          rilisInfo(a),
          chipRow(a.genre),
          h('p', { class: a.sinopsis ? 'syn-full' : 'syn-full muted', text: a.sinopsis || 'Belum ada sinopsis. Isi kolom Sinopsis di Notion.' }),
          panel,
          a.mal ? h('a', { class: 'btn', href: a.mal, target: '_blank', rel: 'noopener', text: /themoviedb\.org/.test(a.mal) ? 'Buka di TMDB' : /rawg\.io/.test(a.mal) ? 'Buka di RAWG' : /igdb\.com/.test(a.mal) ? 'Buka di IGDB' : /steampowered\.com/.test(a.mal) ? 'Buka di Steam' : 'Buka di MyAnimeList' }) : null))));
  }

  // ---------- Tambah anime ----------
  // Cadangan: jika penghubung gagal menjangkau sumber data, coba AniList langsung dari browser.
  const ANILIST_TYPE = { TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
  async function searchAniListBrowser(query) {
    const gql = `query ($q: String) { Page(perPage: 10) { media(search: $q, type: ANIME, sort: SEARCH_MATCH) {
      idMal format episodes seasonYear description(asHtml: false) genres title { english romaji }
      coverImage { extraLarge large } studios(isMain: true) { nodes { name } } } } }`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: { q: query } }),
    });
    if (!res.ok) throw new Error('AniList membalas kode ' + res.status);
    const media = (await res.json())?.data?.Page?.media;
    if (!Array.isArray(media)) throw new Error('format balasan tidak dikenal');
    const clean = (t) => (t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s*\(Source:[^)]*\)\s*$/i, '').trim() || null;
    return media.filter((m) => m.idMal).map((m) => ({
      malId: m.idMal,
      tautan: `https://myanimelist.net/anime/${m.idMal}`,
      asal: 'Jepang',
      judul: m.title.english || m.title.romaji,
      tipe: ANILIST_TYPE[m.format] || null,
      tahun: m.seasonYear || null,
      total: m.episodes ?? null,
      studio: (m.studios && m.studios.nodes[0] && m.studios.nodes[0].name) || null,
      genre: (m.genres || []).slice(0, 6),
      sinopsis: clean(m.description),
      cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || null,
    }));
  }

  // Pencarian lewat penghubung (server yang memanggil sumber data), dengan cadangan lewat browser.
  async function searchAnime(query, api, password, jenis = 'anime') {
    let res;
    try {
      res = await fetch(api + '/api/cari?q=' + encodeURIComponent(query) + '&jenis=' + encodeURIComponent(jenis), { headers: { 'X-Admin-Password': password } });
    } catch {
      throw new Error('Tidak bisa terhubung ke penghubung. Periksa apiUrl di config.js dan koneksi internetmu.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data.results || [];
    if (jenis === 'anime' && (res.status === 502 || res.status === 503 || res.status === 504)) {
      try { return await searchAniListBrowser(query); } catch { /* pakai pesan dari penghubung */ }
    }
    throw new Error(data.error || `Pencarian gagal (kode ${res.status}).`);
  }

  function add() {
    const app = $('#app');
    const api = apiBase();

    if (!api) {
      app.append(h('section', { class: 'wrap page-head' },
        h('h1', { text: 'Tambah judul' }),
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
      h('option', { value: 'ditonton', text: 'Sedang Ditonton' }),
      h('option', { value: 'selesai', text: 'Selesai' }));
    const statusOpsi = () => [...status.options];
    const jenisSel = h('select', { id: 'jenis' }, Object.entries(JENIS).map(([k, v]) => h('option', { value: k, text: v })));
    const asalSel = h('select', { id: 'asal' });
    const asalLabel = h('span', { text: 'Asal' });
    const searchLabel = h('span', { text: 'Cari anime' });
    const isGame = () => jenisSel.value === 'game';

    // Untuk game, kolom "Asal" diganti "Platform"; kata status juga menyesuaikan.
    function refreshJenis() {
      const game = isGame();
      asalLabel.textContent = game ? 'Platform' : 'Asal';
      asalSel.replaceChildren(
        h('option', { value: 'auto', text: game ? 'Pilih per hasil pencarian' : 'Otomatis (dari sumber data)' }),
        ...(game ? PLATFORM : ASAL).map((x) => h('option', { value: x, text: x })));
      statusOpsi().forEach((o) => { o.textContent = statusLabel(o.value, jenisSel.value); });
      searchLabel.textContent = 'Cari ' + JENIS[jenisSel.value].toLowerCase();
    }
    refreshJenis();

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

    // --- Pencarian anime ---
    const results = h('div', { class: 'results' });
    const q = h('input', { type: 'search', id: 'q', placeholder: 'Ketik judul', autocomplete: 'off' });
    const existingLinks = () => new Set(items().map((a) => a.mal).filter(Boolean));
    const asalDipilih = (r) => (isGame() ? null : asalSel.value === 'auto' ? (r && r.asal) || null : asalSel.value);
    const platformAwal = () => (isGame() && asalSel.value !== 'auto' ? asalSel.value : null);

    function renderResults(list) {
      const have = existingLinks();
      results.replaceChildren(...list.map((r) => {
        const already = have.has(r.tautan);
        const btn = h('button', { type: 'button', class: 'btn primary', text: already ? 'Sudah ada' : 'Tambah', disabled: already ? true : null });
        // Game bisa ada di beberapa platform, jadi platformnya dipilih per hasil.
        const platforms = r.jenis === 'game' ? (r.platforms && r.platforms.length ? r.platforms : PLATFORM) : null;
        const pilih = platforms ? h('select', { 'aria-label': 'Platform yang kamu mainkan', disabled: already ? true : null },
          platforms.map((x) => h('option', { value: x, text: x, selected: x === (platformAwal() || platforms[0]) ? true : null }))) : null;
        btn.addEventListener('click', () => send({
          judul: r.judul, status: status.value, total: r.total, genre: r.genre, studio: r.studio,
          tipe: r.tipe, sinopsis: r.sinopsis, mal: r.tautan, cover: r.cover,
          jenis: r.jenis || jenisSel.value, asal: r.jenis === 'game' ? null : asalDipilih(r), platform: pilih ? pilih.value : null,
        }, btn));
        return h('div', { class: 'card result' },
          poster({ judul: r.judul, cover: r.cover }),
          h('div', { class: 'card-body' },
            h('h3', { text: r.judul }),
            facts(r),
            chipRow(r.genre),
            r.sinopsis ? h('p', { class: 'syn', text: r.sinopsis }) : null,
            h('div', { class: 'prog' }, pilih, btn)));
      }));
    }

    async function doSearch() {
      const term = q.value.trim();
      if (term.length < 2) { notify('Ketik minimal 2 huruf untuk mencari.', 'err'); return; }
      notify('Mencari...');
      results.replaceChildren();
      try {
        const list = await searchAnime(term, api, pw.value, jenisSel.value);
        notify(list.length ? '' : 'Tidak ada hasil. Coba judul lain atau tambah manual di bawah.');
        renderResults(list);
      } catch (err) {
        notify(err.message, 'err');
      }
    }
    jenisSel.addEventListener('change', () => {
      refreshJenis();
      results.replaceChildren(); notify('');
    });
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
      field('Total episode (boleh kosong; abaikan untuk film dan game)', m.total),
      field('Alamat gambar poster (boleh kosong)', m.cover),
      field('Sinopsis (boleh kosong)', m.sinopsis),
      h('button', { type: 'submit', class: 'btn primary', text: 'Tambah' }));
    manual.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await send({
        judul: m.judul.value, status: status.value,
        jenis: jenisSel.value, asal: asalDipilih(null), platform: platformAwal(),
        total: m.total.value === '' || !hasEpisodes({ jenis: jenisSel.value }) ? null : m.total.value,
        cover: m.cover.value.trim() || null, sinopsis: m.sinopsis.value.trim() || null,
      }, null);
      if (ok) manual.reset();
    });

    app.append(
      h('section', { class: 'wrap page-head' }, h('h1', { text: 'Tambah judul' })),
      h('section', { class: 'wrap add' },
        h('div', { class: 'panel' },
          h('div', { class: 'add-row' },
            field('Kata sandi', pw),
            field('Status awal', status)),
          h('div', { class: 'add-row' },
            field('Jenis', jenisSel),
            h('label', { class: 'field' }, asalLabel, asalSel)),
          h('label', { class: 'check', for: 'remember' }, remember, 'Ingat kata sandi di perangkat ini')),
        h('div', { class: 'panel' },
          h('div', { class: 'add-search' },
            h('label', { class: 'field grow', for: 'q' }, searchLabel, q),
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
