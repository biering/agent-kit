# AI-slop pattern catalog (DE + EN)

What each pattern is, why it reads as machine-written, and what to do instead.
The deterministic subset lives in `scripts/slop_scan.py`; everything here is
also fair game for the judgment pass. Sources: theclaymethod/unslop taboo
catalog (MIT), Wikipedia's *Signs of AI writing* project page, and our own
German additions.

**The one-sentence test for every finding:** would a busy expert who knows the
subject write this sentence? If the words carry no information they wouldn't.

## 1. Phrase tells

### Throat-clearing openers
The first sentence warms up instead of saying something.
- EN: "Here's the thing", "It turns out", "Let's dive in", "Let me be clear", "Buckle up"
- DE: "Tauchen wir ein", "Werfen wir einen Blick auf", "Willkommen in der Welt von", "Lassen Sie uns gemeinsam…"
- Fix: delete the opener; start with the first claim that carries information.

### Filler frames
Zero-information scene-setting.
- EN: "In today's fast-paced landscape", "When it comes to", "At the end of the day", "It's worth noting"
- DE: "In der heutigen digitalen Welt", "Es ist wichtig zu beachten, dass", "In Zeiten von X", "Am Ende des Tages", "Nicht zuletzt"
- Fix: delete. If the sentence collapses, it had no content.

### Significance inflation
Everything is pivotal, entscheidend, a milestone.
- EN: "stands as a testament", "pivotal moment", "cornerstone of", "game-changer", "rich tapestry"
- DE: "spielt eine entscheidende/zentrale Rolle", "Meilenstein", "wahrer Game-Changer", "hebt X auf ein neues Level", "nicht mehr wegzudenken"
- Fix: state the specific effect with a number or concrete consequence, or drop the claim.

### Promotional gloss
Adjectives selling instead of describing.
- EN: "seamlessly", "state-of-the-art", "world-class", "cutting-edge", "boasts", "nestled", "a hidden gem"
- DE: "nahtlos", "revolutioniert", "bahnbrechend", "innovative Lösung", "maßgeschneidert", "ganzheitlich", "einzigartiges Erlebnis"
- Fix: replace with the verifiable property ("berechnet die Rendite in 3 Sekunden" beats "blitzschnell und nahtlos").

### Negative parallelism / false drama
- EN: "It's not just X, it's Y", "not only … but also", "X isn't the problem. Y is."
- DE: "nicht nur …, sondern auch", "Es geht nicht darum, … sondern …"
- One per document can be earned; formulaic repetition is the tell. Fix: say Y directly.

### Copula avoidance
"is/are" dressed up.
- EN: "serves as", "functions as", "represents a", "constitutes a"
- DE: "fungiert als", "stellt … dar", "dient als" (when "ist" would do)
- Fix: use ist/is. Plain copulas are a human tell.

### Vague attribution
- EN: "experts argue", "studies show", "many believe", "it is widely regarded"
- DE: "Experten sind sich einig", "Studien zeigen", "wie allgemein bekannt"
- Fix: name the source and number, or own the claim ("wir sehen in unseren Daten …"). Never invent a citation to satisfy this.

### Superficial -ing analysis (EN)
A comma + present participle bolting unearned analysis onto a fact: ", highlighting the importance of", ", underscoring", ", paving the way for". German analog: attaching "und zeigt damit, wie wichtig…". Fix: either make the analysis a real, supported sentence or cut it.

### Meta-scaffolding & codas
- EN: "In conclusion", "The bottom line", "Key takeaway:", conclusions that only recap
- DE: "Zusammenfassend lässt sich sagen", "Abschließend lässt sich festhalten", "Fazit:" followed by a recap, "wie eingangs erwähnt"
- Fix: end on the last concrete point, a consequence, or a next step — never a recap of what the reader just read.

### Generic optimism endings
- EN: "Exciting times lie ahead", "The future looks bright", "Only time will tell"
- DE: "Die Zukunft bleibt spannend", "Es bleibt spannend", "Eines ist sicher: …"
- Fix: cut, or end with something falsifiable.

### Rhetorical self-Q&A
- EN: "So why does this matter? Because…", "But what does this mean for you?"
- DE: "Doch was bedeutet das konkret?", "Sie fragen sich jetzt vielleicht…", "Warum ist das wichtig?"
- Fix: answer the question without asking it.

