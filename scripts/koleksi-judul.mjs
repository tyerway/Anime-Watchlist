// Pembersih nama folder rilisan (mis. "Assassins Creed Odyssey Gold Edition MULTi15-ElAmigos")
// menjadi judul game yang bisa dicari di Steam/Wikipedia. Murni fungsi, tanpa jaringan.

const GRUP = 'ElAmigos|GOG|CODEX|DARKSiDERS|PLAZA|TENOKE|PROPHET|RUNE|SKIDROW|RELOADED|FitGirl|CPY|HI2U|voices38|TiNYiSO|CS2UEU1|CSF|STEAMPUNKS|POSTMORTEM|Razor1911|FLT|DOGE|P2P|SiMPLEX|GOLDBERG|KaOs|HOODLUM|DINOByTES|ALI213|TiNYiSO|EMPRESS|Chronos|BAT|ENiGMA|SteamGG\\.NET|SteamGG';
const RE_GRUP = new RegExp(`[-\\s](?:${GRUP})$`, 'i');
const EDISI_KATA = 'Deluxe|Gold|Complete|Premium|Ultimate|Digital|Standard|Definitive|Anniversary|Collectors?|Master Assassin|Jackdaw|Apex|Devout|Explorer|El Prez|Grand Slam|Game of the Year|GOTY|Directors? Cut|Enhanced|Special|Legendary|Royal|Limited|Founders?|Launch|Day One|Expanded|Platinum|Supreme|Imperial|Season Pass|Unrated|Bonus|Anniversary';
const RE_EDISI = new RegExp(`\\s+((?:(?:${EDISI_KATA})\\s+)+(?:Edition|Version|Collection)?|(?:${EDISI_KATA})\\s+Edition|Edition)$`, 'i');

export const normal = (s) => String(s || '').replace(/[™®©℠]/g, '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function bersihJudul(raw) {
  let s = String(raw || '').trim();
  const info = { update: false, tambahan: false, earlyAccess: false, edisi: '' };
  if (/^\[OPTIONAL\]/i.test(s) || /\b(modpack|mod pack|sideloader)\b/i.test(s)) info.tambahan = true;
  if (/early access/i.test(s)) info.earlyAccess = true;
  s = s.replace(/^\[[^\]]*\]\s*/, '').replace(/\[[^\]]*\]/g, ' ').replace(/\(\s*v?[\d.]+\s*\)/gi, ' ');
  if (!/\s/.test(s) && (s.match(/\./g) || []).length >= 2) s = s.replace(/\./g, ' ');
  s = s.replace(/_/g, ' ');
  for (let i = 0; i < 3; i++) s = s.replace(RE_GRUP, '').replace(/\s+-\s*$/, '').trim();
  s = s.replace(/-[A-Za-z0-9]{3,}$/, (m) => (/^-[A-Z0-9]{3,}$/.test(m) ? '' : m));
  if (/\bupdate\b/i.test(s) || /\bv\d+(\.\d+)*\b/i.test(s) && /\bupdate\b/i.test(s)) info.update = true;
  s = s.replace(/\bUpdate\b.*$/i, ' ');
  s = s.replace(/\bBetter\s*Repack(\s+R\d+)?\b/gi, ' ').replace(/\bMULTi\d+\b/gi, ' ')
    .replace(/\bHypervisor( Bypass Fix)?\b/gi, ' ').replace(/\bBypass Fix\b/gi, ' ')
    .replace(/\bIncl\b.*$/i, ' ').replace(/\bCrack Only\b/gi, ' ').replace(/\biSO\b/g, ' ')
    .replace(/\bBuild\s+\d+\b/gi, ' ').replace(/\bv\d[\w.]*\b/gi, ' ').replace(/\bR\d{2}\b$/g, ' ')
    .replace(/\s+Steam$/i, ' ').replace(/\bRepack\b/gi, ' ').replace(/\bDLC Unlocker\b/gi, ' ').replace(/\bFree Download\b/gi, ' ').replace(/\bDVD9RiP\b/gi, ' ').replace(/\s+Crack$/i, ' ');
  s = s.replace(/[-+]\s*$/g, ' ').replace(/\s+/g, ' ').trim();
  const m = s.match(RE_EDISI);
  if (m && s.length > m[0].length + 1 && !/^edition$/i.test(m[1].trim())) { info.edisi = m[1].trim(); s = s.slice(0, m.index).trim(); }
  s = s.replace(/\s+(Hypervisor|Remastered Edition)$/i, (x) => (/Remastered/i.test(x) ? ' Remastered' : '')).trim();
  s = s.replace(/[\s-]+$/g, '').trim();
  return { judul: s || String(raw).trim(), ...info };
}

// Baca baris spreadsheet: kolom dengan header "Huge Data N" berisi nama folder di bawahnya.
export function bacaDaftar(rows) {
  let hr = -1;
  for (let i = 0; i < rows.length; i++) if ((rows[i] || []).some((c) => /^huge data/i.test(String(c || '').trim()))) { hr = i; break; }
  if (hr < 0) throw new Error('Baris judul kolom ("Huge Data 1", "Huge Data 2", …) tidak ditemukan di sheet.');
  const kolom = [];
  rows[hr].forEach((c, i) => { if (/^huge data/i.test(String(c || '').trim())) kolom.push([i, String(c).trim()]); });
  const out = [];
  for (let r = hr + 1; r < rows.length; r++) {
    for (const [i, lokasi] of kolom) {
      const v = String((rows[r] || [])[i] ?? '').trim();
      if (v) out.push({ raw: v, lokasi });
    }
  }
  return out;
}

// Gabungkan berkas yang sama game-nya (edisi, update, dan salinan di beberapa hardisk jadi satu baris).
export function kelompokkan(entri) {
  const peta = new Map();
  for (const e of entri) {
    const b = bersihJudul(e.raw);
    const kunci = normal(b.judul) + (b.tambahan ? '|tambahan' : '');
    if (!normal(b.judul)) continue;
    let g = peta.get(kunci);
    if (!g) { g = { kunci, judul: b.judul, edisi: new Set(), lokasi: new Set(), berkas: new Set(), tambahan: b.tambahan, earlyAccess: false, adaUpdate: false }; peta.set(kunci, g); }
    if (b.edisi) g.edisi.add(b.edisi);
    g.lokasi.add(e.lokasi); g.berkas.add(e.raw);
    g.earlyAccess ||= b.earlyAccess; g.adaUpdate ||= b.update;
    if (b.judul.length > g.judul.length && normal(b.judul) === normal(g.judul)) g.judul = b.judul;
  }
  return [...peta.values()].map((g) => ({ ...g, edisi: [...g.edisi].join(', '), lokasi: [...g.lokasi].sort(), berkas: [...g.berkas] }));
}
