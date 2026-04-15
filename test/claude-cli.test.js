const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseOcrResponse, parseTranslationResponse, parseCharacterDetail } = require('../lib/claude-cli');

describe('parseOcrResponse', () => {
  it('parses valid JSON with columns and readingOrder', () => {
    const raw = JSON.stringify({
      columns: [{ index: 0, side: 'left', words: [{ manchu: 'ᡥᠠᡶᠠᠨ', romanization: 'hafan', bbox: [10, 20, 50, 80], confidence: 'high' }] }],
      chineseText: '官',
      readingOrder: ['hafan']
    });
    const result = parseOcrResponse(raw);
    assert.ok(result);
    assert.equal(result.columns.length, 1);
    assert.equal(result.columns[0].words[0].romanization, 'hafan');
    assert.deepEqual(result.readingOrder, ['hafan']);
    assert.equal(result.chineseText, '官');
  });

  it('strips markdown code fences', () => {
    const json = { columns: [{ index: 0, words: [] }], readingOrder: [] };
    const raw = '```json\n' + JSON.stringify(json) + '\n```';
    const result = parseOcrResponse(raw);
    assert.ok(result);
    assert.equal(result.columns.length, 1);
  });

  it('builds readingOrder from columns if missing', () => {
    const raw = JSON.stringify({
      columns: [
        { index: 0, words: [{ romanization: 'amba' }, { romanization: 'gurun' }] },
        { index: 1, words: [{ romanization: 'dorgi' }] }
      ]
    });
    const result = parseOcrResponse(raw);
    assert.deepEqual(result.readingOrder, ['amba', 'gurun', 'dorgi']);
  });

  it('returns null for invalid JSON', () => {
    const result = parseOcrResponse('This is not JSON at all');
    assert.equal(result, null);
  });

  it('returns null for JSON without columns array', () => {
    const result = parseOcrResponse('{"words": []}');
    assert.equal(result, null);
  });

  it('returns null for empty string', () => {
    const result = parseOcrResponse('');
    assert.equal(result, null);
  });

  it('handles "Reached max turns" error output', () => {
    const result = parseOcrResponse('Error: Reached max turns (2)');
    assert.equal(result, null);
  });
});

describe('parseTranslationResponse', () => {
  it('extracts all XML sections', () => {
    const raw = `
<WordByWord>
amba — big (adjective)
gurun — country (noun)
</WordByWord>
<Translation>Within the great country</Translation>
<ChineseText>大国之内</ChineseText>
<CharacterDetail>
hafan | 官 (guān) | official
dorgi | 内 (nèi) | inner
</CharacterDetail>
<Notes>High confidence reading</Notes>`;

    const result = parseTranslationResponse(raw);
    assert.ok(result.wordbyword.includes('amba — big'));
    assert.equal(result.translation, 'Within the great country');
    assert.equal(result.chinesetext, '大国之内');
    assert.equal(result.notes, 'High confidence reading');
    assert.ok(result.characterdetail.includes('hafan'));
  });

  it('handles missing sections gracefully', () => {
    const raw = '<Translation>Just a translation</Translation>';
    const result = parseTranslationResponse(raw);
    assert.equal(result.translation, 'Just a translation');
    assert.equal(result.wordbyword, '');
    assert.equal(result.notes, '');
  });

  it('treats unstructured response as raw translation', () => {
    const raw = 'This is a plain text response without any XML tags.';
    const result = parseTranslationResponse(raw);
    assert.equal(result.translation, raw);
    assert.ok(result.notes.includes('not in structured format'));
  });

  it('trims whitespace from extracted sections', () => {
    const raw = '<Translation>  \n  text  \n  </Translation>';
    const result = parseTranslationResponse(raw);
    assert.equal(result.translation, 'text');
  });

  it('handles case-insensitive tag matching', () => {
    const raw = '<translation>lowercase tags</translation>';
    const result = parseTranslationResponse(raw);
    assert.equal(result.translation, 'lowercase tags');
  });

  it('extracts only first match of each tag', () => {
    const raw = '<Translation>first</Translation> some text <Translation>second</Translation>';
    const result = parseTranslationResponse(raw);
    assert.equal(result.translation, 'first');
  });
});

describe('parseCharacterDetail', () => {
  it('parses pipe-delimited lines into lookup map', () => {
    const text = `hafan | 官 (guān) | official, functionary
dorgi | 内 (nèi) | inner, within`;
    const map = parseCharacterDetail(text);
    assert.equal(map.hafan.chinese, '官 (guān)');
    assert.equal(map.hafan.english, 'official, functionary');
    assert.equal(map.dorgi.chinese, '内 (nèi)');
  });

  it('normalizes romanization to lowercase', () => {
    const text = 'Hafan | 官 | official';
    const map = parseCharacterDetail(text);
    assert.ok(map.hafan);
  });

  it('strips trailing ? from romanization', () => {
    const text = 'gemu? | 皆 | all';
    const map = parseCharacterDetail(text);
    assert.ok(map.gemu);
  });

  it('skips lines with fewer than 3 parts', () => {
    const text = 'hafan | official\ndorgi | 内 | inner';
    const map = parseCharacterDetail(text);
    assert.ok(!map.hafan);
    assert.ok(map.dorgi);
  });

  it('returns empty map for empty input', () => {
    assert.deepEqual(parseCharacterDetail(''), {});
    assert.deepEqual(parseCharacterDetail(null), {});
  });
});
