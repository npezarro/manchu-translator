#!/usr/bin/env node
// One-time script to parse Jerry_Norman_Dict.txt into JSON
const fs = require('fs');

const raw = fs.readFileSync(process.argv[2] || '/tmp/norman_dict.txt', 'utf8');
const lines = raw.split('\n');
const dict = {};
let currentKey = null;
let currentValue = '';

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // Detect headword: starts with uppercase letter(s), followed by space or digit
  // Headwords are ALL CAPS at the start of the line
  const match = trimmed.match(/^([A-ZŠŽŪŊ][A-ZŠŽŪŊ' ]*?)(?:\s+(\d+\..+|(?:a |an |the |to |see |cf\.|caus\.|same ).+|[a-z].+|\(.+))?$/);

  if (match) {
    // Save previous entry
    if (currentKey) {
      dict[currentKey] = currentValue.trim();
    }
    const headword = match[1].trim();
    currentKey = headword.toLowerCase();
    currentValue = trimmed;
  } else if (currentKey) {
    currentValue += ' ' + trimmed;
  }
}
// Save last entry
if (currentKey) {
  dict[currentKey] = currentValue.trim();
}

const outPath = process.argv[3] || './data/norman-dictionary.json';
fs.writeFileSync(outPath, JSON.stringify(dict, null, 0));
console.log(`Parsed ${Object.keys(dict).length} entries to ${outPath}`);
