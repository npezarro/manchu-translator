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

// Suffixes that attach to a verb stem. Norman lists verbs only under their
// -mbi citation form, so the bare stem is either absent (gene-) or a DIFFERENT
// word (ara- "chaff" for arambi "to write"). Try stem + 'mbi' first.
const VERB_SUFFIXES = new Set([
  'habi', 'hebi', 'hobi', 'mbi',
  'me', 'fi',
  'ha', 'he', 'ho',
  'ra', 're', 'ro'
]);
// -ci is both the noun ablative (adaci "from the raft") and the verb
// conditional (genembi -> geneci), so the noun keeps precedence and the
// -mbi form is only a fallback.
const NOUN_OR_VERB_SUFFIXES = new Set(['ci']);

function stripSuffix(word) {
  const stems = [word];
  for (const suffix of SUFFIXES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      const bases = [stem];
      // Also try with trailing consonant doubling removed
      if (stem.length > 1 && stem[stem.length - 1] === stem[stem.length - 2]) {
        bases.push(stem.slice(0, -1));
      }
      for (const base of bases) {
        if (VERB_SUFFIXES.has(suffix)) stems.push(base + 'mbi');
        stems.push(base);
        if (NOUN_OR_VERB_SUFFIXES.has(suffix)) stems.push(base + 'mbi');
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
