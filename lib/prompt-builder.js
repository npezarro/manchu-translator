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

## Rules
- "columns" are Manchu text columns, reading left-to-right across columns, top-to-bottom within each column
- "manchu" is the Manchu Unicode script for the word
- "romanization" is the Möllendorf romanization (lowercase)
- "bbox" is [x, y, width, height] in pixels, estimating the bounding box of that word in the image. Be as accurate as possible — these will be used to crop the characters from the image.
- "confidence" is "high", "medium", or "low" for how confident you are in the reading
- "readingOrder" is a flat array of ALL romanized words in document reading order
- "chineseText" captures any Chinese characters visible (they may be parallel translations)
- If the document has multiple pages or sections, include all in one columns array
- Mark uncertain readings in the romanization with a trailing ? (e.g., "gemu?")

Return ONLY the JSON object.`;
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

<Translation>
Full English translation of the Manchu text. Provide a direct, faithful translation that preserves the structure and meaning of the original Manchu. If the document is bilingual, translate the Manchu text independently (do not simply restate the Chinese). Show how the Manchu grammar maps to the English.
</Translation>

<ChineseText>
If Chinese text is present, transcribe it fully and provide its English translation. Note its relationship to the Manchu text (e.g., parallel translation, title, annotation). Highlight any differences between the Manchu and Chinese versions.
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
