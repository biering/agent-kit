#!/usr/bin/env python3
"""Deterministic AI-slop scanner for German and English prose.

Flags high-precision phrase tells and document-level structure tells. Advisory
only: it never edits, and a finding is a *candidate* for human/LLM judgment —
the skill's audit step decides what actually reads as slop in context.

English phrase patterns are a curated high-precision subset of
theclaymethod/unslop's taboo catalog (MIT); German patterns are our own.
Quoted spans, blockquotes, and code (fences + inline) are masked before
scanning so documentation ABOUT slop never flags itself.

Usage:
  python3 slop_scan.py FILE [FILE...]        # human-readable findings
  python3 slop_scan.py --json FILE           # machine-readable
  cat draft.md | python3 slop_scan.py -      # stdin
  python3 slop_scan.py --lang de FILE        # force language (default: auto)

Exit code is always 0 — findings are advice, not a gate.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import unicodedata

# --- Phrase patterns: (category, regex). Case-insensitive unless noted. -----

EN_PHRASES = [
    ("throat-clearing", r"(?:here's the thing|it turns out|let me be clear|the truth is|let's be real|let's dive in|let's unpack|buckle up)"),
    ("emphasis-crutch", r"(?:full stop\.|let that sink in|make no mistake|read that again|think about it[:.]|\. that's it\.)"),
    ("significance-inflation", r"(?:stands as a testament|pivotal moment|indelible mark|rich tapestry|cornerstone of|game.?changer)"),
    ("promotional", r"(?:nestled|boasts a|breathtaking|world-class|state-of-the-art|a hidden gem|seamlessly|cutting.edge)"),
    ("superficial-ing", r",\s+(?:highlighting|showcasing|underscoring|fostering|reflecting|signaling|paving the way)"),
    ("vague-attribution", r"(?:experts argue|industry reports|some critics|many believe|it is widely regarded|studies show that)"),
    ("copula-avoidance", r"(?:serves as a|stands as a|represents a|constitutes a|functions as a|operates as a)"),
    ("chatbot-artifact", r"(?:i hope this helps|great question|happy to help|let me know if you need|as an ai)"),
    ("generic-conclusion", r"(?:the future looks bright|exciting times lie ahead|only time will tell|one thing is certain|the bottom line|the key takeaway)"),
    ("negative-parallelism", r"(?:not only .{3,60} but also|it's not just about|not merely .{3,40} but)"),
    ("ai-vocabulary", r"\b(?:delve|garner|interplay|tapestry|multifaceted|paramount|burgeoning|aforementioned|sheds light|strikes a balance|double.edged sword|in today's (?:fast.paced |digital )?(?:world|landscape|environment))"),
    ("filler", r"(?:at its core|when it comes to|at the end of the day|in the ever.evolving|navigate the (?:complex|challenges)|it's worth noting)"),
    ("rhetorical-setup", r"(?:so why should you care|but what does this mean for|here's why\b|the (?:answer|secret|key|takeaway) is\s*:)"),
]

DE_PHRASES = [
    ("throat-clearing", r"(?:tauchen wir (?:ein|gemeinsam)|lassen sie uns (?:einen blick|eintauchen)|werfen wir einen blick|schnallen sie sich an|willkommen in der welt)"),
    ("emphasis-crutch", r"(?:lassen sie das (?:kurz )?(?:sacken|wirken)|nicht mehr wegzudenken|das muss man sich (?:mal )?vorstellen)"),
    ("significance-inflation", r"(?:spiel(?:t|en)\b.{0,50}?eine (?:entscheidende|zentrale|wichtige|maßgebliche|immer größere) rolle|meilenstein|von unschätzbarem wert|wahrer game.?changer|auf ein neues level)"),
    ("promotional", r"(?:revolutionier|bahnbrechend|erstklassig|maßgeschneidert|nahtlos|ganzheitlich|innovativ(?:e|er|es|en)? lösung|einzigartig(?:e|es)? erlebnis)"),
    ("filler", r"(?:in der heutigen (?:digitalen |schnelllebigen |modernen )?(?:welt|zeit)|es ist (?:wichtig|entscheidend|unerlässlich)(?:,| zu (?:beachten|betonen|verstehen))|im (?:heutigen|modernen) zeitalter|in zeiten von|am ende des tages|nicht zuletzt)"),
    ("meta-scaffold", r"(?:zusammenfassend lässt sich sagen|abschließend lässt sich (?:festhalten|sagen)|zusammenfassend kann (?:man|gesagt werden)|wie eingangs erwähnt|fazit\s*:)"),
    ("vague-attribution", r"(?:experten sind sich einig|studien zeigen, dass|viele glauben|es ist allgemein bekannt|wie allgemein bekannt)"),
    ("negative-parallelism", r"(?:nicht nur .{3,60}, sondern auch|es geht nicht (?:nur )?darum)"),
    ("rhetorical-setup", r"(?:doch was (?:bedeutet|heißt) das (?:konkret|genau|für sie|für dich)|die antwort (?:lautet|ist einfach)|warum (?:ist das wichtig|das wichtig ist)\??\s|sie fragen sich(?:jetzt)? vielleicht)"),
    ("generic-conclusion", r"(?:die zukunft (?:sieht rosig aus|bleibt spannend)|es bleibt spannend|eines ist (?:sicher|klar)|der schlüssel (?:zum erfolg )?liegt)"),
    ("ai-vocabulary", r"(?:das volle potenzial (?:aus(?:zu)?schöpfen|entfalten)|potenzial(?:e)? (?:voll )?aus(?:zu)?schöpfen|die weichen (?:für die zukunft )?stellen|hand in hand|des weiteren|darüber hinaus bietet)"),
    ("chatbot-artifact", r"(?:ich hoffe, das hilft|gerne helfe ich|als (?:ki|sprachmodell)|lassen sie es mich wissen)"),
]

# Connective/signpost paragraph openers for the scaffold metric.
EN_CONNECTIVES = r"(?:however|moreover|furthermore|additionally|in addition|consequently|in conclusion|ultimately|first(?:ly)?|second(?:ly)?|third(?:ly)?|finally|importantly|crucially|interestingly)"
DE_CONNECTIVES = r"(?:jedoch|zudem|außerdem|darüber hinaus|des weiteren|folglich|abschließend|zusammenfassend|zunächst|erstens|zweitens|drittens|schließlich|nicht zuletzt|doch)"


def mask_protected(text: str) -> str:
    """Blank out code fences, inline code, blockquotes, and quoted spans."""
    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))

    text = re.sub(r"```.*?```", blank, text, flags=re.S)
    text = re.sub(r"`[^`\n]+`", blank, text)
    text = re.sub(r"^[ \t]*>.*$", blank, text, flags=re.M)
    text = re.sub(r"[\"„»][^\"“«\n]{3,300}[\"“«]", blank, text)
    return text


def detect_lang(text: str) -> str:
    sample = text.lower()
    de_hits = len(re.findall(r"\b(?:und|der|die|das|nicht|mit|für|ist|ein|eine)\b", sample))
    en_hits = len(re.findall(r"\b(?:the|and|of|to|is|that|with|for|not|are)\b", sample))
    return "de" if de_hits > en_hits else "en"


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def scan_phrases(text: str, lang: str) -> list:
    findings = []
    patterns = DE_PHRASES if lang == "de" else EN_PHRASES
    for category, pattern in patterns:
        for m in re.finditer(pattern, text, re.I):
            findings.append({
                "kind": "phrase",
                "category": category,
                "line": line_of(text, m.start()),
                "match": m.group(0).strip()[:80],
            })
    return findings


def scan_structure(text: str, lang: str) -> list:
    findings = []
    connectives = DE_CONNECTIVES if lang == "de" else EN_CONNECTIVES
    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    prose_paragraphs = [p for p in paragraphs if not p.lstrip().startswith("#")]

    # Em dash (U+2014): banned outright in this repo's prose, not merely rationed.
    # It is the single most reliable machine tell, and in German it is not even
    # the right character: the Gedankenstrich is the en dash. Replace per case
    # with a colon (enumeration), a full stop (independent clause), a comma
    # (apposition) or parentheses (two-sided aside), never by blind swap, which
    # produces sentences no German speaker would write.
    for m in re.finditer("—", text):
        findings.append({
            "kind": "structure", "category": "em-dash",
            "line": line_of(text, m.start()),
            "match": "em dash (U+2014): banned house-wide, repunctuate per case",
        })

    # En-dash density: the same aside, in the typographically correct character.
    # Rationed rather than banned, because German ranges (10–20) legitimately
    # use it and are not a tell.
    for p in prose_paragraphs:
        dashes = len(re.findall(r"\s–\s", p))
        if dashes >= 2:
            findings.append({
                "kind": "structure", "category": "en-dash-density",
                "line": line_of(text, text.find(p)),
                "match": f"{dashes} parenthetical en dashes in one paragraph",
            })

    # Connective scaffold: 3+ consecutive paragraphs opened by signposts.
    opener_re = re.compile(rf"^\W{{0,4}}{connectives}\b", re.I)
    streak, streak_start = 0, 0
    for p in prose_paragraphs:
        if opener_re.match(p.strip()):
            if streak == 0:
                streak_start = line_of(text, text.find(p))
            streak += 1
            if streak == 3:
                findings.append({
                    "kind": "structure", "category": "connective-scaffold",
                    "line": streak_start,
                    "match": "3+ consecutive paragraphs open with connectives/signposts",
                })
        else:
            streak = 0

    # Staccato: 3+ one-line paragraphs under 8 words (outside social genre).
    shorts = [p for p in prose_paragraphs if "\n" not in p.strip() and 0 < len(p.split()) < 8 and not p.strip().startswith(("-", "*", "|"))]
    if len(shorts) >= 3:
        findings.append({
            "kind": "structure", "category": "staccato",
            "line": line_of(text, text.find(shorts[0])),
            "match": f"{len(shorts)} one-line paragraphs under 8 words",
        })

    # Bold-colon listicle: 4+ list items of the form "**Label:** text".
    bold_items = re.findall(r"^[ \t]*[-*+][ \t]+\*\*[^*\n]+:?\*\*:?", text, re.M)
    if len(bold_items) >= 4:
        findings.append({
            "kind": "structure", "category": "bold-colon-listicle",
            "line": 0,
            "match": f"{len(bold_items)} bold-label list items (template smell outside reference docs)",
        })

    # Emoji headers / emoji bullets.
    emoji_headers = [
        ln for ln in text.splitlines()
        if (ln.lstrip().startswith("#") or re.match(r"^[ \t]*[-*+][ \t]", ln))
        and any(unicodedata.category(ch) == "So" for ch in ln)
    ]
    if len(emoji_headers) >= 2:
        findings.append({
            "kind": "structure", "category": "emoji-decoration",
            "line": 0,
            "match": f"{len(emoji_headers)} headers/bullets decorated with emoji",
        })

    # Uniform sentence rhythm: low variance across 6+ sentences.
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text)) if len(s.split()) >= 3]
    if len(sentences) >= 6:
        lengths = [len(s.split()) for s in sentences]
        variance = statistics.pvariance(lengths)
        if variance < 12:
            findings.append({
                "kind": "structure", "category": "uniform-rhythm",
                "line": 0,
                "match": f"sentence-length variance {variance:.0f} across {len(sentences)} sentences (human prose is burstier)",
            })

    return findings


def scan(text: str, lang: str = "auto") -> dict:
    masked = mask_protected(text)
    if lang == "auto":
        lang = detect_lang(masked)
    findings = scan_phrases(masked, lang) + scan_structure(masked, lang)
    findings.sort(key=lambda f: f["line"])
    return {"lang": lang, "findings": findings}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="files to scan, or - for stdin")
    ap.add_argument("--lang", choices=["auto", "de", "en"], default="auto")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    out = {}
    for path in args.files:
        text = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
        out[path] = scan(text, args.lang)

    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return

    for path, result in out.items():
        findings = result["findings"]
        print(f"== {path} [{result['lang']}] — {len(findings)} finding(s)")
        for f in findings:
            loc = f"L{f['line']}" if f["line"] else "doc"
            print(f"  {loc:>5}  {f['category']:<24} {f['match']}")
        if not findings:
            print("  clean — no deterministic tells (judgment tells may remain)")


if __name__ == "__main__":
    main()