### Chatbot artifacts
"I hope this helps", "Great question", "als KI-Sprachmodell", knowledge-cutoff disclaimers, leftover cite markers (`oaicite`, `[cite: 1]`). Always cut — these are transcript residue, not prose.

### AI vocabulary
High-frequency post-2022 words that spike together: EN *delve, garner, tapestry, interplay, multifaceted, paramount, burgeoning, foster, leverage (as verb), utilize, navigate (metaphorical)*. DE *das volle Potenzial ausschöpfen, die Weichen stellen, Hand in Hand, des Weiteren, darüber hinaus* (as paragraph glue). One occurrence is a word; a cluster is a fingerprint.

## 2. Structure tells (document level)

- **Em dash (—, U+2014): banned house-wide.** Not rationed, removed. It is the best-known machine tell, and in German it is not even the correct character: the Gedankenstrich is the en dash. The scanner reports every single occurrence.

  Repunctuate per case, never by blind swap, which produces sentences no German speaker would write:

  | Job the dash was doing | Replacement |
  |---|---|
  | Introduces an enumeration | colon: `deckt die Segmente ab: Kauf und Miete …` |
  | Joins an independent clause | full stop: `… kaum vorbei. Genau darauf beruht …` |
  | Hangs an apposition on the end | comma: `… vorbereitet, mit Anbindung an die Kanzlei` |
  | Brackets an aside on both sides | parentheses: `in den Kernkategorien (Mietwohnungen, …) bis zu zwei` |

- **En-dash density** (–, spaced): the same aside in the correct character, so rationed rather than banned: 2+ per paragraph is the tell. Ranges (`10–20`) are never a tell.
- **Connective scaffold**: 3+ consecutive paragraphs opening with "However/Moreover/Additionally" or "Zudem/Außerdem/Darüber hinaus/Des Weiteren". Paragraphs should advance by content, not glue words.
- **Uniform rhythm**: every sentence 15–20 words. Human prose is bursty — a two-word sentence next to a thirty-word one. Read it aloud.
- **Staccato fragments**: 3+ one-line dramatic paragraphs ("Full stop." / "Punkt."). Earned once, template at three.
- **Rule of three everywhere**: three adjectives, three examples, three bullet points, in every list. Vary the count.
- **Bold-colon listicles**: `**Label:** text` bullets outside reference docs. Fine in a README table; template smell in an essay or landing copy.
- **Emoji decoration** on headers/bullets (🚀 ✨ 💡) — marketing-slop marker.
- **Preview/recap symmetry**: intro announces three sections, sections deliver them, conclusion recaps them. Outline residue — cut the announcements and the recap.
- **Challenges/outlook formula**: "Despite its successes, X faces challenges…" ending optimistically ("Trotz aller Herausforderungen blickt X positiv in die Zukunft").
- **Every paragraph ends with a punch**. Let some paragraphs just stop.

## 3. Preservation — never "fix" these

- **Facts are sacred**: numbers, prices, dates, names, URLs, legal terms, quotes, code, CLI commands, § references. A rewrite that changes a fact failed, whatever it sounds like.
- **Required hedges**: legal/medical/financial qualifiers ("kein Anlageberatung", "in der Regel", "vorbehaltlich"), negations, and scope words ("nur", "mindestens") stay — cutting them changes meaning, and German legal copy (Impressum, AGB, Datenschutz) is entirely off-limits.
- **Domain-literal usage**: a word that is a company's *name* or a real term of the trade ("leverage" for a property-finance company, Leverage-Effekt) — never flag it. "Nahtlos" describing an actual seam, "navigate" for actual navigation, "delve" in a quoted title: literal use is fine.
- **Genre carve-outs**: bold-label bullets in reference docs and AGENTS.md files; staccato in social posts; a content skeleton the repo checks (question-H2s, TLDR block, comparison table) is a *required contract*, not slop — unslop the prose inside it, never the skeleton. Same for a changelog entry structure the repo prescribes.
- **Voice**: keep the address form the site uses (Du or Sie); never switch it. Keep the author's contractions, opinions, and first person — de-slopping into corporate-neutral is a failure mode ("soulless" scores 3/5, not 5/5).
