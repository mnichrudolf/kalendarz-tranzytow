#!/usr/bin/env node
/* Generuje statyczne podstrony: dni, tygodnie, miesiące, blog (artykuły + paginacja), sitemap.xml
   oraz wstawia linki SEO do docs/index.html. Teksty opisów bierze z template.html (jedno źródło prawdy).
   Uruchamiać po build.py:  node build_pages.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname, DOCS = path.join(ROOT, 'docs');
const SITE = 'https://tranzytyastrologiczne.pl';
const PER_PAGE = 12;
const PHONE = '737 803 692';

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');

/* ---------- rdzeń opisów z szablonu ---------- */
const a0 = tpl.indexOf('/* ---------- słowniki ---------- */');
const a1 = tpl.indexOf('/* ---------- koło zodiaku ---------- */');
if (a0 < 0 || a1 < 0) throw new Error('Nie znaleziono znaczników w template.html');
const core = new Function('D', "var TZ='Europe/Warsaw';\n" + tpl.slice(a0, a1) +
  '\nreturn {PL:PL,SG:SG,ASP:ASP,BYDAY:BYDAY,VOC:VOC,describe:describe,posRow:posRow,lonOf:lonOf,retroOf:retroOf,dms:dms,' +
  'moonSVG:moonSVG,tm:tm,keyOf:keyOf,addDays:addDays,utcOf:utcOf,dowMon:dowMon,fWd:fWd,fDM:fDM,fMY:fMY,cap:cap,FIRST:FIRST,LAST:LAST,' +
  'MOONSIGN:MOONSIGN,dayStart:dayStart,PHN:PHN};')(D);
const { PL, SG, BYDAY, VOC, describe, posRow, lonOf, retroOf, dms, moonSVG, tm, keyOf, addDays, utcOf, dowMon, fWd, fDM, fMY, cap, FIRST, LAST, MOONSIGN, dayStart } = core;
const fDMY = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

/* ---------- narzędzia ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function clip(s, n) { s = s.replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; return s.slice(0, n - 1).replace(/[\s,;:.\-–]+\S*$/, '') + '…'; }
function write(rel, content) { const f = path.join(DOCS, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
function rmdir(rel) { fs.rmSync(path.join(DOCS, rel), { recursive: true, force: true }); }
const dateUTC = key => utcOf(key);
const dayLong = key => cap(fWd.format(dateUTC(key))) + ', ' + fDMY.format(dateUTC(key));
const dayShort = key => fDM.format(dateUTC(key));
const mondayOf = key => addDays(key, -dowMon(key));
const urlDay = k => '/dzien/' + k + '/', urlWeek = k => '/tydzien/' + k + '/', urlMonth = k => '/miesiac/' + k + '/';
const appDay = k => '/#dzien-' + k, appWeek = k => '/#tydzien-' + k, appMonth = k => '/#miesiac-' + k;

/* ---------- markdown (prosty) ---------- */
function mdInline(s) {
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]*)\)/g, (m, t, u) => '<a href="' + u + '"' + (u[0] === '/' ? '' : ' rel="noopener"') + '>' + t + '</a>');
  return s;
}
function md(src) {
  const blocks = String(src || '').replace(/\r/g, '').split(/\n{2,}/), out = [];
  for (let b of blocks) {
    b = b.trim(); if (!b) continue;
    if (/^### /.test(b)) out.push('<h3>' + mdInline(b.slice(4)) + '</h3>');
    else if (/^## /.test(b)) out.push('<h2>' + mdInline(b.slice(3)) + '</h2>');
    else if (/^(- |\* )/.test(b)) out.push('<ul>' + b.split('\n').filter(l => l.trim()).map(l => '<li>' + mdInline(l.replace(/^(- |\* )/, '')) + '</li>').join('') + '</ul>');
    else if (/^\d+\. /.test(b)) out.push('<ol>' + b.split('\n').filter(l => l.trim()).map(l => '<li>' + mdInline(l.replace(/^\d+\. /, '')) + '</li>').join('') + '</ol>');
    else if (/^> /.test(b)) out.push('<blockquote>' + mdInline(b.replace(/^> ?/gm, '').replace(/\n/g, ' ')) + '</blockquote>');
    else out.push('<p>' + mdInline(b.replace(/\n/g, ' ')) + '</p>');
  }
  return out.join('\n');
}

/* ---------- wspólna powłoka ---------- */
const topbarM = tpl.match(/<div class="topbar">[\s\S]*?<\/div>\s*(?=<header class="top">)/);
const footerM = tpl.match(/<footer>[\s\S]*?<\/footer>/);
if (!topbarM || !footerM) throw new Error('Nie znaleziono paska lub stopki w template.html');
const absImg = h => h.replace(/(src|href)="img\//g, '$1="/img/');
const TOPBAR = absImg(topbarM[0]);
let FOOTER = absImg(footerM[0]).replace('<span id="range" class="mono"></span>', '<span class="mono">' + FIRST + ' – ' + LAST + '</span>');

const articles = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'articles.json'), 'utf8')); } catch (e) { return []; }
})().filter(a => a && a.slug && a.title).sort((p, q) => (q.date || '').localeCompare(p.date || ''));

