const fs = require('fs');
const path = require('path');

let dictionary = null;

const SUFFIXES = [
  'ngge', 'ngga', 'nggo',
  'habi', 'hebi', 'hobi',
  'mbi', 'nde',
  'me', 'fi', 'ci',
  'ha', 'he', 'ho',
  'ra', 're', 'ro',
  'be', 'de', 'ni',
  'i'
];

function load() {
  if (dictionary) return dictionary;
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'norman-dictionary.json'), 'utf8');
  dictionary = JSON.parse(raw);
  console.log(`Dictionary loaded: ${Object.keys(dictionary).length} entries`);
  return dictionary;
}

function stripSuffix(word) {
  const stems = [word];
  for (const suffix of SUFFIXES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      stems.push(word.slice(0, -suffix.length));
      // Also try with trailing consonant doubling removed
      const stem = word.slice(0, -suffix.length);
      if (stem.length > 1 && stem[stem.length - 1] === stem[stem.length - 2]) {
        stems.push(stem.slice(0, -1));
      }
    }
  }
  return [...new Set(stems)];
}

function lookupWords(romanizedWords) {
  const dict = load();
  const results = {};

  for (const word of romanizedWords) {
    const normalized = word.toLowerCase().trim();
    if (!normalized || normalized.length < 2) continue;

    const candidates = stripSuffix(normalized);
    for (const candidate of candidates) {
      if (dict[candidate]) {
        results[normalized] = dict[candidate];
        break;
      }
    }
    // Also try multi-word lookup (e.g., "aba bargiyambi")
    if (!results[normalized]) {
      for (const key of Object.keys(dict)) {
        if (key.startsWith(normalized + ' ') || key.endsWith(' ' + normalized)) {
          results[normalized] = dict[key];
          break;
        }
      }
    }
  }

  return results;
}

function getRandomSample(n = 50) {
  const dict = load();
  const keys = Object.keys(dict);
  const sample = {};
  for (let i = 0; i < Math.min(n, keys.length); i++) {
    const idx = Math.floor(Math.random() * keys.length);
    sample[keys[idx]] = dict[keys[idx]];
  }
  return sample;
}

module.exports = { load, lookupWords, stripSuffix, getRandomSample };
