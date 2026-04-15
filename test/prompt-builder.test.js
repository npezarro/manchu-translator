const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOcrPrompt, buildTranslationPrompt } = require('../lib/prompt-builder');

describe('prompt-builder', () => {
  describe('buildOcrPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = buildOcrPrompt();
      assert.ok(typeof prompt === 'string');
      assert.ok(prompt.length > 50);
    });

    it('mentions Manchu script', () => {
      assert.ok(buildOcrPrompt().includes('Manchu'));
    });

    it('mentions Möllendorf romanization', () => {
      assert.ok(buildOcrPrompt().includes('Möllendorf'));
    });

    it('asks for Chinese text identification', () => {
      assert.ok(buildOcrPrompt().includes('Chinese'));
    });

    it('requests JSON output format', () => {
      const prompt = buildOcrPrompt();
      assert.ok(prompt.includes('JSON'));
      assert.ok(prompt.includes('columns'));
      assert.ok(prompt.includes('readingOrder'));
      assert.ok(prompt.includes('bbox'));
    });
  });

  describe('buildTranslationPrompt', () => {
    const emptyOcr = { columns: [], readingOrder: [], chineseText: '' };

    it('includes grammar context', () => {
      const prompt = buildTranslationPrompt(emptyOcr, {});
      assert.ok(prompt.includes('SOV word order'));
      assert.ok(prompt.includes('agglutinative'));
    });

    it('includes dictionary entries when provided', () => {
      const entries = {
        'amba': 'AMBA big, great, important',
        'dorgi': 'DORGI inner, within',
      };
      const prompt = buildTranslationPrompt(emptyOcr, entries);
      assert.ok(prompt.includes('AMBA big, great'));
      assert.ok(prompt.includes('DORGI inner'));
    });

    it('includes required XML section tags', () => {
      const prompt = buildTranslationPrompt(emptyOcr, {});
      assert.ok(prompt.includes('<ManchuTranslation>'));
      assert.ok(prompt.includes('<ChineseTranslation>'));
      assert.ok(prompt.includes('<ViabilityAssessment>'));
      assert.ok(prompt.includes('<WordByWord>'));
      assert.ok(prompt.includes('<Notes>'));
      assert.ok(prompt.includes('<ChineseText>'));
      assert.ok(prompt.includes('<CharacterDetail>'));
    });

    it('includes OCR data in prompt when provided', () => {
      const ocrData = {
        columns: [{ index: 0, side: 'left', words: [{ manchu: 'ᡥᠠᡶᠠᠨ', romanization: 'hafan', confidence: 'high' }] }],
        readingOrder: ['hafan'],
        chineseText: '官'
      };
      const prompt = buildTranslationPrompt(ocrData, {});
      assert.ok(prompt.includes('hafan'));
      assert.ok(prompt.includes('Column 0'));
    });

    it('shows no matches message when dictionary is empty', () => {
      const prompt = buildTranslationPrompt(emptyOcr, {});
      assert.ok(prompt.includes('no matches found'));
    });

    it('includes case suffix reference', () => {
      const prompt = buildTranslationPrompt(emptyOcr, {});
      assert.ok(prompt.includes('accusative -be'));
      assert.ok(prompt.includes('genitive -i/-ni'));
      assert.ok(prompt.includes('dative -de'));
    });

    it('includes verb ending reference', () => {
      const prompt = buildTranslationPrompt(emptyOcr, {});
      assert.ok(prompt.includes('aorist -mbi'));
      assert.ok(prompt.includes('past -ha/-he/-ho'));
    });
  });
});
