# Writing order cues for the Similars tab

The Similars tab shows groups of look-alike ayat (mutashābihāt): ayat repeated inside a surah, and
ayat that match or nearly match ayat in other surahs. A memorizer's two big risks are **mixing up
which occurrence comes next** and **reciting the wrong variant in the wrong surah**. Your job is to write
short cues that prevent both.

You write `content/similars/sNNN.json` for your surah, using `raw/similars/brief-sNNN.md`. The brief lists
every group, each occurrence in muṣḥaf order, the ayah before and after with meanings, and, for
near-matches, the words that differ.

## Sources

Only the brief. It holds the translations of the surrounding ayat. If the surah's tafsir brief
(`raw/sNNN/brief.md`) is present you may use it for context, but you never need to. Describe what the
text says around each occurrence. Don't add interpretation, stories or hadith from memory.

## What to write

For every group id:

- `flow` (≤ 70 words): how the occurrences progress in order, and one simple way to remember that order.
  - **Within a surah:** walk through what each repeat closes. For example: "Each 'woe' follows a new proof:
    the promised Day, destroyed nations, human birth, the earth…" Then give a hook: a sequence, a story
    arc, an image.
  - **Across surahs:** say what separates the surahs' versions. For example: "Al-Mursalāt repeats it ten times
    after arguments; Al-Muṭaffifīn uses it once, straight after the cheats in trade." When the words differ,
    name the differing word in transliteration and tie it to something in its surah.
- `cues`: one line per occurrence key in the group (≤ 16 words). Give the context that tells you *this* is
  the occurrence you're at: what the ayah before is about, or the differing word.

## Rules

- Short, plain English. No source names, no "scholars say". No Arabic script: use transliteration with
  macrons (wayl yawmaʾidhin, thumma, kallā). ﷺ and ۞ are allowed.
- Hooks must be based on things visible in the text: the order of topics, a repeated word, a contrast,
  the page. Don't make claims about meaning that the translations don't show.
- Cover every group and every occurrence key listed in the brief, and nothing else.

## JSON shape

```json
{
  "n": 77,
  "groups": {
    "g1": {
      "flow": "…",
      "cues": { "77:15": "…", "77:19": "…", "83:10": "…" }
    }
  }
}
```

## Finish

From the `source` folder, run `python3 validate_similars.py NNN` and fix every error until it prints OK.
