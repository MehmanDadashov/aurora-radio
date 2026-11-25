/* ================================================================
   AURORA RADIO — клиент (v3)
   UI в стиле первой версии · мультиязычность · винил-плеер
   ================================================================ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const t = (k, v) => (window.AuraI18n ? AuraI18n.t(k, v) : k);
const L = () => (window.AuraI18n ? AuraI18n.lang : { locale: 'en' });

const S = {
  stations: [], countries: [], genres: [], languages: [], cities: [],
  results: [], queue: [], qi: -1,
  favs: new Set(), hist: [],
  playing: null, playingCtx: null,
  theme: 'dark', autoplay: true, sleepMin: 0, buf: 10, logoQ: 'mid',
  premium: false, premiumUntil: 0,
  shuffle: false, repeat: false,
  filter: { genre: '', country: '', lang: '', city: '', q: '' },
  loaded: false,
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ar_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ar_' + k, JSON.stringify(v)); } catch (e) {} },
};

const audio = $('#audio');
let hls = null;
let sleepTimer = null;
let metaCache = new Map();

/* ---------------- utils ---------------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
const mmss = s => { if (!isFinite(s) || s < 0) return '0:00'; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200);
}

function logoUrl(st, q) {
  const u = st.logo || st.favicon || '';
  if (!u) return '';
  if (q === 'low') return u.replace(/\/\d+x\d+/, '/32x32').replace(/w40|w80|w100|w160|w200|w300|w400|w500|w600|w800|w1000|w1200|w1600|w2000/, 'w80');
  if (q === 'high') return u.replace(/\/\d+x\d+/, '/300x300').replace(/w40|w80|w100|w160|w200|w300|w400|w500|w600|w800|w1000|w1200|w1600|w2000/, 'w400');
  return u;
}
function stationInitial(st) {
  const n = (st.name || '').trim();
  return n ? n[0].toUpperCase() : '📻';
}
function flagEmoji(iso) {
  if (!iso || iso.length !== 2) return '🌐';
  return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}
/* Флаг страны: iso → флаг из каталога стран → 🌐. Нужно для станций без iso, но с названием страны. */
function stationFlag(st) {
  if (st.iso && st.iso.length === 2) return flagEmoji(st.iso);
  const hit = (S.countries || []).find(c => c.code === st.country || c.name === st.country);
  if (hit && hit.flag) return hit.flag;
  if (hit && hit.iso && hit.iso.length === 2) return flagEmoji(hit.iso);
  return '🌐';
}
/* Флаг страны по её названию из каталога (для списков стран/городов/жанров). */
function countryFlag(code) {
  const hit = (S.countries || []).find(c => c.code === code || c.name === code);
  if (hit && hit.flag) return hit.flag;
  if (hit && hit.iso && hit.iso.length === 2) return flagEmoji(hit.iso);
  return '🌐';
}

function cardHTML(st, i, opts = {}) {
  const logo = logoUrl(st, S.logoQ);
  const badge = opts.badge || (st.codec && st.bitrate ? `<span class="badge">${esc(st.codec)} ${st.bitrate}k</span>` : '');
  const meta = opts.meta || `${st.genreIcon || '📻'} ${esc(st.genre)}${st.country ? ' · ' + esc(st.country) : ''}`;
  return `<div class="card ${opts.list ? 'list' : ''}" data-i="${i}" data-id="${esc(st.id)}">
    ${badge}
    <div class="logo">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(stationInitial(st))}</div>
    <div class="body">
      <div class="nm">${esc(st.name)}</div>
      <div class="mt"><span class="flag">${stationFlag(st)}</span>${esc(meta)}</div>
    </div>
    <div class="play">▶</div>
  </div>`;
}
/* плитка страны: флаг + имя страны под ним */
function countryCardHTML(c, i) {
  return `<div class="ccard" data-code="${esc(c.code)}" data-i="${i}">
    <div class="fl">${c.flag || flagEmoji(c.iso)}</div>
    <div class="nm">${esc(c.name || c.code)}</div>
    <div class="ct">${t('count.stations',{n:fmt(c.count)})}</div>
  </div>`;
}
/* строка города с номером */
function cityRowHTML(c, i) {
  return `<div class="row" data-city="${esc(c.name)}" data-country="${esc(c.country)}" data-i="${i}">
    <div class="rank">${i + 1}</div>
    <div class="fl">${countryFlag(c.country)}</div>
    <div class="nm"><b>${esc(c.name)}</b><span>${esc(c.country)} · ${fmt(c.count)}</span></div>
    <div class="arrow">›</div>
  </div>`;
}
/* строка истории с номером */
function historyRowHTML(st, i) {
  return `<div class="row" data-id="${esc(st.id)}" data-i="${i}">
    <div class="rank">${i + 1}</div>
    <div class="fl">${stationFlag(st)}</div>
    <div class="nm"><b>${esc(st.name)}</b><span>${esc([st.genre, st.country].filter(Boolean).join(' · '))}</span></div>
    <div class="play">▶</div>
  </div>`;
}
/* плитка жанра */
function genreTileHTML(g, i) {
  return `<div class="card" data-genre="${esc(g.name)}" data-i="${i}">
    <div class="logo">${g.icon || '📁'}</div>
    <div class="body"><div class="nm" style="text-transform:capitalize">${esc(g.name)}</div>
      <div class="mt">${t('count.stations',{n:fmt(g.count)})}</div></div>
  </div>`;
}
function emptyHTML(ic, tt, p) {
  return `<div class="empty"><div class="ic">${ic}</div><h3>${tt}</h3><p>${p}</p></div>`;
}

/* ---------------- data (gzip + cache) ---------------- */
async function fetchJSON(path) {
  const urls = [path + '.gz', path];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      if (u.endsWith('.gz')) {
        const buf = await r.arrayBuffer();
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([buf]).stream().pipeThrough(ds);
        return await new Response(stream).json();
      }
      return await r.json();
    } catch (e) { /* next */ }
  }
  return {};
}

