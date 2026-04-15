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
      const prompt = buildOcrPrompt();
      assert.ok(prompt.includes('Manchu'));
    });

    it('mentions Möllendorf romanization', () => {
      const prompt = buildOcrPrompt();
      assert.ok(prompt.includes('Möllendorf'));
    });

    it('asks for Chinese text identification', () => {
      const prompt = buildOcrPrompt();
      assert.ok(prompt.includes('Chinese'));
    });
  });

  describe('buildTranslationPrompt', () => {
    it('includes grammar context', () => {
      const prompt = buildTranslationPrompt('', {});
      assert.ok(prompt.includes('SOV word order'));
      assert.ok(prompt.includes('agglutinative'));
    });

    it('includes dictionary entries when provided', () => {
      const entries = {
        'amba': 'AMBA big, great, important',
        'dorgi': 'DORGI inner, within',
      };
      const prompt = buildTranslationPrompt('', entries);
      assert.ok(prompt.includes('AMBA big, great'));
      assert.ok(prompt.includes('DORGI inner'));
    });

    it('includes XML section tags', () => {
      const prompt = buildTranslationPrompt('', {});
      assert.ok(prompt.includes('<OCR>'));
      assert.ok(prompt.includes('<Translation>'));
      assert.ok(prompt.includes('<CharacterMap>'));
      assert.ok(prompt.includes('<WordByWord>'));
      assert.ok(prompt.includes('<Notes>'));
      assert.ok(prompt.includes('<ChineseText>'));
    });

    it('includes prior OCR text when provided', () => {
      const prompt = buildTranslationPrompt('amba gurun', {});
      assert.ok(prompt.includes('Prior OCR Pass'));
      assert.ok(prompt.includes('amba gurun'));
    });

    it('omits prior OCR section when romanizedText is empty', () => {
      const prompt = buildTranslationPrompt('', {});
      assert.ok(!prompt.includes('Prior OCR Pass'));
    });

    it('includes case suffix reference', () => {
      const prompt = buildTranslationPrompt('', {});
      assert.ok(prompt.includes('accusative -be'));
      assert.ok(prompt.includes('genitive -i/-ni'));
      assert.ok(prompt.includes('dative -de'));
    });

    it('includes verb ending reference', () => {
      const prompt = buildTranslationPrompt('', {});
      assert.ok(prompt.includes('aorist -mbi'));
      assert.ok(prompt.includes('past -ha/-he/-ho'));
    });
  });
});
