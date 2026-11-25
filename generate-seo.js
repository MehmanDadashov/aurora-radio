#!/usr/bin/env node
/**
 * Aurora Radio — SEO Landing Page Generator
 * Creates country/genre landing pages, sitemap.xml, robots.txt
 * for passive organic traffic on Firebase Hosting.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'public/data');
const OUT_DIR = path.join(__dirname, 'public/seo');
const BASE_URL = 'https://radio.ai-studio.se';

// Load data
const stationsData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf8'));
const stations = stationsData.stations || [];
const countries = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'countries.json'), 'utf8')).countries;
const genresData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'genres.json'), 'utf8'));
const genres = genresData.genres || genresData.categories || genresData;

// Helpers
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getCountryName(code) {
  const c = countries.find(x => x.code === code || x.iso === code);
  return c ? c.name : code;
}

function countStationsByCountry(countryCode) {
  return stations.filter(s => s.country === countryCode || s.iso === countryCode).length;
}

function countStationsByGenre(genreName) {
  return stations.filter(s => s.genre === genreName).length;
}

function getTopStationsByCountry(countryCode, limit = 12) {
  return stations
    .filter(s => s.country === countryCode || s.iso === countryCode)
    .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    .slice(0, limit)
    .map(s => ({
      name: s.name,
      logo: s.logo,
      url: s.url,
      genre: s.genre,
      country: s.country,
      bitrate: s.bitrate,
      codec: s.codec,
      votes: s.votes
    }));
}

function getTopStationsByGenre(genreName, limit = 12) {
  return stations
    .filter(s => s.genre === genreName)
    .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    .slice(0, limit)
    .map(s => ({
      name: s.name,
      logo: s.logo,
      url: s.url,
      country: s.country,
      bitrate: s.bitrate,
      codec: s.codec,
      votes: s.votes
    }));
}

// JSON-LD structured data for Radio
function jsonLdCountry(countryCode, countryName, count, topStations) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${countryName} Radio Stations — Aurora Radio`,
    'description': `Listen to ${count} free radio stations from ${countryName}. Music, news, talk, sports — live streaming worldwide.`,
    'url': `${BASE_URL}/seo/country/${slugify(countryCode)}.html`,
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': count,
      'itemListElement': topStations.map((s, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'RadioBroadcastService',
          'name': s.name,
          'genre': s.genre,
          'broadcastDisplayName': s.name,
          'broadcastFrequency': {
            '@type': 'BroadcastFrequencySpecification',
            'broadcastFrequencyValue': s.url,
            'broadcastSignalModulation': s.codec || 'MP3',
            'broadcastFrequencyUnit': s.bitrate ? `${s.bitrate}kbps` : ''
          },
          'logo': s.logo,
          'url': `${BASE_URL}/player.html?url=${encodeURIComponent(s.url)}&name=${encodeURIComponent(s.name)}`
        }
      }))
    }
  };
}

function jsonLdGenre(genreName, count, topStations) {
  const genreInfo = genres.find(g => g.name === genreName);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': `${genreName.charAt(0).toUpperCase() + genreName.slice(1)} Radio Stations — Aurora Radio`,
    'description': `Browse ${count} free ${genreName} radio stations from around the world. Live streaming, no registration required.`,
    'url': `${BASE_URL}/seo/genre/${slugify(genreName)}.html`,
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': count,
      'itemListElement': topStations.map((s, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'RadioBroadcastService',
          'name': s.name,
          'genre': genreName,
          'broadcastDisplayName': s.name,
          'broadcastFrequency': {
            '@type': 'BroadcastFrequencySpecification',
            'broadcastFrequencyValue': s.url,
            'broadcastSignalModulation': s.codec || 'MP3',
            'broadcastFrequencyUnit': s.bitrate ? `${s.bitrate}kbps` : ''
          },
          'logo': s.logo,
          'url': `${BASE_URL}/player.html?url=${encodeURIComponent(s.url)}&name=${encodeURIComponent(s.name)}`
        }
      }))
    }
  };
}

// HTML template for landing pages
function landingPageHtml({ title, description, jsonLd, canonical, h1, lead, stations, breadcrumbs, backLink }) {
  const stHtml = stations.map(s => `
    <article class="seo-card" itemscope itemtype="https://schema.org/RadioBroadcastService">
      ${s.logo ? `<img itemprop="image" src="${s.logo}" alt="${s.name} logo" loading="lazy" class="seo-card-logo">` : ''}
      <div class="seo-card-body">
        <h3 itemprop="name">🇦🇫 ${s.name}</h3>
        <p class="seo-card-meta">
          ${s.genre ? `<span itemprop="genre">${s.genre}</span>` : ''}
          ${s.country ? `<span itemprop="name country">${s.country} <span style="font-size:0.85em;color:var(--text-2);">🇦🇫</span></span>` : ''}
          ${s.bitrate ? `<span>${s.bitrate}kbps ${s.codec || ''}</span>` : ''}
        </p>
        <a href="${BASE_URL}/player.html?url=${encodeURIComponent(s.url)}&name=${encodeURIComponent(s.name)}" class="btn-primary btn-sm" itemprop="url">Listen</a>
      </div>
    </article>
  `).join('');

  const breadcrumbHtml = breadcrumbs.map((b, i) =>
    i === breadcrumbs.length - 1
      ? `<span aria-current="page">${b.label}</span>`
      : `<a href="${b.url}">${b.label}</a>`
  ).join(' <span class="breadcrumb-sep">/</span> ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${BASE_URL}/icon.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${BASE_URL}/icon.png">
  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1872308537877958" crossorigin="anonymous"></script>
  <style>
    :root{--bg:#07080f;--bg-2:#0b0d18;--surface:rgba(255,255,255,.045);--text:#f2f4fb;--text-2:#9aa3b8;--accent:#22d3ee;--border:rgba(255,255,255,.09);--radius:16px;--shadow:0 12px 40px rgba(0,0,0,.45)}
    *{box-sizing:border-box}body{margin:0;font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
    .wrap{max-width:1100px;margin:0 auto;padding:24px 16px}
    header{margin-bottom:24px}
    .breadcrumb{font-size:13px;color:var(--text-2);margin-bottom:16px}
    .breadcrumb a{color:var(--text-2);text-decoration:none}.breadcrumb a:hover{color:var(--accent)}
    .breadcrumb-sep{margin:0 6px}
    h1{font-size:28px;font-weight:800;margin:0 0 8px;background:linear-gradient(120deg,#22d3ee 0%,#7c5cff 55%,#f472b6 110%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .lead{color:var(--text-2);font-size:16px;margin:0 0 24px;max-width:700px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .seo-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;display:flex;gap:12px;transition:border-color .15s,transform .15s}
    .seo-card:hover{border-color:var(--accent);transform:translateY(-2px)}
    .seo-card-logo{width:64px;height:64px;object-fit:contain;border-radius:8px;flex-shrink:0}
    .seo-card-body{flex:1;min-width:0}
    .seo-card-body h3{margin:0 0 6px;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .seo-card-meta{margin:0 0 10px;font-size:12px;color:var(--text-2);display:flex;flex-wrap:wrap;gap:8px}
    .seo-card-meta span{background:var(--surface);padding:2px 8px;border-radius:999px}
    .btn-primary{display:inline-block;background:linear-gradient(120deg,#22d3ee 0%,#7c5cff 55%,#f472b6 110%);color:#07080f;font-weight:700;padding:10px 16px;border-radius:10px;text-decoration:none;font-size:13px;transition:filter .15s,transform .15s}
    .btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
    .btn-sm{padding:8px 14px;font-size:12px}
    .back-link{display:inline-flex;align-items:center;gap:6px;margin-top:24px;color:var(--text-2);text-decoration:none;font-size:14px}
    .seo-ad{margin:20px auto;max-width:728px;min-height:90px;display:flex;align-items:center;justify-content:center;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;padding:4px}
    .seo-ad .adsbygoogle{display:block;width:100%;max-height:90px;overflow:hidden}
    .back-link:hover{color:var(--accent)}
    @media (max-width:600px){.seo-card{flex-direction:column;align-items:flex-start}.seo-card-logo{width:100%;height:auto;max-height:180px}}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
      <h1>${h1}</h1>
      <p class="lead">${lead}</p>
    </header>
    <main>
      ${stations.length ? `<div class="grid" role="list">${stHtml}</div>` : '<p>No stations found.</p>'}
    </main>
    <div class="seo-ad" role="complementary" aria-label="Advertisement">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-1872308537877958"
           data-ad-slot="6393666225"
           data-ad-format="horizontal"
           data-full-width-responsive="false"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    </div>
    <footer>
      <a class="back-link" href="${backLink}">← Back to Aurora Radio</a>
    </footer>
  </div>
</body>
</html>`;
}

// Generate country pages
function generateCountryPages() {
  console.log('Generating country pages...');
  const countryDir = path.join(OUT_DIR, 'country');
  fs.mkdirSync(countryDir, { recursive: true });

  const urls = [];

  countries.forEach(c => {
    const code = c.iso || c.code;
    const name = c.name;
    const count = countStationsByCountry(code);
    if (count === 0) return;

    const top = getTopStationsByCountry(code);
    const slug = slugify(code);
    const canonical = `${BASE_URL}/seo/country/${slug}.html`;

    const ld = jsonLdCountry(code, name, count, top);
    const html = landingPageHtml({
      title: `${name} Radio Stations — Aurora Radio`,
      description: `Listen to ${count} free radio stations from ${name}. Music, news, talk, sports — live streaming worldwide.`,
      jsonLd: ld,
      canonical,
      h1: `${name} Radio Stations`,
      lead: `${count} radio stations from ${name}. Click any station to listen instantly in your browser.`,
      stations: top,
      breadcrumbs: [
        { label: 'Aurora Radio', url: BASE_URL },
        { label: 'Countries', url: `${BASE_URL}/seo/countries.html` },
        { label: name, url: canonical }
      ],
      backLink: BASE_URL
    });

    fs.writeFileSync(path.join(countryDir, `${slug}.html`), html);
    urls.push(canonical);
    console.log(`  ${slug}.html — ${count} stations`);
  });

  // Countries index
  const countriesWithStations = countries.filter(c => countStationsByCountry(c.iso || c.code) > 0);
  const countriesIndexHtml = landingPageHtml({
    title: 'Radio Stations by Country — Aurora Radio',
    description: `Browse free radio stations from ${countriesWithStations.length} countries. Music, news, sports, talk — live streaming worldwide.`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': 'Radio Stations by Country',
      'description': `Browse free radio stations from ${countriesWithStations.length} countries.`,
      'url': `${BASE_URL}/seo/countries.html`,
      'mainEntity': {
        '@type': 'ItemList',
        'itemListElement': countriesWithStations.map((c, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'item': {
            '@type': 'WebPage',
            'name': `${c.name} (${countStationsByCountry(c.iso || c.code)} stations)`,
            'url': `${BASE_URL}/seo/country/${slugify(c.iso || c.code)}.html`
          }
        }))
      }
    },
    canonical: `${BASE_URL}/seo/countries.html`,
    h1: 'Radio Stations by Country',
    lead: `${countriesWithStations.length} countries, ${stations.length} total stations. Select a country to browse its radio stations.`,
    stations: countriesWithStations.slice(0, 50).map(c => ({
      name: `${c.name} (${countStationsByCountry(c.iso || c.code)} stations)`,
      logo: '',
      url: `${BASE_URL}/seo/country/${slugify(c.iso || c.code)}.html`,
      genre: '',
      bitrate: '',
      codec: ''
    })),
    breadcrumbs: [
      { label: 'Aurora Radio', url: BASE_URL },
      { label: 'Countries', url: `${BASE_URL}/seo/countries.html` }
    ],
    backLink: BASE_URL
  });

  fs.writeFileSync(path.join(OUT_DIR, 'countries.html'), countriesIndexHtml);
  urls.push(`${BASE_URL}/seo/countries.html`);
  console.log(`  countries.html — index page`);

  return urls;
}

// Generate genre pages
function generateGenrePages() {
  console.log('Generating genre pages...');
  const genreDir = path.join(OUT_DIR, 'genre');
  fs.mkdirSync(genreDir, { recursive: true });

  const urls = [];

  genres.forEach(g => {
    const name = g.name;
    const count = countStationsByGenre(name);
    if (count === 0) return;

    const top = getTopStationsByGenre(name);
    const slug = slugify(name);
    const canonical = `${BASE_URL}/seo/genre/${slug}.html`;

    const ld = jsonLdGenre(name, count, top);
    const html = landingPageHtml({
      title: `${name.charAt(0).toUpperCase() + name.slice(1)} Radio Stations — Aurora Radio`,
      description: `Browse ${count} free ${name} radio stations from around the world. Live streaming, no registration required.`,
      jsonLd: ld,
      canonical,
      h1: `${name.charAt(0).toUpperCase() + name.slice(1)} Radio`,
      lead: `${count} ${name} radio stations. Click any station to listen instantly.`,
      stations: top,
      breadcrumbs: [
        { label: 'Aurora Radio', url: BASE_URL },
        { label: 'Genres', url: `${BASE_URL}/seo/genres.html` },
        { label: name.charAt(0).toUpperCase() + name.slice(1), url: canonical }
      ],
      backLink: BASE_URL
    });

    fs.writeFileSync(path.join(genreDir, `${slug}.html`), html);
    urls.push(canonical);
    console.log(`  ${slug}.html — ${count} stations`);
  });

  // Genres index
  const genresWithStations = genres.filter(g => countStationsByGenre(g.name) > 0);
  const genresIndexHtml = landingPageHtml({
    title: 'Radio Stations by Genre — Aurora Radio',
    description: 'Browse free radio stations by genre: Pop, Rock, Electronic, Jazz, Classical, News, Sports and more.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': 'Radio Stations by Genre',
      'description': 'Browse free radio stations by genre.',
      'url': `${BASE_URL}/seo/genres.html`,
      'mainEntity': {
        '@type': 'ItemList',
        'itemListElement': genresWithStations.map((g, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'item': {
            '@type': 'WebPage',
            'name': `${g.name.charAt(0).toUpperCase() + g.name.slice(1)} (${countStationsByGenre(g.name)} stations)`,
            'url': `${BASE_URL}/seo/genre/${slugify(g.name)}.html`
          }
        }))
      }
    },
    canonical: `${BASE_URL}/seo/genres.html`,
    h1: 'Radio Stations by Genre',
    lead: `${genresWithStations.length} genres, ${stations.length} total stations. Select a genre to browse.`,
    stations: genresWithStations.map(g => ({
      name: `${g.name.charAt(0).toUpperCase() + g.name.slice(1)} (${countStationsByGenre(g.name)} stations)`,
      logo: '',
      url: `${BASE_URL}/seo/genre/${slugify(g.name)}.html`,
      genre: '',
      bitrate: '',
      codec: ''
    })),
    breadcrumbs: [
      { label: 'Aurora Radio', url: BASE_URL },
      { label: 'Genres', url: `${BASE_URL}/seo/genres.html` }
    ],
    backLink: BASE_URL
  });

  fs.writeFileSync(path.join(OUT_DIR, 'genres.html'), genresIndexHtml);
  urls.push(`${BASE_URL}/seo/genres.html`);
  console.log(`  genres.html — index page`);

  return urls;
}

// Generate sitemap.xml
function generateSitemap(allUrls) {
  console.log('Generating sitemap.xml...');
  const today = new Date().toISOString().split('T')[0];
  const staticUrls = [
    `${BASE_URL}/`,
    `${BASE_URL}/download.html`,
    `${BASE_URL}/seo/countries.html`,
    `${BASE_URL}/seo/genres.html`
  ];

  const all = [...new Set([...staticUrls, ...allUrls])].sort();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${all.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${url === BASE_URL + '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml);
  console.log(`  sitemap.xml — ${all.length} URLs`);
}

// Generate robots.txt
function generateRobots() {
  console.log('Generating robots.txt...');
  const txt = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/seo/sitemap.xml

# Aurora Radio — Free live radio player
# No private areas to disallow
`;
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), txt);
  console.log(`  robots.txt`);
}

// Main
function main() {
  console.log('=== Aurora SEO Generator ===');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const countryUrls = generateCountryPages();
  const genreUrls = generateGenrePages();
  const allUrls = [...countryUrls, ...genreUrls];

  generateSitemap(allUrls);
  generateRobots();

  console.log('=== Done ===');
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Pages: ${allUrls.length + 4} (countries + genres + indexes)`);
}

main();