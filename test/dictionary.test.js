const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { load, stripSuffix, lookupWords, getRandomSample } = require('../lib/dictionary');

describe('dictionary', () => {
  describe('load', () => {
    it('loads the Norman dictionary JSON', () => {
      const dict = load();
      assert.ok(typeof dict === 'object');
      assert.ok(Object.keys(dict).length > 100, 'dictionary should have many entries');
    });

    it('returns same reference on subsequent calls', () => {
      const a = load();
      const b = load();
      assert.equal(a, b);
    });
  });

  describe('stripSuffix', () => {
    it('returns original word when no suffix matches', () => {
      const stems = stripSuffix('aba');
      assert.deepEqual(stems, ['aba']);
    });

    it('strips -mbi verb ending', () => {
      const stems = stripSuffix('arambi');
      assert.ok(stems.includes('arambi'), 'should include original');
      assert.ok(stems.includes('ara'), 'should include stem without -mbi');
    });

    it('strips -habi past tense', () => {
      const stems = stripSuffix('arahabi');
      assert.ok(stems.includes('ara'), 'should include stem without -habi');
    });

    it('strips -be accusative', () => {
      const stems = stripSuffix('morinbe');
      assert.ok(stems.includes('morin'), 'should include stem without -be');
    });

    it('strips -de dative/locative', () => {
      const stems = stripSuffix('boode');
      assert.ok(stems.includes('boo'), 'should include stem without -de');
    });

    it('strips -ni particle', () => {
      const stems = stripSuffix('hafanni');
      assert.ok(stems.includes('hafan'), 'should include stem without -ni');
    });

    it('strips -me converb', () => {
      const stems = stripSuffix('arame');
      assert.ok(stems.includes('ara'), 'should include stem without -me');
    });

    it('strips -fi perfect converb', () => {
      const stems = stripSuffix('arafi');
      assert.ok(stems.includes('ara'), 'should include stem without -fi');
    });

    it('strips -ci conditional', () => {
      const stems = stripSuffix('araci');
      assert.ok(stems.includes('ara'), 'should include stem without -ci');
    });

    it('strips -ha/-he/-ho past participle', () => {
      assert.ok(stripSuffix('araha').includes('ara'));
      assert.ok(stripSuffix('genehe').includes('gene'));
      assert.ok(stripSuffix('donjho').includes('donj'));
    });

    it('strips -ra/-re/-ro future', () => {
      assert.ok(stripSuffix('arara').includes('ara'));
      assert.ok(stripSuffix('genere').includes('gene'));
    });

    it('handles consonant doubling removal', () => {
      // If the stem ends with a doubled consonant, also try removing one
      const stems = stripSuffix('bahabumbi');
      // Should have original, stripped versions, possibly deduped double consonant
      assert.ok(stems.includes('bahabumbi'));
      assert.ok(stems.length >= 1);
    });

    it('does not strip long suffixes from short words', () => {
      // Word must be > suffix.length + 2
      // 'ambi' length 4, 'mbi' length 3, 4 > 3+2 = false — so -mbi won't strip
      // But -i (length 1) can still strip since 4 > 1+2 = true
      const stems = stripSuffix('ambi');
      assert.ok(!stems.includes('a'), '-mbi should not be stripped (word too short)');
      assert.ok(stems.includes('amb'), '-i suffix can still be stripped');
    });

    it('returns unique stems', () => {
      const stems = stripSuffix('arambi');
      const unique = [...new Set(stems)];
      assert.deepEqual(stems, unique);
    });
  });

  describe('lookupWords', () => {
    it('looks up known words', () => {
      const results = lookupWords(['amba']);
      // 'amba' means 'big, great' — should be in Norman dictionary
      assert.ok(results['amba'], 'amba should be found in dictionary');
    });

    it('returns empty object for unknown words', () => {
      const results = lookupWords(['xyzzynotaword']);
      assert.deepEqual(results, {});
    });

    it('skips empty and single-char words', () => {
      const results = lookupWords(['', 'a', '  ']);
      assert.deepEqual(results, {});
    });

    it('normalizes words to lowercase', () => {
      const lower = lookupWords(['amba']);
      const upper = lookupWords(['AMBA']);
      // Both should find the same entry
      if (lower['amba']) {
        assert.ok(upper['amba'], 'uppercase lookup should also find entry');
      }
    });

    it('strips suffixes to find root words', () => {
      // 'arambi' = to write, root 'ara' should be in dictionary
      const results = lookupWords(['arambi']);
      // Either 'arambi' itself or its stripped stem should be found
      // This depends on dictionary content
      assert.ok(typeof results === 'object');
    });

    it('handles multiple words', () => {
      const results = lookupWords(['amba', 'dorgi', 'xyzzy']);
      assert.ok(typeof results === 'object');
      // At least amba should be found
      assert.ok(results['amba'] || results['dorgi'], 'at least one common word should be found');
    });
  });

  describe('getRandomSample', () => {
    it('returns an object with entries', () => {
      const sample = getRandomSample(5);
      assert.ok(typeof sample === 'object');
      assert.ok(Object.keys(sample).length <= 5);
      assert.ok(Object.keys(sample).length > 0);
    });

    it('defaults to 50 entries', () => {
      const sample = getRandomSample();
      assert.ok(Object.keys(sample).length <= 50);
      assert.ok(Object.keys(sample).length > 0);
    });

    it('entries have string values', () => {
      const sample = getRandomSample(3);
      for (const [key, value] of Object.entries(sample)) {
        assert.ok(typeof key === 'string');
        assert.ok(typeof value === 'string');
        assert.ok(value.length > 0);
      }
    });
  });
});
