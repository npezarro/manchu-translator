const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseResponse } = require('../lib/claude-cli');

describe('parseResponse', () => {
  it('extracts all XML sections', () => {
    const raw = `
<OCR>amba gurun i dorgi</OCR>
<CharacterMap>
amba → 大 → big
gurun → 国 → country
</CharacterMap>
<Romanization>amba gurun i dorgi</Romanization>
<WordByWord>
amba — big (adjective)
gurun — country (noun)
</WordByWord>
<Translation>Within the great country</Translation>
<ChineseText>大国之内</ChineseText>
<Notes>High confidence reading</Notes>`;

    const result = parseResponse(raw);
    assert.equal(result.ocr, 'amba gurun i dorgi');
    assert.ok(result.charactermap.includes('amba → 大 → big'));
    assert.equal(result.romanization, 'amba gurun i dorgi');
    assert.ok(result.wordbyword.includes('amba — big'));
    assert.equal(result.translation, 'Within the great country');
    assert.equal(result.chinesetext, '大国之内');
    assert.equal(result.notes, 'High confidence reading');
  });

  it('handles missing sections gracefully', () => {
    const raw = '<Translation>Just a translation</Translation>';
    const result = parseResponse(raw);
    assert.equal(result.translation, 'Just a translation');
    assert.equal(result.ocr, '');
    assert.equal(result.charactermap, '');
    assert.equal(result.notes, '');
  });

  it('treats unstructured response as raw translation', () => {
    const raw = 'This is a plain text response without any XML tags.';
    const result = parseResponse(raw);
    assert.equal(result.translation, raw);
    assert.ok(result.notes.includes('not in structured format'));
  });

  it('trims whitespace from extracted sections', () => {
    const raw = '<OCR>  \n  amba gurun  \n  </OCR><Translation>  text  </Translation>';
    const result = parseResponse(raw);
    assert.equal(result.ocr, 'amba gurun');
    assert.equal(result.translation, 'text');
  });

  it('handles case-insensitive tag matching', () => {
    const raw = '<translation>lowercase tags</translation>';
    const result = parseResponse(raw);
    assert.equal(result.translation, 'lowercase tags');
  });

  it('handles multiline content in sections', () => {
    const raw = `<WordByWord>
amba — big (adjective)
gurun — country (noun)
i — genitive particle
dorgi — inner (noun)
</WordByWord>
<Translation>Within the great country</Translation>`;

    const result = parseResponse(raw);
    assert.ok(result.wordbyword.includes('amba — big'));
    assert.ok(result.wordbyword.includes('dorgi — inner'));
    assert.equal(result.translation, 'Within the great country');
  });

  it('returns all 7 section keys', () => {
    const result = parseResponse('plain text');
    const keys = Object.keys(result);
    assert.ok(keys.includes('ocr'));
    assert.ok(keys.includes('charactermap'));
    assert.ok(keys.includes('romanization'));
    assert.ok(keys.includes('wordbyword'));
    assert.ok(keys.includes('translation'));
    assert.ok(keys.includes('chinesetext'));
    assert.ok(keys.includes('notes'));
  });

  it('handles empty string input', () => {
    const result = parseResponse('');
    // Empty string has no XML tags and is falsy, so translation = '' and notes set
    assert.ok(typeof result === 'object');
    assert.ok(result.notes.includes('not in structured format'));
  });

  it('extracts only first match of each tag', () => {
    const raw = '<Translation>first</Translation> some text <Translation>second</Translation>';
    const result = parseResponse(raw);
    assert.equal(result.translation, 'first');
  });

  it('handles content with special characters', () => {
    const raw = '<OCR>šu žan ūba ŋai</OCR><Translation>Testing special chars: <>&"\'</Translation>';
    const result = parseResponse(raw);
    assert.equal(result.ocr, 'šu žan ūba ŋai');
  });
});
