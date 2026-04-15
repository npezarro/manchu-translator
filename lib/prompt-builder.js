const GRAMMAR_CONTEXT = `Manchu Language Reference:
- Head-final, agglutinative, SOV word order
- Written in vertical script derived from Mongolian (top-to-bottom, left-to-right columns)
- Romanization uses Möllendorf system

Case suffixes: accusative -be, genitive -i/-ni, dative -de, ablative -ci, prolative -deri
Verb endings: aorist -mbi, past -ha/-he/-ho, future -ra/-re/-ro
Converbs: imperfect -me, perfect -fi, conditional -ci
Participles: imperfect -ra/-re/-ro, perfect -ha/-he/-ho
Common particles: be (accusative), de (dative/locative), ci (ablative/conditional), ni (question)
Negation: akū (general), ume + imperative (prohibitive)
Plural: -sa/-se/-so, -ta/-te/-to
Possessive: mini (my), sini (your), ini (his/her)`;

function buildOcrPrompt() {
  return `You are an expert in Manchu script (a vertical writing system derived from Mongolian script).

Examine this document image. Identify every Manchu word/character group visible.

${GRAMMAR_CONTEXT}

## Output Format
Return ONLY a JSON object — no markdown fences, no commentary, no text before or after the JSON.

{
  "columns": [
    {
      "index": 0,
      "side": "right" or "left",
      "words": [
        {
          "manchu": "ᡥᠠᡶᠠᠨ",
          "romanization": "hafan",
          "bbox": [x, y, width, height],
          "confidence": "high"
        }
      ]
    }
  ],
  "chineseText": "Any Chinese characters visible, transcribed",
  "readingOrder": ["hafan", "dorgi", "bithe"]
}

## Valid Möllendorf Romanization Characters
Romanization MUST only use these characters (all lowercase):
a, e, i, o, u, ū, n, ng, k, g, h, b, p, s, š, t, d, l, m, c, j, y, r, f, w, ts, dz, sy, cy, jy
Plus: space (multi-syllable words), - (hyphenation), ? (trailing only, for uncertainty)

## Examples of Correct Output

Single column with three words:
{"columns":[{"index":0,"side":"right","words":[
  {"manchu":"ᡥᠠᡶᠠᠨ","romanization":"hafan","bbox":[120,50,40,90],"confidence":"high"},
  {"manchu":"ᡩᠣᡵᡤᡳ","romanization":"dorgi","bbox":[120,160,40,85],"confidence":"high"},
  {"manchu":"ᠪᡳᡨᡥᡝ","romanization":"bithe","bbox":[120,260,40,80],"confidence":"high"}
]}],"chineseText":"内阁","readingOrder":["hafan","dorgi","bithe"]}

Agglutinated verb form:
{"manchu":"ᠠᡵᠠᠮᠪᡳ","romanization":"arambi","bbox":[200,100,35,95],"confidence":"medium"}

Suffix-bearing word:
{"manchu":"ᡤᡠᡵᡠᠨᡩᡝ","romanization":"gurunde","bbox":[80,300,38,100],"confidence":"high"}

## Rules
- "columns" are Manchu text columns, reading left-to-right across columns, top-to-bottom within each column
- "manchu" is the Manchu Unicode script for the word
- "romanization" is the Möllendorf romanization — MUST be lowercase, MUST only use valid characters listed above
- "bbox" is [x, y, width, height] in pixels, estimating the bounding box of that word in the image. Be as accurate as possible — these will be used to crop the characters from the image.
- "confidence" is "high", "medium", or "low" for how confident you are in the reading
- "readingOrder" is a flat array of ALL romanized words in document reading order
- "chineseText" captures any Chinese characters visible (they may be parallel translations)
- If the document has multiple pages or sections, include all in one columns array
- Mark uncertain readings in the romanization with a trailing ? (e.g., "gemu?")

CRITICAL: Return ONLY the raw JSON object. No markdown fences. No commentary. No text before or after the JSON.`;
}

function buildTranslationPrompt(ocrData, dictionaryEntries) {
  const dictSection = Object.entries(dictionaryEntries)
    .map(([word, def]) => `  ${word}: ${def}`)
    .join('\n');

  // Build a readable OCR summary for the translation model
  const ocrSummary = (ocrData.columns || []).map(col => {
    const side = col.side ? ` (${col.side})` : '';
    const words = (col.words || []).map(w => {
      const conf = w.confidence !== 'high' ? ` [${w.confidence}]` : '';
      return `${w.manchu || ''} (${w.romanization})${conf}`;
    }).join(', ');
    return `Column ${col.index}${side}: ${words}`;
  }).join('\n');

  const romanizedFlat = (ocrData.readingOrder || []).join(' ');

  return `You are a linguistic expert specializing in Manchu, a Tungusic language. You have deep knowledge of Manchu grammar, morphology, and historical vocabulary.

${GRAMMAR_CONTEXT}

## OCR Results (from prior analysis)
The following Manchu text was recognized from the document:

${ocrSummary}

Romanized reading order: ${romanizedFlat}

Chinese text found: ${ocrData.chineseText || 'none'}

## Dictionary Entries (Norman's Manchu-English Dictionary)
${dictSection || '(no matches found)'}

## Task
Using the OCR results above and the document image as reference, provide analysis in these sections:

<WordByWord>
Each significant Manchu word with its dictionary meaning and grammatical function. Format:
word — meaning (grammatical role)
Include ALL words from the OCR results.
</WordByWord>

<ManchuTranslation>
Translate the Manchu text into English relying ONLY on the Manchu script, romanization, and dictionary entries. Do NOT use the Chinese parallel text to inform this translation. If you cannot produce a meaningful translation from the Manchu alone, state what you can and cannot determine. Show how the Manchu grammar maps to the English.
</ManchuTranslation>

<ChineseTranslation>
If Chinese text is present, provide its English translation here. If no Chinese text is present, write "No Chinese text detected."
</ChineseTranslation>

<ViabilityAssessment>
Rate the Manchu-only translation viability on the first line: HIGH, MEDIUM, or LOW
Then explain: Can the Manchu be read independently of the Chinese? How much meaning is recoverable from the Manchu alone? Note any words that could only be understood via the Chinese parallel text.
</ViabilityAssessment>

<ChineseText>
If Chinese text is present, transcribe it fully in Chinese characters. Note its relationship to the Manchu text (e.g., parallel translation, title, annotation).
</ChineseText>

<CharacterDetail>
For each recognized Manchu word, provide the Chinese equivalent and English meaning in this exact format (one per line):
romanization | Chinese | English meaning
Example:
hafan | 官 (guān) | official, functionary
dorgi | 内 (nèi) | inner, within
</CharacterDetail>

<Notes>
- Confidence level (high/medium/low) for the overall reading
- Any uncertain or ambiguous characters
- Historical or cultural context if identifiable
- Alternative readings where applicable
</Notes>`;
}

module.exports = { buildOcrPrompt, buildTranslationPrompt };
