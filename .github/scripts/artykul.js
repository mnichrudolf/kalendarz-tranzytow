// Przetwarza zgłoszenie (Issue) z formularza: dodaje, poprawia albo usuwa artykuł w content/articles.json.
'use strict';
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '..', 'content', 'articles.json');
const OUT = process.env.WYNIK_PLIK || '/tmp/wynik.txt';
function fail(m) { fs.writeFileSync(OUT, 'Nie udało się: ' + m); process.exit(1); }
function ok(m) { fs.writeFileSync(OUT, m); process.exit(0); }
const body = String(process.env.ISSUE_BODY || '').replace(/\r/g, '');
const F = {}; body.split(/^### /m).slice(1).forEach(b => { const i = b.indexOf('\n'); const k = b.slice(0, i).trim(); let v = b.slice(i + 1).trim(); if (v === '_No response_') v = ''; F[k] = v; });
const M = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z' };
const slugify = t => String(t).toLowerCase().replace(/[ąćęłńóśźż]/g, c => M[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
let arts = []; try { arts = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { }
const save = () => fs.writeFileSync(FILE, JSON.stringify(arts, null, 1) + '\n');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
if ('Adres artykułu do usunięcia' in F) {
  const slug = slugify(F['Adres artykułu do usunięcia'].replace(/^.*\/artykuly\//, ''));
  const n = arts.length; arts = arts.filter(a => a.slug !== slug);
  if (arts.length === n) fail('nie ma artykułu o adresie „' + slug + '”.');
  save(); ok('Usunięto artykuł „' + slug + '”. Strona przebuduje się za 2–3 minuty.');
}
const title = F['Tytuł'] || '', desc = F['Opis dla Google (1–2 zdania, ok. 120–155 znaków)'] || '', text = F['Treść artykułu'] || '';
if (!title) fail('brak tytułu.'); if (!desc) fail('brak opisu.'); if (text.length < 80) fail('treść jest za krótka.');
const slug = slugify(F['Adres artykułu (opcjonalnie)'] || title); if (!slug) fail('nie da się utworzyć adresu z tytułu.');
let date = F['Data publikacji (RRRR-MM-DD)'] || today; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('data musi mieć postać RRRR-MM-DD.');
const idx = arts.findIndex(a => a.slug === slug);
const rec = { slug, title, date, category: F['Kategoria'] || 'Astrologia', description: desc, image: idx >= 0 ? (arts[idx].image || '') : '', body: text };
if (idx >= 0) { rec.updated = today; arts[idx] = rec; } else arts.push(rec);
save(); ok((idx >= 0 ? 'Poprawiono' : 'Dodano') + ' artykuł „' + title + '” (/artykuly/' + slug + '/). Strona przebuduje się za 2–3 minuty.');
