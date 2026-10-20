'use strict';
// Loads the game data (words, places, questions, ...) from public/locales for server-driven games.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'locales');
const cache = {};
let custom = {};
const CUSTOM_LABEL = { en: 'Custom', de: 'Eigene', nl: 'Eigen', fr: 'Perso', es: 'Propias' };
function setCustom(c) { custom = c || {}; Object.keys(cache).forEach((k) => delete cache[k]); }

function readLocale(code) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, code + '.json'), 'utf8')).data || {}; } catch (e) { return {}; }
}
function languages() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).map((l) => l.code); } catch (e) { return ['en']; }
}
function isLang(code) { return typeof code === 'string' && languages().indexOf(code) !== -1; }

function get(code) {
  const lang = isLang(code) ? code : 'en';
  if (!cache[lang]) {
    const en = readLocale('en');
    const loc = lang === 'en' ? en : readLocale(lang);
    const words = Object.assign({}, loc.words || en.words || {});
    if (custom.words && custom.words.length) words.custom = { label: CUSTOM_LABEL[lang] || 'Custom', list: custom.words };
    cache[lang] = {
      words,
      places: loc.places || en.places || [],
      questions: (loc.questions || en.questions || []).concat(custom.questions || []),
      bomb: (loc.bomb || en.bomb || []).concat(custom.bomb || []),
      spectrum: loc.spectrum || en.spectrum || []
    };
  }
  return cache[lang];
}
function allWords(d) {
  return [].concat.apply([], Object.keys(d.words).map((k) => d.words[k].list));
}
module.exports = { get, isLang, allWords, setCustom };