async function loadData() {
  const jobs = ['stations', 'countries', 'genres', 'languages', 'cities'];
  const out = await Promise.all(jobs.map(j => fetchJSON('data/' + j + '.json')));
  S.stations = out[0].stations || [];
  S.countries = out[1].countries || [];
  S.genres = out[2].genres || [];
  S.languages = out[3].languages || [];
  S.cities = out[4].cities || [];
  S.loaded = true;

  $('#stTotal').textContent = fmt(S.stations.length);
  $('#stCountries').textContent = fmt(S.countries.length);
  $('#stCities').textContent = fmt(S.cities.length);
  $('#stGenres').textContent = S.genres.length;
  $('#kvTotal').textContent = S.stations.length.toLocaleString(L().locale);
  $('#kvCountries').textContent = S.countries.length;
  $('#kvCities').textContent = S.cities.length.toLocaleString(L().locale);
  $('#kvVer').textContent = '3.0.0';
  $('#kvDate').textContent = new Date().toLocaleDateString(L().locale);
  renderHome();
}

/* ---------------- home ---------------- */
function renderHome() {
  const g = S.genres.slice(0, 14);
  $('#homeGenres').innerHTML = g.map(x =>
    `<button class="chip" data-genre="${esc(x.name)}">${x.icon || '📁'} ${esc(x.name)}<span class="n">${fmt(x.count)}</span></button>`).join('');

  const c = S.countries.slice(0, 18);
  $('#homeCountries').innerHTML = c.map(x =>
    `<button class="chip" data-country="${esc(x.code)}">${x.flag || flagEmoji(x.iso)} ${esc(x.name || x.code)}<span class="n">${fmt(x.count)}</span></button>`).join('');

  const top = S.stations.filter(s => s.votes > 0).slice(0, 12);
  $('#homeTop').innerHTML = top.length
    ? top.map((s, i) => cardHTML(s, i, { badge: `<span class="badge">★ ${fmt(s.votes)}</span>` })).join('')
    : emptyHTML('📻', t('empty.noData'), '');

  const nw = S.stations.filter(s => !s.votes && s.logo).slice(0, 12);
  $('#homeNew').innerHTML = nw.length
    ? nw.map((s, i) => cardHTML(s, i)).join('')
    : emptyHTML('✨', t('empty.empty'), '');
}

/* ---------------- pages ---------------- */
const NAV_FOR = { country: 'countries', genre: 'genres' };
function go(page, arg) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const el = $('#page-' + page);
  if (!el) return;
  el.classList.add('active');
  const navKey = NAV_FOR[page] || page;
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.go === navKey));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (page === 'genres') renderGenres();
  if (page === 'countries') renderCountries();
  if (page === 'country') renderCountry(arg);
  if (page === 'genre') renderGenre(arg);
  if (page === 'cities') renderCities();
  if (page === 'fav') renderFavs();
  if (page === 'history') renderHistory();
  if (page === 'search') renderSearch();
  if (page === 'settings') renderSettings();
  if (page === 'premium') renderPremium();
  if (page === 'download') renderDownload();
}