function seoLinks() {
  const today = (() => { const k = D.generated; return k < FIRST ? FIRST : (k > LAST ? LAST : k); })();
  const days = []; for (let i = 0; i < 7; i++) { const k = addDays(today, i); if (k <= LAST) days.push(k); }
  const m0 = today.slice(0, 7), m1 = (() => { const d = new Date(utcOf(m0 + '-01')); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  const L = [];
  L.push('<h2 class="fpol">Tranzyty na <em>najbliższe dni</em></h2><nav class="seol" aria-label="Tranzyty na najbliższe dni">' +
    days.map(k => '<a href="' + urlDay(k) + '">' + esc(dayShort(k)) + '</a>').join('') +
    '<a href="' + urlWeek(mondayOf(today)) + '">Cały tydzień</a><a href="' + urlMonth(m0) + '">' + esc(cap(fMY.format(utcOf(m0 + '-01')))) + '</a>' +
    (m1 <= LAST.slice(0, 7) ? '<a href="' + urlMonth(m1) + '">' + esc(cap(fMY.format(utcOf(m1 + '-01')))) + '</a>' : '') + '</nav>');
  if (articles.length) {
    L.push('<h2 class="fpol"><em>Artykuły</em> astrologiczne</h2><nav class="seol" aria-label="Artykuły">' +
      articles.slice(0, 4).map(a => '<a href="/artykuly/' + esc(a.slug) + '/">' + esc(a.title) + '</a>').join('') + '<a href="/artykuly/">Wszystkie artykuły</a></nav>');
  }
  return L.join('\n');
}
const SEOLINKS = seoLinks();
FOOTER = FOOTER.replace('<!--SEOLINKS-->', SEOLINKS);

const PERSON = { '@type': 'Person', name: 'Mariusz Staszewski', jobTitle: 'Astrolog', telephone: '+48737803692', url: SITE + '/' };
const sitemap = [];
function addUrl(loc, lastmod, changefreq, priority) { sitemap.push({ loc, lastmod, changefreq, priority }); }

function page(o) {
  const url = SITE + o.path;
  const ld = [].concat(o.ld || []).map(x => '<script type="application/ld+json">' + JSON.stringify(Object.assign({ '@context': 'https://schema.org' }, x)).replace(/</g, '\\u003c') + '</script>').join('\n');
  const og = o.image ? (o.image.startsWith('http') ? o.image : SITE + o.image) : SITE + '/img/og.jpg';
  return '<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(o.title) + '</title>\n<meta name="description" content="' + esc(o.desc) + '">\n' +
    '<link rel="canonical" href="' + url + '">\n<meta name="robots" content="' + (o.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large') + '">\n' +
    (o.prev ? '<link rel="prev" href="' + SITE + o.prev + '">\n' : '') + (o.next ? '<link rel="next" href="' + SITE + o.next + '">\n' : '') +
    '<meta name="theme-color" content="#100f2a">\n<meta property="og:locale" content="pl_PL">\n<meta property="og:site_name" content="Kalendarz Tranzytów">\n' +
    '<meta property="og:type" content="' + (o.type || 'website') + '">\n<meta property="og:title" content="' + esc(o.title) + '">\n<meta property="og:description" content="' + esc(o.desc) + '">\n' +
    '<meta property="og:url" content="' + url + '">\n<meta property="og:image" content="' + og + '">\n<meta name="twitter:card" content="summary_large_image">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">\n<link rel="apple-touch-icon" href="/img/favicon-180.png">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Karla:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/site.css?v=' + CSSV + '">\n' + ld + '\n</head>\n<body>\n<div class="wrap">\n' + (o.nav === 'art' ? TOPBAR.replace('<a href="/artykuly/">', '<a class="on" href="/artykuly/">') : TOPBAR.replace('<a href="/">Kalendarz</a>', '<a class="on" href="/">Kalendarz</a>')) + '\n<main class="page">\n' + o.body + '\n</main>\n' + FOOTER + '\n</div>\n</body>\n</html>\n';
}
function crumbs(list) {
  return { '@type': 'BreadcrumbList', itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })) };
}
function crumbHtml(list) {
  return '<nav class="crumbs" aria-label="Okruszki">' + list.map((c, i) => i < list.length - 1 ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : '<span>' + esc(c[0]) + '</span>').join(' <i>/</i> ') + '</nav>';
}

