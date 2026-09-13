# Writing a surah for the Juz 28–30 Memory Map

You write one JSON file per surah: `content/sNNN.json` (NNN = zero-padded surah number).
The app renders it for a person memorizing the Quran (ḥifẓ). The reader wants **short, plain,
easy English**, and no scholarly name-dropping.

## Your only sources

Read `raw/sNNN/brief.md`. It holds the Sahih International translation, the rukus, the passage
groupings each tafsir uses, the surah introduction (Tafhīm via quran.com), Tafsīr Ibn Kathīr
(English), Maʿāriful Qurʾān (English), Tazkirul Quran (English), al-Saʿdī, al-Jalālayn and
al-Baghawī (Arabic), and al-Qurṭubī's revelation-report excerpts (Arabic).

- Every statement about meaning, context or revelation must be supported by that brief.
  **Never add interpretation, stories, hadith or revelation reports from memory.** If the brief
  gives no reason for revelation, don't invent one: omit `why`, and say "No specific incident."
  in a section's `story` field when that is the case.
- Where the sources differ, say so briefly: "either X or Y", or "reportedly …" for revelation reports.
- Never write Arabic script. The app shows the real muṣḥaf text. Use transliteration with
  macrons and ʿ/ʾ for key words (halūʿ, ṣabr jamīl, al-muṣallīn). The only allowed non-Latin
  character is ۞ (the rubʿ marker).
- **No citations in the text**: no "Ibn Kathīr says", "al-Saʿdī explains", "scholars say". The
  validator rejects source names.
- Respectful wording: "the Prophet ﷺ", "Allah". Present rulings plainly and neutrally, with no
  commentary of your own. Handle sensitive ayat (chastity, punishment, slavery-era terms) in the
  most neutral, brief wording the sources support.

## Choosing sections

Sections are the heart of the app: the chunks someone memorizes. They must be contiguous from
ayah 1 to the last ayah.

- Base the boundaries on the passage groupings in the brief (Ibn Kathīr's passages above all,
  then Maʿāriful Qurʾān, al-Kashshāf and al-Taḥrīr), plus the rukus. Pick the split where the
  sources agree and the theme clearly shifts.
- Length: under 10 ayat → 1–2 sections; 10–30 ayat → 2–4; over 30 ayat → 3–6. At most 8.
- Title: 7–12 words that say what the section is actually about: who or what it covers, what happens,
  and where it's heading. A reader should be able to follow the whole surah's flow from the titles alone.
  Avoid vague or metaphorical labels.
  - Vague: "Eat in joy, or eat a little".
  - Descriptive: "The righteous enjoy shade and fruit; deniers eat briefly and won't bow".

## Groups and ayat

- `groups` split every section into runs of 1–5 ayat that belong together (they never cross a
  section boundary), each with a one-sentence summary (≤ 25 words). Together they cover every ayah.
- `ayat` has an entry for **every** ayah "1".."N": `explain` (≤ 40 words: the meaning beyond the
  translation, key word in transliteration, the point of the ayah), plus `why` (≤ 50 words) only
  where the brief reports a reason for revelation for that ayah.

## Tone

Short sentences. Concrete. Like explaining to a smart friend. Look at `content/s070.json`
(Al-Maʿārij). It is the finished example: match its length, voice and structure exactly.

## JSON shape

```json
{
  "n": 70,
  "sub": "Named after “the ways of ascent” in ayah 3",          // what the name means / where it comes from (≤ 15 words)
  "theme": "…",                                                   // main theme, 1–2 sentences (≤ 40 words)
  "story": ["…", "…", "…"],                                       // why the surah was revealed: 2–3 short paragraphs (≤ 50 words each)
  "sections": [
    {
      "a": 1, "b": 7,
      "title": "The punishment they asked for is coming",
      "meaning": "…",                                             // overall meaning of the section (≤ 55 words)
      "points": [["1–2", "…"], ["3–4", "…"]],                     // key points with ayah ranges (≤ 14 words each)
      "matters": "…",                                             // why this section matters (≤ 50 words)
      "story": "…",                                               // context / revelation (≤ 50 words), or "No specific incident. …"
      "explained": ["…", "…"],                                    // the meaning explained, story-like: 1–2 paragraphs (≤ 60 words each)
      "teaches": ["…", "…", "…"],                                 // 3–5 lessons (≤ 18 words each)
      "hook": "…"                                                 // a memory hook: an observable pattern in the text (≤ 35 words)
    }
  ],
  "groups": [{ "a": 1, "b": 3, "text": "…" }],
  "ayat": { "1": { "explain": "…", "why": "…" }, "2": { "explain": "…" } }
}
```

Memory hooks must be things you can see in the text itself: a word or idea repeated, how
the section opens and closes, a list's order, a contrast with the section before, the ۞ mark or
the page it starts on (the brief gives pages). Don't make claims about meaning in hooks.

## Finish

Run `python3 validate_content.py NNN` from the `juzapp` folder and fix every ERROR until it prints
OK. Warnings about length are worth fixing too.
