#!/usr/bin/env python3
"""Deterministic copy checks for headlines, one-liners, CTAs and locale files.

Stdlib only. Findings are candidates, not verdicts (copywriting SKILL.md, step 2).

    copy_scan.py --text "Die All-in-One-Plattform für Teams"
    copy_scan.py candidates.txt --budget 8
    copy_scan.py --mode i18n locales/de.json --pair locales/en.json --json
    copy_scan.py --mode i18n de.json --suffix-rules "ti:nostop:8,bt:4,lb:sentence"

--suffix-rules entries are suffix:rule[:budget] where rule is `nostop` (no
full stop), `sentence` (8+ word values end in terminal punctuation) or a bare
word budget. The suffix is the last dot-separated segment of the key.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

# --- pattern catalogs -------------------------------------------------------
# Positive-craft checks only. AI-slop phrase tells live in the unslop skill
# (references/patterns.md there); keep them out of this file.

BUZZWORDS = [
    # DE
    "revolutionär", "revolutioniert", "bahnbrechend", "nahtlos", "ganzheitlich",
    "maßgeschneidert", "zukunftsweisend", "wegweisend", "innovativ", "innovative lösung",
    "die zukunft der", "die zukunft des", "die zukunft von", "neues level",
    "game-changer", "all-in-one", "rundum-sorglos", "state of the art",
    # EN
    "revolutionary", "disruptive", "redefining", "the future of", "next-generation",
    "next generation", "seamless", "seamlessly", "cutting-edge", "state-of-the-art",
    "world-class", "best-in-class", "end-to-end", "holistic", "game changer",
]

ABSTRACTIONS = [
    # DE
    "plattform", "ökosystem", "infrastruktur", "bausteine", "baustein", "ebene",
    "schicht", "klebstoff", "framework", "toolkit", "suite", "lösung", "lösungen",
    # EN
    "platform", "ecosystem", "infrastructure", "building blocks", "legos", "lego",
    "layer", "rails", "primitives", "glue", "hub", "stack", "solution", "solutions",
    "engine",
]

VAGUE_ADJECTIVES = [
    "smart", "einfach", "intuitiv", "modern", "leistungsstark", "mächtig",
    "effizient", "professionell", "flexibel", "schnell", "blitzschnell", "mühelos",
    "powerful", "intuitive", "efficient", "effortless", "lightning-fast", "robust",
]

FILLERS = [
    "sehr", "wirklich", "ganz einfach", "einfach nur", "natürlich", "quasi",
    "really", "very", "just", "simply", "actually", "truly",
]

SUPERLATIVES = [
    "beste", "bester", "bestes", "führend", "führende", "marktführer", "nr. 1",
    "nr.1", "einzige", "einzigartig", "weltweit erste",
    "best", "leading", "#1", "number one", "only", "world's first", "unmatched",
]

GENERIC_CTAS = [
    "mehr erfahren", "mehr infos", "weiterlesen", "hier klicken", "jetzt entdecken",
    "learn more", "read more", "click here", "find out more", "discover more",
    "get started",
]

# "<category word> für/for <thing>": the "copilot for eCommerce" shape.
ANALOGUE_ANCHORS = [
    "copilot", "agent", "agents", "ai", "ki", "os", "betriebssystem", "plattform",
    "platform", "hub", "engine", "layer", "ebene", "tool", "software", "lösung",
    "solution", "app", "system",
]

PLACEHOLDER_RE = re.compile(r"\{[a-zA-Z0-9_]+\}")
LENGTH_DRIFT_RATIO = 1.6
LENGTH_DRIFT_MIN_CHARS = 40
NOMINAL_RE = re.compile(r"\b\w{4,}(?:ung|ierung|heit|keit|barkeit)\b", re.IGNORECASE)


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[\s ]+", text.strip()) if w]


LETTER = "a-zA-ZäöüßÄÖÜ"


def _find(text: str, needles: list[str]) -> list[str]:
    """Match on letter boundaries, not \\b: German compounds hyphenate
    ("Immobilien-Plattform") and pluralise ("Plattformen"), and both must hit."""
    low = text.lower()
    hits = []
    for n in needles:
        pattern = (
            f"(?<![{LETTER}])" + re.escape(n) + f"(?:en|er|es|e|s|n)?(?![{LETTER}])"
        )
        if re.search(pattern, low):
            hits.append(n)
    return hits


def _finding(code: str, severity: str, message: str, hits=None) -> dict:
    out = {"check": code, "severity": severity, "message": message}
    if hits:
        out["hits"] = hits
    return out


def scan_line(text: str, budget: int, headline: bool = True, char_budget: int | None = None) -> list[dict]:
    """Check one line of copy. `headline` raises severity for shape words."""
    findings: list[dict] = []
    stripped = text.strip()
    if not stripped:
        return findings

    n = len(_words(stripped))
    if n > budget:
        findings.append(_finding(
            "budget", "high",
            f"{n} words, budget is {budget}, cut {n - budget}",
        ))
    if char_budget and len(stripped) > char_budget:
        findings.append(_finding(
            "char-budget", "high",
            f"{len(stripped)} characters, budget is {char_budget}",
        ))

    hi = "high" if headline else "medium"

    if hits := _find(stripped, BUZZWORDS):
        findings.append(_finding("buzzword", "high", "Buzzword: say the verifiable property instead", hits))
    if hits := _find(stripped, ABSTRACTIONS):
        findings.append(_finding(
            "abstraction", hi,
            "Shape word: describes a form, not a thing anyone wants" if headline
            else "Shape word: fine in body prose if it is literally true, dead in a headline",
            hits,
        ))
    if hits := [
        h for h in _find(stripped, VAGUE_ADJECTIVES)
        # "so einfach wie Aktien" / "as simple as stocks" is a comparison with a
        # concrete anchor, not a mood adjective; the analogue format, not a tell.
        if not re.search(f"(so|as)\\s+{re.escape(h)}\\w*\\s+(wie|as)\\b", stripped.lower())
    ]:
        findings.append(_finding("vague-adjective", "medium", "Adjective describes a mood; name the behaviour that produces it", hits))
    if hits := _find(stripped, FILLERS):
        findings.append(_finding("filler", "low", "Filler word: delete and reread", hits))
    if hits := _find(stripped, SUPERLATIVES):
        findings.append(_finding("superlative", "high", "Unverifiable superlative: produce the proof or drop the claim", hits))

    low = stripped.lower()
    m = re.search(
        f"(?<![{LETTER}])(" + "|".join(map(re.escape, ANALOGUE_ANCHORS))
        + r")\s+(für|for)\s+([\wäöüß-]+)",
        low,
    )
    if m:
        findings.append(_finding(
            "ambiguous-analogue", hi,
            f"'{m.group(0)}' anchors on a category, not a product; name two other "
            "products this could describe; if you can, rewrite",
        ))

    nominals = NOMINAL_RE.findall(stripped)
    if len(nominals) >= 2 and headline:
        findings.append(_finding("nominal-style", "medium", "Nominal style: turn the -ung nouns back into verbs", nominals))

    if n <= 5 and (hits := _find(stripped, GENERIC_CTAS)):
        findings.append(_finding("generic-cta", "high", "Generic CTA: name what happens on click", hits))

    return findings


def parse_suffix_rules(spec: str | None) -> dict[str, dict]:
    """"ti:nostop:8,bt:4,lb:sentence" -> {"ti": {"nostop": True, "budget": 8}, ...}"""
    rules: dict[str, dict] = {}
    for entry in filter(None, (e.strip() for e in (spec or "").split(","))):
        suffix, *parts = entry.split(":")
        rule = rules.setdefault(suffix, {})
        for part in parts:
            if part.isdigit():
                rule["budget"] = int(part)
            elif part in ("nostop", "sentence"):
                rule[part] = True
            else:
                raise ValueError(f"unknown suffix rule {part!r} in {entry!r}")
    return rules


def scan_i18n(src_path: str, pair_path: str | None, rules: dict[str, dict]) -> list[dict]:
    findings: list[dict] = []
    with open(src_path, encoding="utf-8") as fh:
        src = json.load(fh)
    src_name = os.path.basename(src_path)
    pair = None
    if pair_path is None and src_name == "de.json":
        guess = os.path.join(os.path.dirname(src_path), "en.json")
        pair_path = guess if os.path.exists(guess) else None
    if pair_path:
        with open(pair_path, encoding="utf-8") as fh:
            pair = json.load(fh)
    pair_name = os.path.basename(pair_path) if pair_path else ""

    for key, value in src.items():
        if not isinstance(value, str):
            continue
        suffix = key.rsplit(".", 1)[-1]
        rule = rules.get(suffix, {})
        where = f"{src_name}::{key}"

        if rule.get("nostop") and value.rstrip().endswith("."):
            findings.append({"where": where, **_finding(
                "suffix-punctuation", "medium", f"'{suffix}' keys carry no full stop")})
        # Sentence keys often double as short labels; only a value long enough
        # to *be* a sentence is missing its full stop.
        if (
            rule.get("sentence")
            and len(_words(value)) >= 8
            and value.rstrip()[-1] not in ".!?…:»\""
        ):
            findings.append({"where": where, **_finding(
                "suffix-punctuation", "low",
                f"'{suffix}' keys are complete sentences with terminal punctuation")})

        if "budget" in rule:
            for f in scan_line(value, rule["budget"], headline=True):
                findings.append({"where": where, **f})

        if pair is not None:
            if key not in pair:
                findings.append({"where": where, **_finding(
                    "pair-missing", "high", f"Key exists in {src_name} but not {pair_name}")})
                continue
            other = pair[key]
            if not isinstance(other, str):
                continue
            if set(PLACEHOLDER_RE.findall(value)) != set(PLACEHOLDER_RE.findall(other)):
                findings.append({"where": where, **_finding(
                    "placeholder-drift", "high",
                    f"placeholders differ: {src_name}={PLACEHOLDER_RE.findall(value)} "
                    f"{pair_name}={PLACEHOLDER_RE.findall(other)}")})
            a, b = len(value), len(other)
            # Ratios on short strings are noise ("DSGVO (GDPR)" vs "GDPR"); the
            # layout risk is real only once a string has to wrap.
            if a and b and max(a, b) >= LENGTH_DRIFT_MIN_CHARS:
                ratio = max(a, b) / min(a, b)
                if ratio > LENGTH_DRIFT_RATIO:
                    longer = src_name if a > b else pair_name
                    findings.append({"where": where, **_finding(
                        "length-drift", "medium",
                        f"{longer} is {ratio:.1f}x the other ({a} vs {b} chars); "
                        "a layout designed for one will break for the other")})

    if pair is not None:
        for key in pair:
            if key not in src:
                findings.append({"where": f"{pair_name}::{key}", **_finding(
                    "pair-missing", "high", f"Key exists in {pair_name} but not {src_name}")})

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", nargs="?", help="file of candidate lines, a locale file in --mode i18n, or - for stdin")
    ap.add_argument("--text", help="scan this string instead of a file")
    ap.add_argument("--mode", choices=("line", "i18n"), default="line")
    ap.add_argument("--budget", type=int, default=5, help="word budget per line (default 5 = one-liner)")
    ap.add_argument("--char-budget", type=int, default=None, help="character budget per line (e.g. 155 for meta descriptions)")
    ap.add_argument("--body", action="store_true", help="body prose, not a headline; lowers shape-word severity")
    ap.add_argument("--pair", help="the other locale file (default: en.json next to a de.json)")
    ap.add_argument("--suffix-rules", help='key-suffix contract, e.g. "ti:nostop:8,bt:4,lb:sentence"')
    ap.add_argument("--json", dest="as_json", action="store_true")
    args = ap.parse_args()

    if args.mode == "i18n":
        if not args.path:
            ap.error("--mode i18n needs a path to a locale file")
        try:
            rules = parse_suffix_rules(args.suffix_rules)
        except ValueError as exc:
            ap.error(str(exc))
        findings = scan_i18n(args.path, args.pair, rules)
    else:
        if args.text is not None:
            lines = args.text.splitlines()
        elif args.path in (None, "-"):
            lines = sys.stdin.read().splitlines()
        else:
            with open(args.path, encoding="utf-8") as fh:
                lines = fh.read().splitlines()
        findings = []
        for i, line in enumerate(lines, 1):
            if not line.strip():
                continue
            for f in scan_line(line, args.budget, headline=not args.body, char_budget=args.char_budget):
                findings.append({"where": f"line {i}: {line.strip()}", **f})

    if args.as_json:
        json.dump(findings, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    elif not findings:
        print("no findings; judge it against references/rubric.md anyway")
    else:
        order = {"high": 0, "medium": 1, "low": 2}
        for f in sorted(findings, key=lambda x: order.get(x["severity"], 3)):
            hits = f" [{', '.join(f['hits'])}]" if f.get("hits") else ""
            print(f"{f['severity']:<6} {f['check']:<20} {f.get('where', '')}\n       {f['message']}{hits}")
    return 1 if any(f["severity"] == "high" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