function renderGenres() {
  $('#genreCount').textContent = t('count.genres',{n:S.genres.length});
  $('#genreGrid').innerHTML = S.genres.map((g, i) => genreTileHTML(g, i)).join('') || emptyHTML('🎵', t('empty.noGenres'), '');
}
function renderCountries() {
  $('#countryCount').textContent = t('count.countries',{n:S.countries.length});
  const chips = ['all', ...S.countries.slice(0, 24).map(c => c.code)];
  $('#countryChips').innerHTML = chips.map((c, i) =>
    `<button class="chip ${i === 0 ? 'on' : ''}" data-c="${esc(c)}">${c === 'all' ? t('page.all') : countryFlag(c) + ' ' + esc(c)}</button>`).join('');
  $('#countryGrid').innerHTML = S.countries.map((c, i) => countryCardHTML(c, i)).join('') || emptyHTML('🌍', t('empty.noCountries'), '');
  renderCountryTotals();
}
let countryGenre = '';
function renderCountry(code) {
  const list = S.stations.filter(s => s.country === code);
  const meta = (S.countries || []).find(c => c.code === code || c.name === code);
  const flag = meta ? (meta.flag || flagEmoji(meta.iso)) : '🌐';
  const name = (meta && meta.name) || code;
  S.countryCode = code;
  const badge = $('#countryBadge');
  if (badge) badge.textContent = flag;
  const tt = $('#countryTitle');
  if (tt) { tt.setAttribute('data-code', code); tt.textContent = name; }
  $('#countryPill').textContent = t('count.stations',{n:fmt(list.length)});
  const gs = [...new Set(list.map(s => s.genre))].filter(Boolean).slice(0, 16);
  $('#countryGenreChips').innerHTML =
    `<button class="chip on" data-g="">${t('page.allGenres')}</button>` +
    gs.map(g => `<button class="chip" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  countryGenre = '';
  drawCountryList(list);
}
function drawCountryList(list) {
  const l = countryGenre ? list.filter(s => s.genre === countryGenre) : list;
  const page = l.slice(0, 300);
  $('#countryStations').innerHTML = l.length
    ? page.map((s, i) => cardHTML(s, i)).join('') + moreHTML(l.length - page.length)
    : emptyHTML('📻', t('empty.nothing'), t('empty.tryGenre'));
}
/* Полоска итогов под списком стран: сколько стран и станций всего. */
function renderCountryTotals() {
  const el = $('#countryTotals');
  if (el) el.textContent = t('count.totals',{c:S.countries.length, s:S.stations.length.toLocaleString(L().locale)});
}
let genreCountry = '';
function renderGenre(name) {
  const g = S.genres.find(x => x.name === name);
  const list = S.stations.filter(s => s.genre === name);
  S.genreName = name;
  const badge = $('#genreBadge');
  if (badge) badge.textContent = g ? (g.icon || '🎵') : '🎵';
  const tt = $('#genreTitle');
  if (tt) { tt.setAttribute('data-genre', name); tt.textContent = name; }
  $('#genrePill').textContent = t('count.stations',{n:fmt(list.length)});
  const cs = [...new Set(list.map(s => s.country))].filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 20);
  $('#genreCountryChips').innerHTML =
    `<button class="chip on" data-c="">${t('page.allCountries')}</button>` +
    cs.map(c => `<button class="chip" data-c="${esc(c)}">${countryFlag(c)} ${esc(c)}</button>`).join('');
  genreCountry = '';
  drawGenreList(list);
}
function drawGenreList(list) {
  const l = genreCountry ? list.filter(s => s.country === genreCountry) : list;
  const page = l.slice(0, 300);
  $('#genreStations').innerHTML = l.length
    ? page.map((s, i) => cardHTML(s, i)).join('') + moreHTML(l.length - page.length)
    : emptyHTML('📻', t('empty.nothing'), t('empty.tryCountry'));
}
/* отметка «показаны первые 300 из N» */
function moreHTML(n) {
  if (n <= 0) return '';
  return `<div class="foot">${t('count.showing',{n:fmt(n)})}</div>`;
}
function renderCities() {
  $('#cityCount').textContent = t('count.cities',{n:S.cities.length.toLocaleString(L().locale)});
  const top = ['all', ...S.cities.slice(0, 20).map(c => c.country)];
  $('#cityChips').innerHTML = top.map((c, i) =>
    `<button class="chip ${i === 0 ? 'on' : ''}" data-c="${esc(c)}">${c === 'all' ? t('page.all') : countryFlag(c) + ' ' + esc(c)}</button>`).join('');
  $('#cityGrid').innerHTML = S.cities.slice(0, 200).map((c, i) => cityRowHTML(c, i)).join('') || emptyHTML('🏙️', t('empty.noCities'), '');
}
function renderFavs() {
  const list = [...S.favs].map(id => S.stations.find(s => s.id === id)).filter(Boolean);
  $('#favCount').textContent = t('count.stations',{n:list.length});
  $('#favGrid').innerHTML = list.length
    ? list.map((s, i) => cardHTML(s, i)).join('')
    : emptyHTML('⭐', t('empty.favNone'), t('empty.favNoneD'));
}
function renderHistory() {
  const list = S.hist.map(id => S.stations.find(s => s.id === id)).filter(Boolean);
  $('#historyGrid').innerHTML = list.length
    ? list.map((s, i) => historyRowHTML(s, i)).join('')
    : emptyHTML('🕘', t('empty.histNone'), t('empty.histNoneD'));
}
function renderSettings() {
  $('#kvFav').textContent = S.favs.size;
  let sz = 0; try { sz = JSON.stringify(localStorage).length; } catch (e) {}
  $('#kvCache').textContent = t('unit.kb',{n:(sz/1024).toFixed(0)});
  $('#themeSel').value = S.theme;
  $('#logoQ').value = S.logoQ;
  $('#swAutoplay').classList.toggle('on', S.autoplay);
  $('#sleepSel').value = String(S.sleepMin);
  $('#bufSel').value = String(S.buf);
}

function renderPremium() {
  const p = isPremium();
  $('#premStatus').textContent = p ? 'PREMIUM' : 'FREE';
  $('#premStatus').className = 'pill ' + (p ? 'pro' : 'free');
  $('#buyBtn').textContent = p ? t('premium.activeUntil',{d:new Date(S.premiumUntil).toLocaleDateString(L().locale)}) : t('premium.buy');
  if (p) Ad.hideBanner(); else Ad.showBanner();
}
function isPremium() { return S.premium && S.premiumUntil > Date.now(); }

/* ---------------- скачивание приложения ---------------- */
const DL_FILES = {
  android: 'aurora-radio-android.apk',
  windows: 'aurora-radio-windows-setup.exe',
  linux: 'aurora-radio-linux-x86_64.AppImage',
  deb: 'aurora-radio-linux-amd64.deb',
  macos: 'aurora-radio-macos-x64.zip',
};
const DL_BASE = 'https://github.com/MehmanDadashov/aurora-radio/releases/download/v3.1.0/';
function downloadHTML() {
  const ver = '3.1.3';
  const cards = [
    { icon: '📱', os: t('dl.android'), size: t('dl.sizeApk',{n:'22'}), url: DL_BASE + DL_FILES.android, note: t('dl.noteAndroid') },
    { icon: '🪟', os: t('dl.windows'), size: t('dl.sizeInstaller',{n:'100'}), url: DL_BASE + DL_FILES.windows, note: t('dl.noteWin') },
    { icon: '🐧', os: t('dl.linux'), size: t('dl.sizeAppImage',{n:'128'}), url: DL_BASE + DL_FILES.linux, note: t('dl.noteLinux') },
    { icon: '📦', os: t('dl.linux') + ' .deb', size: t('dl.sizeDeb',{n:'89'}), url: DL_BASE + DL_FILES.deb, note: t('dl.noteDeb') },
    { icon: '🍎', os: t('dl.macos'), size: t('dl.sizeZip',{n:'122'}), url: DL_BASE + DL_FILES.macos, note: t('dl.noteMac') },
    { icon: '🌐', os: t('dl.web'), size: t('dl.noInstall'), url: 'https://radio.ai-studio.se/', note: t('dl.anyBrowser'), web: true },
  ];
  return `<div class="dl-grid">${cards.map(c => `
    <div class="dl-card">
      <div class="dl-ic">${c.icon}</div>
      <div class="dl-os">${esc(c.os)}</div>
      <div class="dl-ver">v${ver} · ${esc(c.size)}</div>
      <div class="dl-note">${esc(c.note)}</div>
      <a class="dl-btn${c.web ? ' ghost' : ''}" href="${esc(c.url)}" ${c.web ? 'target="_blank" rel="noopener"' : 'download'}>${c.web ? t('dl.open') : t('dl.download')}</a>
    </div>`).join('')}</div>
    <div class="dl-foot">${t('settings.dev',{b:'AI Studio'})}</div>`;
}
function renderDownload() {
  const w = $('#downloadGrid');
  if (w) w.innerHTML = downloadHTML();
}

/* ---------------- search ---------------- */
function doSearch(q) {
  const nq = norm(q);
  if (!nq) { S.results = []; return; }
  const res = [];
  const seen = new Set();
  const push = s => { if (s && !seen.has(s.id)) { seen.add(s.id); res.push(s); } };
  for (const s of S.stations) {
    if (norm(s.name).includes(nq)) push(s);
    if (res.length > 400) break;
  }
  for (const s of S.stations) {
    if (res.length > 800) break;
    if (seen.has(s.id)) continue;
    if (norm(s.country).includes(nq) || norm(s.city).includes(nq) || norm(s.genre).includes(nq) || norm(s.tags).includes(nq)) push(s);
  }
  S.results = res;
}
function renderSearch() {
  const q = S.filter.q;
  $('#searchCount').textContent = S.results.length ? t('count.results',{n:fmt(S.results.length)}) : '';
  if (!q) { $('#searchGrid').innerHTML = emptyHTML('🔎', t('empty.enterQuery'), t('empty.queryExample')); return; }
  const chips = ['all', ...[...new Set(S.results.slice(0, 200).map(s => s.country))].slice(0, 12)];
  $('#searchChips').innerHTML = chips.map((c, i) =>
    `<button class="chip ${i === 0 ? 'on' : ''}" data-c="${esc(c)}">${c === 'all' ? t('page.all') : countryFlag(c) + ' ' + esc(c)}</button>`).join('');
  $('#searchGrid').innerHTML = S.results.length
    ? S.results.slice(0, 300).map((s, i) => cardHTML(s, i)).join('')
    : emptyHTML('🔎', t('empty.noResults'), t('empty.tryQuery'));
}

/* ---------------- playback: фоновое + авто-переподключение ---------------- */
const Player = {
  reconnectAttempts: 0,
  maxReconnect: 8,
  baseDelay: 2000,
  userStopped: false,
  resumeTimer: null,
};

function playStation(st, queue) {
  if (!st) return;
  S.playing = st;
  S.playingCtx = queue || [st];
  S.qi = Math.max(0, S.playingCtx.findIndex(s => s.id === st.id));
  Player.userStopped = false;
  Player.reconnectAttempts = 0;

  $('#barTitle').textContent = st.name;
  $('#barSub').textContent = [st.country, st.genre, st.codec ? st.codec + ' ' + st.bitrate + 'k' : ''].filter(Boolean).join(' · ');
  $('#bar').classList.add('on');
  $('#bar').classList.add('paused');
  $('#barPlay').textContent = '⏸';

  $('#sheetTitle').textContent = st.name;
  $('#sheetSub').textContent = [st.country, st.city, st.genre].filter(Boolean).join(' · ');
  const logo = logoUrl(st, 'high');
  const lab = $('#sheetLab');
  /* кап высоты — страховка от овала, если логотип битый/несоразмерный */
  lab.style.maxWidth = '100%';
  lab.style.maxHeight = '100%';
  if (logo) lab.innerHTML = `<img src="${esc(logo)}" alt="" onerror="this.parentNode.innerHTML='${esc(stationInitial(st))}'">`;
  else lab.innerHTML = `<span class="init">${esc(stationInitial(st))}</span>`;
  $('#sheetTags').innerHTML = [st.country, st.city, st.genre, st.language, st.codec].filter(Boolean)
    .map(x => `<span>${esc(x)}</span>`).join('');
  $('#sheet').classList.add('playing');

  updateFavUI();
  addHistory(st.id);
  persistSession();
  if (window.fbA) window.fbA.ev('station_play', { name: st.name, country: st.country, genre: st.genre });
  Ad.maybeInterstitial(false);
  startStream(st);
}

function persistSession() {
  LS.set('session', { id: S.playing && S.playing.id, ctx: (S.playingCtx || []).map(s => s.id), qi: S.qi, ts: Date.now() });
}

function restoreSession() {
  const s = LS.get('session', null);
  if (!s || !s.id) return false;
  const st = S.stations.find(x => x.id === s.id);
  if (!st) return false;
  const ctx = (s.ctx || []).map(id => S.stations.find(x => x.id === id)).filter(Boolean);
  playStation(st, ctx.length ? ctx : [st]);
  return true;
}

function startStream(st) {
  const url = st.url;
  if (!url) { toast(t('empty.noStream')); return; }
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  audio.src = url;
  audio.load();
  const p = audio.play();
  if (p) p.then(() => setPlaying(true)).catch(() => setPlaying(false));
  setSleepTimer();
}

function setPlaying(on) {
  $('#bar').classList.toggle('paused', !on);
  $('#sheet').classList.toggle('playing', on);
  $('#barPlay').textContent = on ? '⏸' : '▶';
  $('#cPlay').textContent = on ? '⏸' : '▶';
  if (on) Player.reconnectAttempts = 0;
  // Фоновое воспроизведение (Capacitor): держим foreground-сервис, пока играет аудио
  if (window.ForegroundRadio) {
    if (on) {
      const st = S.playing || {};
      window.ForegroundRadio.start(st.name || 'Aurora Radio',
        [st.country, st.genre].filter(Boolean).join(' · ') || 'Идёт воспроизведение');
    } else {
      window.ForegroundRadio.stop();
    }
  }
}

function togglePlay() {
  if (!S.playing) return;
  if (audio.paused) { audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  else { audio.pause(); setPlaying(false); }
}

// Мост из foreground-сервиса: кнопки плеера на экране блокировки
window.__auroraFgToggle = function () { togglePlay(); };

function nextStation(auto) {
  if (!S.playingCtx.length) return;
  let i;
  if (S.shuffle) { i = Math.floor(Math.random() * S.playingCtx.length); }
  else { i = (S.qi + 1) % S.playingCtx.length; }
  if (i === S.qi && !S.shuffle) { if (auto && !S.repeat) return; }
  playStation(S.playingCtx[i], S.playingCtx);
}
function prevStation() {
  if (!S.playingCtx.length) return;
  const i = (S.qi - 1 + S.playingCtx.length) % S.playingCtx.length;
  playStation(S.playingCtx[i], S.playingCtx);
}

/* Переподключение: та же станция, экспоненциальная задержка, пока клиент не выключит */
function scheduleReconnect() {
  if (Player.userStopped) return;
  if (Player.reconnectAttempts >= Player.maxReconnect) {
    toast(t('toast.streamGone'));
    Player.reconnectAttempts = 0;
    setTimeout(() => nextStation(true), 1200);
    return;
  }
  const delay = Math.min(Player.baseDelay * Math.pow(2, Player.reconnectAttempts), 30000);
  Player.reconnectAttempts++;
  toast(t('toast.reconnect',{n:Player.reconnectAttempts}));
  Player.resumeTimer = setTimeout(() => {
    if (Player.userStopped || !S.playing) return;
    audio.load();
    const p = audio.play();
    if (p) p.catch(() => {});
  }, delay);
}

function stopAll() {
  Player.userStopped = true;
  if (Player.resumeTimer) { clearTimeout(Player.resumeTimer); Player.resumeTimer = null; }
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setPlaying(false);
  $('#bar').classList.remove('on');
  $('#sheet').classList.remove('on');
  LS.set('session', null);
}

function addHistory(id) {
  S.hist = [id, ...S.hist.filter(x => x !== id)].slice(0, 100);
  LS.set('hist', S.hist);
}
function toggleFav(id) {
  const sid = id || (S.playing && S.playing.id);
  if (!sid) return;
  if (S.favs.has(sid)) { S.favs.delete(sid); toast(t('toast.favDel')); }
  else { S.favs.add(sid); toast(t('toast.favAdd')); }
  LS.set('favs', [...S.favs]);
  updateFavUI();
  if ($('#page-fav').classList.contains('active')) renderFavs();
}
function updateFavUI() {
  const on = S.playing && S.favs.has(S.playing.id);
  $('#barFav').textContent = on ? '⭐' : '☆';
  $('#sheetFav').textContent = on ? '⭐' : '☆';
}
function setSleepTimer() {
  if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
  if (!S.sleepMin) return;
  let left = S.sleepMin * 60;
  sleepTimer = setInterval(() => {
    left--;
    if (left <= 0) { stopAll(); toast(t('toast.sleepDone')); }
  }, 1000);
}

/* ---------------- ads (AdMob via Capacitor) ---------------- */
const Ad = {
  ok: false,
  bannerOn: false,
  lastInterstitial: 0,
  INTERSTITIAL_MS: 5 * 60 * 1000,
  async init() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AuroraAds) {
        await window.Capacitor.Plugins.AuroraAds.init();
        this.ok = true;
        if (!isPremium()) this.showBanner();
      } else if (window.AuroraAds) {
        // веб / Electron: AdSense-баннер и события аналитики
        this.ok = true;
        window.AuroraAds.init();
        if (!isPremium()) window.AuroraAds.showBanner('adBanner');
      }
    } catch (e) { /* web fallback: no ads */ }
  },
  async showBanner() {
    if (!this.ok || this.bannerOn || isPremium()) return;
    if (window.AuroraAds) { window.AuroraAds.showBanner('adBanner'); this.bannerOn = true; return; }
    try { await window.Capacitor.Plugins.AuroraAds.showBanner(); this.bannerOn = true; } catch (e) {}
  },
  async hideBanner() {
    if (!this.ok || !this.bannerOn) return;
    if (window.AuroraAds) { window.AuroraAds.hideBanner(); this.bannerOn = false; return; }
    try { await window.Capacitor.Plugins.AuroraAds.hideBanner(); this.bannerOn = false; } catch (e) {}
  },
  async maybeInterstitial(force) {
    if (!this.ok || isPremium()) return;
    const now = Date.now();
    if (!force && now - this.lastInterstitial < this.INTERSTITIAL_MS) return;
    this.lastInterstitial = now;
    if (window.AuroraAds) { window.AuroraAds.maybeInterstitial(force); return; }
    try { await window.Capacitor.Plugins.AuroraAds.showInterstitial(); } catch (e) {}
  },
  async rewarded() {
    if (window.AuroraAds) return window.AuroraAds.rewarded();
    if (!this.ok) { toast(t('toast.adUnavailable')); return false; }
    try {
      await window.Capacitor.Plugins.AuroraAds.showRewarded();
      return true;
    } catch (e) { return false; }
  },
};

// --- диагностика баннера: коды ошибок AdMob + ретраи (Android) ---
window.addEventListener('ad-banner-error', (e) => {
  const d = e.detail || {};
  const code = d.code;
  const map = {
    0: 'внутренняя ошибка SDK',
    1: 'неверный запрос (ID/юнит)',
    2: 'сеть недоступна',
    3: 'нет объявлений (no fill)'
  };
  toast('Реклама: ' + (map[code] || ('код ' + code)));
  Ad.bannerOn = false;
  Ad.retry = (Ad.retry || 0) + 1;
  if (Ad.retry <= 3) {
    setTimeout(() => { if (!isPremium()) Ad.showBanner(); }, 60000);
  }
});
window.addEventListener('ad-banner-loaded', () => {
  Ad.retry = 0;
  toast('Баннер загружен');
});

window.addEventListener('onRewarded', () => {
  S.premium = true; S.premiumUntil = Date.now() + 864e5;
  LS.set('premium', { p: true, until: S.premiumUntil });
  Ad.hideBanner();
  renderPremium();
  toast(t('toast.premium24'));
});
window.addEventListener('onRewardedFailed', () => toast(t('toast.adNotLoaded')));

/* ---------------- theme: тёмная/светлая ---------------- */
function applyTheme(tt) {
  S.theme = tt;
  const sys = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const eff = tt === 'auto' ? sys : tt;
  document.documentElement.setAttribute('data-theme', eff);
  LS.set('theme', tt);
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (S.theme === 'auto') applyTheme('auto');
});

/* ---------------- events ---------------- */
function bind() {
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }

    const chipG = e.target.closest('.chip[data-genre]');
    if (chipG) { S.filter.genre = chipG.dataset.genre; go('genre', chipG.dataset.genre); return; }
    const chipC = e.target.closest('.chip[data-country]');
    if (chipC) { go('country', chipC.dataset.country); return; }

    const gc = e.target.closest('#countryGenreChips .chip');
    if (gc) {
      $$('#countryGenreChips .chip').forEach(x => x.classList.remove('on'));
      gc.classList.add('on');
      countryGenre = gc.dataset.g;
      const code = S.countryCode || ($('#countryTitle') && $('#countryTitle').dataset.code);
      drawCountryList(S.stations.filter(s => s.country === code));
      return;
    }
    const gg = e.target.closest('#genreCountryChips .chip');
    if (gg) {
      $$('#genreCountryChips .chip').forEach(x => x.classList.remove('on'));
      gg.classList.add('on');
      genreCountry = gg.dataset.c;
      drawGenreList(S.stations.filter(s => s.genre === ($('#genreTitle').dataset.genre || $('#genreTitle').textContent)));
      return;
    }
    const cc = e.target.closest('#countryChips .chip');
    if (cc) {
      $$('#countryChips .chip').forEach(x => x.classList.remove('on'));
      cc.classList.add('on');
      const v = cc.dataset.c;
      const list = v === 'all' ? S.countries : S.countries.filter(c => c.code === v);
      $('#countryGrid').innerHTML = list.map((c, i) => countryCardHTML(c, i)).join('');
      return;
    }
    const ci = e.target.closest('#cityChips .chip');
    if (ci) {
      $$('#cityChips .chip').forEach(x => x.classList.remove('on'));
      ci.classList.add('on');
      const v = ci.dataset.c;
      const list = v === 'all' ? S.cities.slice(0, 200) : S.cities.filter(c => c.country === v).slice(0, 200);
      $('#cityGrid').innerHTML = list.map((c, i) => cityRowHTML(c, i)).join('');
      return;
    }
    const sc = e.target.closest('#searchChips .chip');
    if (sc) {
      $$('#searchChips .chip').forEach(x => x.classList.remove('on'));
      sc.classList.add('on');
      const v = sc.dataset.c;
      const list = v === 'all' ? S.results.slice(0, 300) : S.results.filter(s => s.country === v).slice(0, 300);
      $('#searchGrid').innerHTML = list.map((s, i) => cardHTML(s, i)).join('') || emptyHTML('🔎', t('empty.nothing'), '');
      return;
    }

    const card = e.target.closest('.card[data-id]');
    if (card) {
      const st = S.stations.find(s => s.id === card.dataset.id);
      if (st) {
        const list = currentList();
        playStation(st, list.length ? list : [st]);
        if (S.autoplay) $('#sheet').classList.add('on');
      }
      return;
    }
    const hrow = e.target.closest('.row[data-id]');
    if (hrow) {
      const st = S.stations.find(s => s.id === hrow.dataset.id);
      if (st) {
        playStation(st, currentList());
        if (S.autoplay) $('#sheet').classList.add('on');
      }
      return;
    }
    const ccard = e.target.closest('[data-code]');
    if (ccard) { go('country', ccard.dataset.code); return; }
    const citc = e.target.closest('[data-city]');
    if (citc) {
      const city = citc.dataset.city;
      const list = S.stations.filter(s => s.city === city);
      if (list.length) { S.results = list; playStation(list[0], list); $('#sheet').classList.add('on'); }
      else toast(t('empty.noCityStations'));
      return;
    }
    const gcard = e.target.closest('.card[data-genre]');
    if (gcard) { go('genre', gcard.dataset.genre); return; }
  });

  $('#q').addEventListener('input', debounce(e => {
    const v = e.target.value.trim();
    S.filter.q = v;
    if (!v) return;
    doSearch(v);
    go('search');
  }, 220));
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); } });

  $('#themeBtn').addEventListener('click', () => {
    const order = { dark: 'light', light: 'auto', auto: 'dark' };
    applyTheme(order[S.theme] || 'dark');
    toast(t('toast.theme',{t:S.theme}));
  });
  $('#themeSel').addEventListener('change', e => applyTheme(e.target.value));

  $('#barPlay').addEventListener('click', togglePlay);
  $('#cPlay').addEventListener('click', togglePlay);
  $('#barNext').addEventListener('click', () => nextStation(false));
  $('#cNext').addEventListener('click', () => nextStation(false));
  $('#barPrev').addEventListener('click', prevStation);
  $('#cPrev').addEventListener('click', prevStation);
  $('#barClose').addEventListener('click', stopAll);
  $('#sheetDown').addEventListener('click', () => $('#sheet').classList.remove('on'));
  $('#barFav').addEventListener('click', () => toggleFav());
  $('#sheetFav').addEventListener('click', () => toggleFav());
  $('#bar').addEventListener('click', e => { if (!e.target.closest('button')) $('#sheet').classList.add('on'); });

  $('#cShuffle').addEventListener('click', () => { S.shuffle = !S.shuffle; $('#cShuffle').classList.toggle('on', S.shuffle); toast(t('toast.shuffle',{s:S.shuffle ? t('toast.on') : t('toast.off')})); });
  $('#cRepeat').addEventListener('click', () => { S.repeat = !S.repeat; $('#cRepeat').classList.toggle('on', S.repeat); toast(t('toast.repeat',{s:S.repeat ? t('toast.on') : t('toast.off')})); });
  $('#cSleep').addEventListener('click', () => {
    const opts = [0, 15, 30, 60, 120];
    const i = (opts.indexOf(S.sleepMin) + 1) % opts.length;
    S.sleepMin = opts[i]; LS.set('sleep', S.sleepMin);
    $('#sleepSel').value = String(S.sleepMin);
    setSleepTimer();
    toast(S.sleepMin ? t('toast.sleepOn',{n:S.sleepMin}) : t('toast.sleepOff'));
  });

  // --- аудио-события: фоновое воспроизведение + переподключение ---
  audio.addEventListener('playing', () => { setPlaying(true); persistSession(); });
  audio.addEventListener('pause', () => {
      // Пауза элемента ≠ остановка клиентом: сервис НЕ гасим (системная пауза при
      // уходе в фон не должна убивать фоновое воспроизведение). UI-only синхронизация.
      const on = $('#bar'); if (on) on.classList.add('paused');
      $('#barPlay') && ($('#barPlay').textContent = '▶');
      $('#cPlay') && ($('#cPlay').textContent = '▶');
      $('#sheet') && $('#sheet').classList.remove('playing');
    });
  audio.addEventListener('ended', () => { if (S.repeat) audio.play().catch(() => {}); else nextStation(true); });
  audio.addEventListener('error', () => {
    setPlaying(false);
    if (S.playing && !Player.userStopped) scheduleReconnect();
  });
  audio.addEventListener('stalled', () => {
    if (S.playing && !Player.userStopped && !audio.paused) scheduleReconnect();
  });
  audio.addEventListener('timeupdate', () => {
    if (isFinite(audio.duration) && audio.duration > 0) {
      $('#tCur').textContent = mmss(audio.currentTime);
      $('#tDur').textContent = mmss(audio.duration);
      $('#tFill').style.width = (audio.currentTime / audio.duration * 100) + '%';
    } else {
      $('#tCur').textContent = mmss(audio.currentTime);
      $('#tDur').textContent = 'LIVE';
      $('#tFill').style.width = '0';
    }
  });

  // --- MediaSession веба ОТКЛЮЧЕНА: транспорт управляется нативным сервисом
    // (ForegroundRadio/RadioPlaybackService) — иначе на экране блокировки
    // конфликтуют две сессии и система останавливает воспроизведение. ---

    // --- видимость: НЕ ставим на паузу при скрытии вкладки + страховка сервиса ---
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // сохраняем сессию — продолжим при возврате
        if (S.playing) persistSession();
      } else if (S.playing && audio.paused && !Player.userStopped) {
        // при возврате вкладки возобновляем, если оборвалось
        audio.play().catch(() => {});
        // страховка: если foreground-сервис почему-то остановлен — поднимаем
        if (window.ForegroundRadio && !audio.paused) {
          const st = S.playing || {};
          window.ForegroundRadio.start(st.name || 'Aurora Radio',
            [st.country, st.genre].filter(Boolean).join(' · ') || 'Идёт воспроизведение');
        }
      }
    });

  // --- настройки ---
  $('#logoQ').addEventListener('change', e => { S.logoQ = e.target.value; LS.set('logoQ', S.logoQ); refreshGrids(); });
  $('#swAutoplay').addEventListener('click', () => { S.autoplay = !S.autoplay; $('#swAutoplay').classList.toggle('on', S.autoplay); LS.set('autoplay', S.autoplay); });
  $('#sleepSel').addEventListener('change', e => { S.sleepMin = +e.target.value; LS.set('sleep', S.sleepMin); setSleepTimer(); });
  $('#bufSel').addEventListener('change', e => { S.buf = +e.target.value; LS.set('buf', S.buf); });
  $('#clearCache').addEventListener('click', () => {
    if (confirm(t('toast.cacheClear'))) { localStorage.clear(); location.reload(); }
  });
  $('#clearHistory').addEventListener('click', () => { S.hist = []; LS.set('hist', []); renderHistory(); toast(t('toast.histCleared')); });

  // --- premium ---
  $('#buyBtn').addEventListener('click', () => { renderPremium(); $('#premModal').classList.add('on'); });
  $('#premClose').addEventListener('click', () => $('#premModal').classList.remove('on'));
  $('#premModal').addEventListener('click', e => { if (e.target.id === 'premModal') $('#premModal').classList.remove('on'); });
  $$('.plan').forEach(p => p.addEventListener('click', () => {
    $$('.plan').forEach(x => x.classList.remove('on')); p.classList.add('on');
  }));
  $('#payBtn').addEventListener('click', () => {
    const plan = ($('.plan.on') || {}).dataset?.plan || 'monthly';
    const plug = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AuroraBilling;
    if (plug && typeof plug.buyPlan === 'function') {
      toast(t('toast.adLoading'));
      plug.buyPlan({ plan }).catch(() => { toast(t('toast.noPurchases')); });
    } else {
      toast(t('toast.adWebOnly'));
    }
  });
  $('#rewardBtn').addEventListener('click', async () => {
    toast(t('toast.adLoading'));
    const ok = await Ad.rewarded();
    // Награда выдаётся событием onRewarded. Если реклама не показалась —
    // честно сообщаем, премиум НЕ выдаём.
    if (!ok) toast(t('toast.adNotLoaded'));
  });
  $('#restoreBtn').addEventListener('click', () => {
    const plug = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AuroraBilling;
    if (plug && typeof plug.restorePurchases === 'function') {
      plug.restorePurchases().catch(() => toast(t('toast.noPurchases')));
      return;
    }
    const r = LS.get('premium', null);
    if (r && r.until > Date.now()) { S.premium = true; S.premiumUntil = r.until; renderPremium(); toast(t('toast.premiumRestored')); }
    else toast(t('toast.noPurchases'));
  });

  /* --- Play Billing: события от AuroraBillingPlugin --- */
  function grantLocal(until) {
    S.premium = true; S.premiumUntil = until;
    LS.set('premium', { p: true, until });
    Ad.hideBanner();
    renderPremium();
  }
  window.addEventListener('onBillingPurchase', () => {
    grantLocal(Date.now() + 36500 * 864e5);
    $('#premModal').classList.remove('on');
    toast(t('toast.premiumOn'));
  });
  window.addEventListener('onBillingFailed', () => toast(t('toast.noPurchases')));
  window.addEventListener('onBillingRestored', ev => {
    if (ev && ev.detail && ev.detail.active) {
      grantLocal(Date.now() + 36500 * 864e5);
      toast(t('toast.premiumRestored'));
    } else {
      toast(t('toast.noPurchases'));
    }
  });

  // --- cast ---
  $('#sheetCast').addEventListener('click', () => Cast.request());

  // --- клавиатура ---
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight') nextStation(false);
    if (e.key === 'ArrowLeft') prevStation();
  });
}

function currentList() {
  const active = document.querySelector('.page.active');
  if (!active) return S.stations.slice(0, 300);
  const cards = [...active.querySelectorAll('[data-id]')];
  if (!cards.length) return S.stations.slice(0, 300);
  return cards.map(c => S.stations.find(s => s.id === c.dataset.id)).filter(Boolean);
}

function refreshGrids() {
  const a = document.querySelector('.page.active');
  if (!a) return;
  const id = a.id.replace('page-', '');
  if (id === 'home') renderHome();
  if (id === 'countries') renderCountries();
  if (id === 'fav') renderFavs();
  if (id === 'history') renderHistory();
  if (id === 'search') renderSearch();
  if (id === 'cities') renderCities();
  if (id === 'download') renderDownload();
  if (id === 'country') renderCountry(S.countryCode || ($('#countryTitle') && $('#countryTitle').dataset.code));
  if (id === 'genre') renderGenre(S.genreName || ($('#genreTitle') && $('#genreTitle').dataset.genre));
}

/* ---------------- Chromecast ---------------- */
const Cast = {
  available: false,
  init() {
    // Web Cast SDK
    if (window.chrome && chrome.cast && chrome.cast.isAvailable) { this.available = true; return; }
    window['__onGCastApiAvailable'] = (isAvailable) => { this.available = !!isAvailable; };
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    document.head.appendChild(s);
    // Capacitor native plugin
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Chromecast) this.available = true;
  },
  request() {
    const st = S.playing;
    if (!st) { toast(t('toast.playFirst')); return; }
    // Capacitor native
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Chromecast) {
      const C = window.Capacitor.Plugins.Chromecast;
      C.initialize({ receiverApplicationId: 'CC1AD845' }).then(() => C.show()).then(() => C.loadMedia({ url: st.url })).then(() => toast(t('toast.castStart'))).catch(e => toast(t('toast.castErr',{e:(e.message || e)})));
      return;
    }
    // Web SDK
    if (this.available && window.cast && cast.framework) {
      try {
        const ctx = cast.framework.CastContext.getInstance();
        ctx.setOptions({ receiverApplicationId: 'CC1AD845', autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
        ctx.requestSession().then(session => {
          const mi = new chrome.cast.media.MediaInfo(st.url, 'audio/mpeg');
          const req = new chrome.cast.media.LoadRequest(mi);
          return session.loadMedia(req);
        }).then(() => toast(t('toast.castStart')), e => toast(t('toast.castErr',{e:(e.message || e)})));
      } catch (e) { toast(t('toast.castUnavail')); }
      return;
    }
    toast(t('toast.castNone'));
  }
};

/* ---------------- init ---------------- */
function init() {
  S.favs = new Set(LS.get('favs', []));
  S.hist = LS.get('hist', []);
  S.theme = LS.get('theme', 'dark');
  S.autoplay = LS.get('autoplay', true);
  S.sleepMin = LS.get('sleep', 0);
  S.buf = LS.get('buf', 10);
  S.logoQ = LS.get('logoQ', 'mid');
  const pr = LS.get('premium', null);
  if (pr && pr.until > Date.now()) { S.premium = true; S.premiumUntil = pr.until; }

  if (window.AuraI18n) AuraI18n.apply(document);
  applyTheme(S.theme);
  updateFavUI();
  bind();
  // Фоновое воспроизведение: запрашиваем разрешение на уведомление (Android 13+)
  if (window.ForegroundRadio) {
    setTimeout(() => window.ForegroundRadio.requestPermission(), 1200);
  }
  Cast.init();
  Ad.init();
  if (window.fbA) window.fbA.ev('radio_open', { stations: 0 });
  loadData().then(() => {
    // восстанавливаем сессию (фоновое воспроизведение после перезагрузки)
    const restored = restoreSession();
    if (restored) toast(t('toast.resume'));
    const h = location.hash;
    const m = h.match(/country=([^&]+)/);
    if (m) go('country', decodeURIComponent(m[1]));
    // Прямой заход на /download (или #/download) — сразу открываем страницу скачивания
    const path = location.pathname.replace(/\/+$/, '');
    if (path.endsWith('/download') || h.replace(/^#\/?/, '') === 'download') go('download');
  });
  window.addEventListener('offline', () => toast(t('toast.noNet')));
  window.addEventListener('online', () => toast(t('toast.netBack')));
}

document.addEventListener('aura:locale', () => { if (S.loaded) refreshGrids(); });
document.addEventListener('DOMContentLoaded', init);