/* ---------- CSS ---------- */
function buildCss() {
  const root = (tpl.match(/:root\{[\s\S]*?\.mono\{[^}]*\}/) || [''])[0];
  const topbar = (tpl.match(/\/\* pasek marki z telefonem \*\/[\s\S]*?(?=\/\* nawigacja okresu \*\/)/) || [''])[0];
  const footer = (tpl.match(/footer\{margin-top:52px[\s\S]*?(?=\/\* telefon i tablet \*\/)/) || [''])[0];
  if (!root || !topbar || !footer) throw new Error('Nie udało się wyciąć CSS z template.html');
  const ext = fs.existsSync(path.join(DOCS, 'glyphs.woff2')) ? ['woff2', 'font/woff2'] : ['woff', 'font/woff'];
  const font = '@font-face{font-family:"AstroGlyphs";src:url(/glyphs.' + ext[0] + ') format("' + ext[0] + '");font-display:block}\n';
  return font + '*{box-sizing:border-box}\nhtml{background:var(--ink-0)}\n' + root + '\n' + topbar + '\n' + footer + '\n' + EXTRA_CSS;
}
const EXTRA_CSS = `
body{margin:0;color:var(--text);font:400 16px/1.6 var(--f-body);background:radial-gradient(1100px 620px at 82% -8%,#2a236a66,transparent 62%),radial-gradient(900px 560px at -6% 14%,#46215f45,transparent 60%),var(--ink-0);min-height:100%}
.wrap{position:relative;max-width:1100px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) 40px max(16px,env(safe-area-inset-left,0px))}
a{color:var(--gold)}a:hover{color:#f0d08e}
.g{font-family:var(--f-glyph);font-variant-emoji:text;font-style:normal;font-weight:400;line-height:1}
.mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:3px}
.topbar .mnav{display:flex;gap:4px;margin-left:12px}
.topbar .mnav a{padding:8px 12px;font:600 13px/1 var(--f-body);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;color:var(--text-dim);border-bottom:2px solid transparent}
.topbar .mnav a:hover{color:var(--text)}.topbar .mnav a.on{color:var(--gold);border-bottom-color:var(--gold)}
@media (max-width:640px){.topbar .mnav{margin-left:0;gap:0}.topbar .mnav a{padding:8px 8px;font-size:12px;letter-spacing:.06em}}
@media (max-width:480px){.topbar .mnav a:first-child{display:none}}
.seol{display:flex;flex-wrap:wrap;gap:8px}
.seol a{display:inline-block;text-decoration:none;font:500 13px/1.3 var(--f-body);color:var(--gold);background:var(--ink-2);border:1px solid var(--line);border-radius:999px;padding:7px 14px}
.seol a:hover{border-color:var(--gold-dim);background:var(--ink-3)}
.page{padding-top:4px;min-height:60vh}
.crumbs{font:500 12px/1.4 var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint);margin:6px 0 14px}
.crumbs a{color:var(--text-dim);text-decoration:none}.crumbs a:hover{color:var(--gold)}.crumbs i{font-style:normal;opacity:.5;margin:0 4px}
.page h1{margin:0 0 6px;font:600 clamp(28px,4.6vw,44px)/1.08 var(--f-display);letter-spacing:.005em;text-wrap:balance}
.page h2{margin:34px 0 12px;font:600 clamp(22px,3vw,28px)/1.15 var(--f-display);color:var(--gold)}
.page h3{margin:22px 0 8px;font:600 19px/1.2 var(--f-display);color:var(--text)}
.lead{font-size:18px;color:var(--text-dim);max-width:760px;margin:10px 0 0}
.meta{font:500 12px/1.5 var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);margin:6px 0 0}
.pnav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 4px}
.pbtn{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;border-radius:8px;border:1px solid var(--line);background:var(--ink-2);color:var(--text);text-decoration:none;font:500 14px/1 var(--f-body)}
.pbtn:hover{border-color:var(--gold-dim);background:var(--ink-3);color:var(--text)}
.pbtn.gold{background:var(--gold);color:#1b1433;border-color:var(--gold);font-weight:700}.pbtn.gold:hover{background:#f0d08e;color:#1b1433}
.pbtn.cur{border-color:var(--gold-dim);color:var(--gold)}
.box{background:var(--ink-2);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:18px 0}
.evl{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.evl li{display:grid;grid-template-columns:70px 96px minmax(0,1fr);gap:4px 14px;align-items:start;background:var(--ink-2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;padding:12px 14px}
.evl li.hard{border-left-color:var(--hard)}.evl li.soft{border-left-color:var(--soft)}.evl li.ingress{border-left-color:var(--ingress)}.evl li.station{border-left-color:var(--station)}.evl li.phase{border-left-color:var(--phase)}
.evl .t{font:500 14px/1.6 var(--f-mono);color:var(--gold)}
.evl .pl{font-size:20px;color:var(--text);letter-spacing:.06em;white-space:nowrap}
.evl h3{margin:0;font:600 17px/1.3 var(--f-display);color:var(--text)}
.evl p{margin:4px 0 0;font-size:14.5px;color:var(--text-dim)}
.evl .tag{display:inline-block;margin-left:8px;font:500 10.5px/1 var(--f-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);border:1px solid var(--line);border-radius:4px;padding:2px 6px;vertical-align:2px}
@media (max-width:640px){.evl li{grid-template-columns:56px minmax(0,1fr)}.evl .pl{grid-column:2;grid-row:1}.evl li>div{grid-column:2}}
table.pos{width:100%;border-collapse:collapse;font-size:15px}
table.pos th{font:500 11px/1.3 var(--f-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
table.pos td{padding:8px 10px;border-bottom:1px solid var(--line-soft)}
table.pos .g{font-size:18px;color:var(--gold)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin:12px 0}
.card{display:flex;flex-direction:column;background:var(--ink-2);border:1px solid var(--line);border-radius:12px;overflow:hidden;text-decoration:none;color:var(--text);transition:border-color .15s,transform .15s}
.card:hover{border-color:var(--gold-dim);transform:translateY(-2px);color:var(--text)}
.card .im{aspect-ratio:16/9;background:linear-gradient(135deg,#2a236a,#46215f);display:flex;align-items:center;justify-content:center;font-size:44px;color:var(--gold);overflow:hidden}
.card .im img{width:100%;height:100%;object-fit:cover;display:block}
.card .cb{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;flex:1}
.card .ck{font:500 11px/1.3 var(--f-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--gold-dim)}
.card h3{margin:0;font:600 20px/1.2 var(--f-display);color:var(--text)}
.card p{margin:0;font-size:14px;color:var(--text-dim)}
.daygrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.daygrid a{display:block;text-decoration:none;background:var(--ink-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--text)}
.daygrid a:hover{border-color:var(--gold-dim);background:var(--ink-3)}
.daygrid b{display:block;font:600 16px/1.2 var(--f-display);color:var(--gold)}
.daygrid span{display:block;font-size:12.5px;color:var(--text-dim);margin-top:2px}
.daygrid a.dim{opacity:.55}
.weeklist{display:grid;gap:12px}
.wk{background:var(--ink-2);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.wk h3{margin:0 0 4px}.wk h3 a{text-decoration:none}
.wk ul{margin:6px 0 0;padding-left:18px;color:var(--text-dim);font-size:14.5px}
.pager{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 6px;align-items:center}
.art{max-width:760px}
.art .hero{margin:18px 0 6px;border-radius:12px;overflow:hidden;border:1px solid var(--line)}
.art .hero img{display:block;width:100%;height:auto}
.art p,.art li{font-size:17.5px;line-height:1.75;color:#d9d4ee}
.art p{margin:0 0 1.1em}.art ul,.art ol{padding-left:22px;margin:0 0 1.2em}.art li{margin-bottom:.4em}
.art blockquote{margin:1.2em 0;padding:8px 18px;border-left:3px solid var(--gold);color:var(--text-dim);font:italic 500 20px/1.5 var(--f-display)}
.art strong{color:var(--text)}
.cta{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#221f4d,#2a1b4d);border:1px solid var(--gold-dim);border-radius:14px;padding:18px 22px;margin:34px 0 10px}
.cta b{display:block;font:600 22px/1.2 var(--f-display);color:var(--gold)}.cta span{display:block;color:var(--text-dim);font-size:14.5px;margin-top:3px}
.moonrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.vocl{margin:0;padding:0;list-style:none;display:grid;gap:6px}.vocl li{font-size:15px;color:var(--text-dim)}.vocl b{color:var(--text);font-family:var(--f-mono);font-weight:500}
@media (max-width:640px){.page h1{font-size:28px}}
`;
const CSSTEXT = (() => { const c = buildCss(); return c; })();
var CSSV = require('crypto').createHash('md5').update(CSSTEXT).digest('hex').slice(0, 8);

/* ---------- dane dnia ---------- */
function dayData(key) {
  const row = posRow(key);
  const evs = (BYDAY[key] || []).slice().sort((p, q) => p.t - q.t);
  const d0 = dayStart(key), d1 = dayStart(addDays(key, 1));
  const voc = VOC.filter(v => v.e > d0 && v.s < d1).map(v => ({ s: v.s, e: v.e, from: v.s < d0, to: v.e > d1 }));
  const moon = row ? dms(lonOf(row, 1)) : null, sun = row ? dms(lonOf(row, 0)) : null;
  let elong = 0, lit = 0;
  if (row) { elong = ((lonOf(row, 1) - lonOf(row, 0)) % 360 + 360) % 360; lit = Math.round((1 - Math.cos(elong * Math.PI / 180)) / 2 * 100); }
  return { key, row, evs, voc, moon, sun, elong, lit };
}
const isKey = e => !(e.k === 'A' && e.a === 1) && !(e.k === 'I' && e.b === 1);
function vocText(v, key) {
  const d0 = dayStart(key), d1 = dayStart(addDays(key, 1));
  const s = v.s < d0 ? 'od poprzedniego dnia' : 'od ' + tm(v.s);
  const e = v.e > d1 ? 'do następnego dnia' : 'do ' + tm(v.e);
  return s + ' ' + e;
}
function evHtml(e, day) {
  const r = describe(e);
  return '<li class="' + r.cls + '"><span class="t">' + tm(e.t) + '</span><span class="pl">' + r.plate + '</span><div><h3>' + esc(r.title) + '<span class="tag">' + esc(r.tag) + '</span></h3><p>' + esc(r.text) + '</p></div></li>';
}

/* ---------- strony dni ---------- */
const MOONSIGNTXT = MOONSIGN;
const ALLDAYS = []; for (let k = FIRST; k <= LAST; k = addDays(k, 1)) ALLDAYS.push(k);
function pickKeyTitles(evs, n) {
  const ks = evs.filter(isKey).map(e => ({ e, r: describe(e) })).sort((a, b) => b.e.w - a.e.w).slice(0, n);
  return ks.map(x => x.r.title);
}
function dayPage(key) {
  const dd = dayData(key), long = dayLong(key), prev = key > FIRST ? addDays(key, -1) : null, next = key < LAST ? addDays(key, 1) : null;
  const mon = mondayOf(key), mkey = key.slice(0, 7);
  const sg = dd.moon ? SG[dd.moon.sign] : null;
  const phaseEv = dd.evs.find(e => e.k === 'P');
  const titles = pickKeyTitles(dd.evs, 2);
  let desc = 'Tranzyty astrologiczne na ' + dayShort(key) + ' ' + key.slice(0, 4) + ': ' + (sg ? 'Księżyc w ' + sg.loc : '') + (titles.length ? ', ' + titles.join(', ') : '') + '.';
  if (dd.voc.length) desc += ' Księżyc bez kursu ' + vocText(dd.voc[0], key) + '.';
  desc = (desc + ' Astrolog Mariusz Staszewski.').length <= 158 ? desc + ' Astrolog Mariusz Staszewski.' : clip(desc, 158);
  const title = 'Tranzyty astrologiczne ' + dayShort(key) + ' ' + key.slice(0, 4) + ' · Astrolog Mariusz Staszewski';
  const phaseTxt = phaseEv ? describe(phaseEv).title : '';
  let lead = 'Księżyc znajduje się w znaku ' + (sg ? sg.gen : '') + ' (' + (dd.moon ? dd.moon.txt : '') + ' w południe), a Słońce w znaku ' + (dd.sun ? SG[dd.sun.sign].gen : '') + '. ' +
    (dd.elong < 180 ? 'Księżyc jest w fazie rosnącej' : 'Księżyc jest w fazie malejącej') + ', oświetlone jest około ' + dd.lit + '% tarczy.' + (phaseTxt ? ' ' + phaseTxt + '.' : '');
  const moonTxt = dd.moon ? MOONSIGNTXT[dd.moon.sign] : '';
  let body = crumbHtml([['Kalendarz tranzytów', '/'], [cap(fMY.format(utcOf(mkey + '-01'))), urlMonth(mkey)], [dayShort(key), urlDay(key)]]);
  body += '<h1>Tranzyty astrologiczne: ' + esc(long.replace(/^./, c => c.toLowerCase())) + '</h1><p class="lead">' + esc(lead) + '</p>';
  body += '<div class="pnav">' + (prev ? '<a class="pbtn" href="' + urlDay(prev) + '">← ' + esc(dayShort(prev)) + '</a>' : '') + '<a class="pbtn" href="' + urlWeek(mon) + '">Cały tydzień</a><a class="pbtn" href="' + urlMonth(mkey) + '">Cały miesiąc</a>' + (next ? '<a class="pbtn" href="' + urlDay(next) + '">' + esc(dayShort(next)) + ' →</a>' : '') + '<a class="pbtn gold" href="' + appDay(key) + '">Otwórz w interaktywnym kalendarzu</a></div>';
  if (dd.moon) body += '<h2>Księżyc w znaku ' + esc(sg.gen) + '</h2><div class="box moonrow"><span style="flex:none">' + moonSVG(dd.elong, 56) + '</span><p style="margin:0;flex:1;min-width:220px">' + esc(moonTxt) + '</p></div>';
  body += '<h2>Wydarzenia astrologiczne dnia</h2>';
  body += dd.evs.length ? '<ul class="evl">' + dd.evs.map(e => evHtml(e)).join('') + '</ul>' : '<p>W tym dniu nie ma dokładnych aspektów ani ingresów, które wyznaczają jego ton. Wpływ Księżyca w znaku opisano powyżej.</p>';
  if (dd.voc.length) body += '<h2>Księżyc bez kursu</h2><div class="box"><ul class="vocl">' + dd.voc.map(v => '<li><b>' + esc(vocText(v, key)) + '</b>: w tym czasie Księżyc nie tworzy już dokładnych aspektów przed zmianą znaku. Tradycyjnie odkłada się wtedy ważne decyzje, podpisywanie umów i nowe starty.</li>').join('') + '</ul></div>';
  if (dd.row) {
    body += '<h2>Położenia planet w południe</h2><div class="box" style="padding:8px 10px;overflow-x:auto"><table class="pos"><thead><tr><th>Planeta</th><th>Znak</th><th>Stopień</th><th>Ruch</th></tr></thead><tbody>';
    for (let b = 0; b <= 10; b++) { const p = dms(lonOf(dd.row, b)); body += '<tr><td><span class="g">' + PL[b].g + '</span> ' + esc(PL[b].n) + '</td><td><span class="g">' + SG[p.sign].g + '</span> ' + esc(SG[p.sign].n) + '</td><td class="mono">' + p.txt + '</td><td>' + (b === 10 ? 'wsteczny (średni bieg)' : (retroOf(dd.row, b) ? 'wsteczny ℞' : 'prosty')) + '</td></tr>'; }
    body += '</tbody></table></div>';
  }
  body += ctaBlock();
  body += '<p class="meta">Dane liczone z efemeryd Swiss Ephemeris dla Warszawy (czas polski). Autor: Astrolog Mariusz Staszewski.</p>';
  const url = urlDay(key);
  addUrl(SITE + url, D.generated, 'monthly', '0.6');
  write('dzien/' + key + '/index.html', page({ path: url, title, desc, body, ld: [{ '@type': 'WebPage', name: 'Tranzyty astrologiczne: ' + long, description: desc, inLanguage: 'pl', url: SITE + url, author: PERSON, isPartOf: { '@type': 'WebSite', name: 'Kalendarz Tranzytów', url: SITE + '/' } }, crumbs([['Kalendarz tranzytów', '/'], [cap(fMY.format(utcOf(mkey + '-01'))), urlMonth(mkey)], [dayShort(key), url]])] }));
}
function ctaBlock() {
  return '<div class="cta"><div><b>Chcesz wiedzieć, co te tranzyty znaczą dla Ciebie?</b><span>Konsultacja astrologiczna z Astrologiem Mariuszem Staszewskim, telefonicznie lub online.</span></div><a class="pbtn gold" href="tel:+48737803692">Zadzwoń ' + PHONE + '</a></div>';
}

/* ---------- strony tygodni ---------- */
const WEEKS = []; { let m = mondayOf(FIRST); while (m <= LAST) { WEEKS.push(m); m = addDays(m, 7); } }
function weekPage(mon) {
  const end = addDays(mon, 6), prev = addDays(mon, -7), next = addDays(mon, 7);
  const days = []; for (let i = 0; i < 7; i++) { const k = addDays(mon, i); if (k >= FIRST && k <= LAST) days.push(k); }
  const mk = mon.slice(0, 7);
  const range = fDM.format(utcOf(mon)) + ' – ' + fDMY.format(utcOf(end));
  const keyAll = []; days.forEach(k => (BYDAY[k] || []).filter(isKey).forEach(e => keyAll.push(e)));
  const top = keyAll.slice().sort((a, b) => b.w - a.w).slice(0, 3).map(e => describe(e).title);
  const desc = clip('Tranzyty astrologiczne na tydzień ' + range + ': ' + top.join(', ') + '. Księżyc, aspekty, ingresy i stacje planet. Astrolog Mariusz Staszewski.', 158);
  const title = 'Tranzyty na tydzień ' + range + ' · Astrolog Mariusz Staszewski';
  let body = crumbHtml([['Kalendarz tranzytów', '/'], [cap(fMY.format(utcOf(mk + '-01'))), urlMonth(mk)], ['Tydzień ' + fDM.format(utcOf(mon)), urlWeek(mon)]]);
  body += '<h1>Tranzyty astrologiczne na tydzień ' + esc(range) + '</h1><p class="lead">Najważniejsze ingresy, aspekty, stacje planet i fazy Księżyca w tym tygodniu, dzień po dniu. Czas polski (Warszawa).</p>';
  body += '<div class="pnav">' + (prev >= mondayOf(FIRST) ? '<a class="pbtn" href="' + urlWeek(prev) + '">← Poprzedni tydzień</a>' : '') + (next <= LAST ? '<a class="pbtn" href="' + urlWeek(next) + '">Następny tydzień →</a>' : '') + '<a class="pbtn gold" href="' + appWeek(mon) + '">Otwórz w interaktywnym kalendarzu</a></div>';
  body += '<h2>Dzień po dniu</h2><div class="weeklist">';
  days.forEach(k => {
    const dd = dayData(k), sg = dd.moon ? SG[dd.moon.sign] : null, ks = (BYDAY[k] || []).filter(isKey).sort((a, b) => a.t - b.t);
    body += '<div class="wk"><h3><a href="' + urlDay(k) + '">' + esc(dayLong(k)) + '</a></h3><div class="meta" style="margin:0">Księżyc w ' + (sg ? esc(sg.loc) : '') + (dd.voc.length ? ' · bez kursu ' + esc(vocText(dd.voc[0], k)) : '') + '</div>';
    body += ks.length ? '<ul>' + ks.map(e => '<li><span class="mono">' + tm(e.t) + '</span> ' + esc(describe(e).title) + '</li>').join('') + '</ul>' : '<p style="margin:6px 0 0;font-size:14px;color:var(--text-dim)">Dzień bez wielkich zmian na niebie. Ton nadaje Księżyc.</p>';
    body += '</div>';
  });
  body += '</div>' + ctaBlock();
  const url = urlWeek(mon);
  addUrl(SITE + url, D.generated, 'monthly', '0.5');
  write('tydzien/' + mon + '/index.html', page({ path: url, title, desc, body, ld: [{ '@type': 'WebPage', name: 'Tranzyty na tydzień ' + range, description: desc, inLanguage: 'pl', url: SITE + url, author: PERSON }, crumbs([['Kalendarz tranzytów', '/'], ['Tydzień ' + fDM.format(utcOf(mon)), url]])] }));
}

/* ---------- strony miesięcy ---------- */
const MONTHS = []; { let m = FIRST.slice(0, 7); while (m <= LAST.slice(0, 7)) { MONTHS.push(m); const d = new Date(utcOf(m + '-01')); d.setUTCMonth(d.getUTCMonth() + 1); m = d.toISOString().slice(0, 7); } }
function monthPage(mk) {
  const idx = MONTHS.indexOf(mk), prev = MONTHS[idx - 1], next = MONTHS[idx + 1];
  const days = ALLDAYS.filter(k => k.slice(0, 7) === mk);
  const label = cap(fMY.format(utcOf(mk + '-01')));
  const all = []; days.forEach(k => (BYDAY[k] || []).forEach(e => all.push(e)));
  const phases = all.filter(e => e.k === 'P'), ingr = all.filter(e => e.k === 'I' && e.b > 1), stat = all.filter(e => e.k === 'S');
  const slowU = all.filter(e => e.k === 'A' && e.a !== 1 && e.w >= 5);
  const top = pickKeyTitles(all, 3);
  const desc = clip('Tranzyty astrologiczne: ' + label.toLowerCase() + '. ' + (phases.length ? phases.map(e => describe(e).title).slice(0, 2).join(', ') + '. ' : '') + (top.length ? top.join(', ') + '. ' : '') + 'Astrolog Mariusz Staszewski.', 158);
  const title = 'Tranzyty astrologiczne: ' + label.toLowerCase() + ' · Astrolog Mariusz Staszewski';
  let body = crumbHtml([['Kalendarz tranzytów', '/'], [label, urlMonth(mk)]]);
  body += '<h1>Tranzyty astrologiczne: ' + esc(label.toLowerCase()) + '</h1><p class="lead">Fazy Księżyca, zaćmienia, ingresy planet, stacje retrogradacji i najważniejsze aspekty miesiąca. Czas polski (Warszawa).</p>';
  body += '<div class="pnav">' + (prev ? '<a class="pbtn" href="' + urlMonth(prev) + '">← ' + esc(cap(fMY.format(utcOf(prev + '-01')))) + '</a>' : '') + (next ? '<a class="pbtn" href="' + urlMonth(next) + '">' + esc(cap(fMY.format(utcOf(next + '-01')))) + ' →</a>' : '') + '<a class="pbtn gold" href="' + appMonth(mk) + '">Otwórz w interaktywnym kalendarzu</a></div>';
  const sect = (h, evs) => evs.length ? '<h2>' + h + '</h2><ul class="evl">' + evs.slice().sort((a, b) => a.t - b.t).map(e => { const r = describe(e); return '<li class="' + r.cls + '"><span class="t">' + esc(dayShort(e.day)) + '<br>' + tm(e.t) + '</span><span class="pl">' + r.plate + '</span><div><h3><a href="' + urlDay(e.day) + '" style="text-decoration:none;color:inherit">' + esc(r.title) + '</a><span class="tag">' + esc(r.tag) + '</span></h3><p>' + esc(r.text) + '</p></div></li>'; }).join('') + '</ul>' : '';
  body += sect('Fazy Księżyca i zaćmienia', phases) + sect('Ingresy planet', ingr) + sect('Stacje i ruch wsteczny planet', stat) + sect('Aspekty wolnych planet', slowU);
  body += '<h2>Dzień po dniu</h2><div class="daygrid">';
  days.forEach(k => { const dd = dayData(k), sg = dd.moon ? SG[dd.moon.sign] : null; body += '<a href="' + urlDay(k) + '"><b>' + esc(dayShort(k)) + '</b><span>' + esc(cap(fWd.format(utcOf(k)))) + ' · Księżyc w ' + (sg ? esc(sg.loc) : '') + '</span></a>'; });
  body += '</div>' + ctaBlock();
  const url = urlMonth(mk);
  addUrl(SITE + url, D.generated, 'weekly', '0.7');
  write('miesiac/' + mk + '/index.html', page({ path: url, title, desc, body, ld: [{ '@type': 'WebPage', name: 'Tranzyty astrologiczne: ' + label, description: desc, inLanguage: 'pl', url: SITE + url, author: PERSON }, crumbs([['Kalendarz tranzytów', '/'], [label, url]])] }));
}

/* ---------- blog ---------- */
function artCard(a) {
  return '<a class="card" href="/artykuly/' + esc(a.slug) + '/"><div class="im">' + (a.image ? '<img src="' + esc(a.image) + '" alt="' + esc(a.title) + '" loading="lazy" width="640" height="360">' : '<span class="g">' + '☉☽☿♀♂♃♄'[(a.slug.length) % 7] + '</span>') + '</div><div class="cb"><span class="ck">' + esc(a.category || 'Astrologia') + ' · ' + esc(fDMY.format(utcOf(a.date))) + '</span><h3>' + esc(a.title) + '</h3><p>' + esc(clip(a.description || strip(md(a.body)), 150)) + '</p></div></a>';
}
function blogIndex() {
  const pages = Math.max(1, Math.ceil(articles.length / PER_PAGE));
  for (let p = 1; p <= pages; p++) {
    const slice = articles.slice((p - 1) * PER_PAGE, p * PER_PAGE);
    const url = p === 1 ? '/artykuly/' : '/artykuly/strona/' + p + '/';
    const title = 'Artykuły astrologiczne' + (p > 1 ? ' (strona ' + p + ')' : '') + ' · Astrolog Mariusz Staszewski';
    const desc = clip('Artykuły astrologiczne Astrologa Mariusza Staszewskiego: tranzyty, Księżyc, retrogradacje, zaćmienia, horoskop urodzeniowy i praktyczna astrologia na co dzień.' + (p > 1 ? ' Strona ' + p + '.' : ''), 158);
    let body = crumbHtml([['Kalendarz tranzytów', '/'], ['Artykuły', '/artykuly/']]);
    body += '<h1>Artykuły astrologiczne</h1><p class="lead">Praktyczna astrologia bez mgły: jak czytać tranzyty, Księżyc, retrogradacje i zaćmienia oraz co naprawdę mówi horoskop urodzeniowy. Pisze Astrolog Mariusz Staszewski.</p>';
    body += slice.length ? '<div class="grid">' + slice.map(artCard).join('') + '</div>' : '<p>Artykuły pojawią się wkrótce.</p>';
    if (pages > 1) {
      body += '<nav class="pager" aria-label="Strony artykułów">' + (p > 1 ? '<a class="pbtn" href="' + (p === 2 ? '/artykuly/' : '/artykuly/strona/' + (p - 1) + '/') + '">← Nowsze</a>' : '');
      for (let i = 1; i <= pages; i++) body += '<a class="pbtn' + (i === p ? ' cur' : '') + '" href="' + (i === 1 ? '/artykuly/' : '/artykuly/strona/' + i + '/') + '"' + (i === p ? ' aria-current="page"' : '') + '>' + i + '</a>';
      body += (p < pages ? '<a class="pbtn" href="/artykuly/strona/' + (p + 1) + '/">Starsze →</a>' : '') + '</nav>';
    }
    body += ctaBlock();
    const rel = p === 1 ? 'artykuly/index.html' : 'artykuly/strona/' + p + '/index.html';
    addUrl(SITE + url, articles[0] ? articles[0].date : D.generated, 'weekly', p === 1 ? '0.8' : '0.5');
    write(rel, page({ nav: 'art', path: url, title, desc, body, prev: p > 1 ? (p === 2 ? '/artykuly/' : '/artykuly/strona/' + (p - 1) + '/') : null, next: p < pages ? '/artykuly/strona/' + (p + 1) + '/' : null,
      ld: [{ '@type': 'CollectionPage', name: 'Artykuły astrologiczne', description: desc, inLanguage: 'pl', url: SITE + url, author: PERSON }, crumbs([['Kalendarz tranzytów', '/'], ['Artykuły', '/artykuly/']])] }));
  }
}
function articlePage(a, i) {
  const url = '/artykuly/' + a.slug + '/';
  const desc = clip(a.description || strip(md(a.body)), 158);
  const others = articles.filter(x => x.slug !== a.slug).slice(0, 3);
  let body = crumbHtml([['Kalendarz tranzytów', '/'], ['Artykuły', '/artykuly/'], [a.title, url]]);
  body += '<article class="art"><h1>' + esc(a.title) + '</h1><p class="meta">' + esc(a.category || 'Astrologia') + ' · ' + esc(fDMY.format(utcOf(a.date))) + ' · Autor: Astrolog Mariusz Staszewski</p>';
  if (a.image) body += '<div class="hero"><img src="' + esc(a.image) + '" alt="' + esc(a.title) + '" width="1200" height="675"></div>';
  body += md(a.body) + '</article>';
  body += ctaBlock();
  if (others.length) body += '<h2>Czytaj także</h2><div class="grid">' + others.map(artCard).join('') + '</div>';
  body += '<div class="pnav"><a class="pbtn" href="/artykuly/">← Wszystkie artykuły</a><a class="pbtn gold" href="/">Kalendarz tranzytów</a></div>';
  addUrl(SITE + url, a.updated || a.date, 'monthly', '0.8');
  write('artykuly/' + a.slug + '/index.html', page({ nav: 'art', path: url, title: a.title + ' · Astrolog Mariusz Staszewski', desc, body, image: a.image, type: 'article',
    ld: [{ '@type': 'Article', headline: a.title, description: desc, inLanguage: 'pl', datePublished: a.date, dateModified: a.updated || a.date, author: PERSON, publisher: { '@type': 'Person', name: 'Mariusz Staszewski' }, mainEntityOfPage: SITE + url, image: a.image ? (a.image.startsWith('http') ? a.image : SITE + a.image) : SITE + '/img/og.jpg' }, crumbs([['Kalendarz tranzytów', '/'], ['Artykuły', '/artykuly/'], [a.title, url]])] }));
}

/* ---------- uruchomienie ---------- */
['dzien', 'tydzien', 'miesiac', 'artykuly'].forEach(rmdir);
write('site.css', CSSTEXT);
addUrl(SITE + '/', D.generated, 'daily', '1.0');
blogIndex();
articles.forEach(articlePage);
MONTHS.forEach(monthPage);
WEEKS.forEach(weekPage);
ALLDAYS.forEach(dayPage);

write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemap.map(u => '  <url><loc>' + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod><changefreq>' + u.changefreq + '</changefreq><priority>' + u.priority + '</priority></url>').join('\n') + '\n</urlset>\n');

/* linki SEO w stopce strony głównej */
const idx = path.join(DOCS, 'index.html');
if (fs.existsSync(idx)) {
  let h = fs.readFileSync(idx, 'utf8');
  if (h.includes('<!--SEOLINKS-->')) h = h.replace('<!--SEOLINKS-->', SEOLINKS);
  fs.writeFileSync(idx, h);
}
console.log('podstrony: dni', ALLDAYS.length, ', tygodnie', WEEKS.length, ', miesiące', MONTHS.length, ', artykuły', articles.length, ', sitemap', sitemap.length, 'adresów');
