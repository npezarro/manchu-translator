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
  return `You are an expert in Manchu script (a vertical writing system derived from Mongolian script). Examine this document image carefully.

Extract ALL Manchu text visible in the image. The document may also contain Chinese characters — identify both but focus on the Manchu text.

For each column of Manchu text (reading left to right across columns, top to bottom within each column):
1. Provide the Möllendorf romanization of each word
2. Separate words with spaces, lines with newlines

Return ONLY the romanized Manchu text, nothing else. If you see Chinese text, add it at the end prefixed with "CHINESE: ".`;
}

function buildTranslationPrompt(romanizedText, dictionaryEntries) {
  const dictSection = Object.entries(dictionaryEntries)
    .map(([word, def]) => `  ${def}`)
    .join('\n');

  return `You are a linguistic expert specializing in Manchu, a Tungusic language. You have deep knowledge of Manchu grammar, morphology, and historical vocabulary.

${GRAMMAR_CONTEXT}

## Dictionary Entries (Norman's Manchu-English Dictionary)
The following entries may be relevant to this document:
${dictSection}

## Task
Analyze the Manchu document in this image. Provide a comprehensive analysis in the following format:

<OCR>
The Manchu text as it appears, transcribed in the original script order (column by column, top to bottom, left to right).
</OCR>

<Romanization>
Complete Möllendorf romanization of all Manchu text, preserving line/column structure.
</Romanization>

<WordByWord>
Each significant word with its dictionary meaning and grammatical function. Format:
word — meaning (grammatical role)
</WordByWord>

<Translation>
Full English translation of the Manchu text. Aim for natural, readable English while preserving the meaning.
</Translation>

<ChineseText>
If Chinese text is present, transcribe it and note its relationship to the Manchu text (e.g., parallel translation, title, annotation).
</ChineseText>

<Notes>
- Confidence level (high/medium/low) for the OCR reading
- Any uncertain or ambiguous characters
- Historical or cultural context if identifiable
- Alternative readings where applicable
</Notes>

${romanizedText ? `\n## Prior OCR Pass (reference)\nA preliminary reading produced:\n${romanizedText}\n\nUse this as a reference but trust your own reading of the image.` : ''}`;
}

module.exports = { buildOcrPrompt, buildTranslationPrompt };
