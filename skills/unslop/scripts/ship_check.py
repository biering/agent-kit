#!/usr/bin/env python3
"""Pre-ship check for user-facing copy: specifics, placeholders, platform limits.

Three checks, in the order the skill runs them:

1. Specifics. Lists the concrete facts the text carries (numbers, prices,
   dates, weekdays, times) and flags copy that has none. It never suggests a
   value: a missing fact is the author's to supply, marked [PLACEHOLDER].
2. Placeholders. Any [PLACEHOLDER ...] or [TODO ...] left in the text.
3. Platform limits from references/platform-limits.md. With no --platform the
   125-character fold applies (Instagram and Meta Ads, the tightest feed fold),
   and the output says so.

Input is plain text. Fields are lines that start with a label:
  Subject: / Preview:         (email, cold-email)
  Headline: / Description:    (google-ads, meta-ads)
  Hook:                       (tiktok, reels: the spoken first line; else line 1)
X threads: separate posts with a line holding only ---.

Usage:
  python3 ship_check.py --platform instagram caption.txt
  python3 ship_check.py --platform google-ads --json ads.txt
  echo "Six seats, Saturday 9am, EUR 45." | python3 ship_check.py -

Exit code: 1 when a limit is exceeded or a placeholder is left, else 0.
Specifics are advice (exit 0): a changelog line may rightly have none.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# platform: list of (field, kind, limit, note). kind: fold (the first line must
# fit before "more"), chars, words, word-range, spoken-words.
LIMITS = {
    "instagram": [("body", "fold", 125, "caption: the hook must fit before \"more\" (125 chars)")],
    "meta-ads": [("body", "fold", 125, "primary text: the point before \"more\" (125 chars)")],
    "linkedin": [("body", "fold", 140, "post: the hook before \"see more\" on a phone (140 chars)")],
    "x": [("post", "chars", 280, "each post max 280 chars (a URL counts 23)")],
    "tiktok": [("hook", "spoken-words", 8, "spoken hook: 3 seconds, about 8 words")],
    "reels": [("hook", "spoken-words", 8, "spoken hook: 3 seconds, about 8 words")],
    "email": [("subject", "chars", 40, "subject: the point in the first 40 chars")],
    "cold-email": [("subject", "chars", 40, "subject: the point in the first 40 chars"),
                   ("body", "word-range", (50, 90), "body: 50 to 90 words")],
    "google-ads": [("headline", "chars", 30, "each headline max 30 chars"),
                   ("description", "chars", 90, "each description max 90 chars")],
    "unknown": [("body", "fold", 125, "platform unknown: checked against the 125-char fold, the tightest feed fold; name the platform for its own limits")],
}
ALIASES = {"twitter": "x", "ig": "instagram", "meta": "meta-ads", "facebook": "meta-ads",
           "reel": "reels", "shorts": "reels", "google": "google-ads", "adwords": "google-ads",
           "mail": "email", "newsletter": "email", "cold": "cold-email"}

FIELD_RE = re.compile(r"^(subject|preview|headline|description|hook)\s*:\s*(.*)$", re.I)
URL_RE = re.compile(r"https?://\S+")
PLACEHOLDER_RE = re.compile(r"\[(?:PLACEHOLDER|TODO|TBD|FILL)[^\]]*\]", re.I)

SPECIFICS = [
    ("price", r"(?:[€$£]\s?\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s?(?:€|\$|£|eur|euro|usd|dollars?|chf)\b)"),
    ("time", r"\b\d{1,2}(?::\d{2})?\s?(?:am|pm|uhr)\b|\b\d{1,2}:\d{2}\b"),
    ("date", r"\b\d{1,2}\.\s?\d{1,2}\.(?:\d{2,4})?|\b\d{4}-\d{2}-\d{2}\b|\b(?:jan(?:uary|uar)?|feb(?:ruary|ruar)?|mar(?:ch)?|märz|apr(?:il)?|may|mai|june?|juni|july?|juli|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?|dez(?:ember)?)\b\.?\s?\d{0,2}"),
    ("weekday", r"\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tonight|tomorrow|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|heute|morgen)\b"),
    ("number", r"\b\d+(?:[.,]\d+)?\s?%?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b"),
]


def x_length(post: str) -> int:
    return len(URL_RE.sub("x" * 23, post))


def split_fields(text: str) -> dict:
    fields = {"subject": [], "preview": [], "headline": [], "description": [], "hook": []}
    body = []
    for ln in text.splitlines():
        m = FIELD_RE.match(ln.strip())
        if m:
            fields[m.group(1).lower()].append(m.group(2).strip())
        else:
            body.append(ln)
    fields["body"] = "\n".join(body).strip()
    return fields


def first_line(body: str) -> str:
    for ln in body.splitlines():
        if ln.strip():
            return ln.strip()
    return ""


def find_specifics(text: str) -> list:
    found, taken = [], []
    for kind, pattern in SPECIFICS:
        for m in re.finditer(pattern, text, re.I):
            span = (m.start(), m.end())
            if not m.group(0).strip() or any(a < span[1] and span[0] < b for a, b in taken):
                continue
            taken.append(span)
            found.append({"kind": kind, "value": m.group(0).strip()})
    return found


def check_limits(platform: str, text: str) -> list:
    f = split_fields(text)
    out = []
    for field, kind, limit, note in LIMITS[platform]:
        if kind == "fold":
            line = first_line(f["body"])
            if len(line) > limit:
                out.append({"field": field, "limit": note, "actual": f"first line is {len(line)} chars",
                            "before_fold": line[:limit]})
        elif kind == "chars" and field == "post":
            posts = [p.strip() for p in re.split(r"^\s*---\s*$", f["body"], flags=re.M) if p.strip()]
            for i, p in enumerate(posts, 1):
                if x_length(p) > limit:
                    out.append({"field": f"post {i}", "limit": note, "actual": f"{x_length(p)} chars"})
        elif kind == "chars":
            for i, value in enumerate(f[field], 1):
                if len(value) > limit:
                    out.append({"field": f"{field} {i}", "limit": note, "actual": f"{len(value)} chars",
                                "before_cut": value[:limit]})
            if not f[field]:
                out.append({"field": field, "limit": note, "actual": f"no \"{field.title()}:\" line found", "missing": True})
        elif kind == "spoken-words":
            hook = f["hook"][0] if f["hook"] else first_line(f["body"])
            words = len(hook.split())
            if words > limit:
                out.append({"field": "hook", "limit": note, "actual": f"{words} words"})
        elif kind == "word-range":
            lo, hi = limit
            words = len(f["body"].split())
            if not lo <= words <= hi:
                out.append({"field": field, "limit": note, "actual": f"{words} words"})
    return out


def check(text: str, platform: str | None) -> dict:
    name = ALIASES.get((platform or "unknown").lower(), (platform or "unknown").lower())
    if name not in LIMITS:
        raise SystemExit(f"unknown platform {platform!r}; one of: {', '.join(sorted(LIMITS))}")
    specifics = find_specifics(PLACEHOLDER_RE.sub(" ", text))
    return {
        "platform": name,
        "specifics": specifics,
        "no_specifics": not specifics,
        "placeholders": PLACEHOLDER_RE.findall(text),
        "limits": check_limits(name, text),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", help="file to check, or - for stdin")
    ap.add_argument("--platform", help=f"one of {', '.join(sorted(LIMITS))} (default: unknown)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    text = sys.stdin.read() if args.file == "-" else open(args.file, encoding="utf-8").read()
    r = check(text, args.platform)
    failed = bool(r["limits"] or r["placeholders"])

    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(f"== {args.file} [{r['platform']}]")
        if r["specifics"]:
            print("  specifics: " + ", ".join(f"{s['value']} ({s['kind']})" for s in r["specifics"]))
        else:
            print("  no-specifics  no number, price, date, weekday or time: add the real one or mark [PLACEHOLDER]")
        for p in r["placeholders"]:
            print(f"  placeholder   {p} must be filled before this ships")
        for lim in r["limits"]:
            label = "missing   " if lim.get("missing") else "over-limit"
            print(f"  {label}    {lim['field']}: {lim['actual']} ({lim['limit']})")
            if lim.get("before_fold"):
                print(f"                before the fold: {lim['before_fold']!r}")
        if r["platform"] == "unknown":
            print("  note          " + LIMITS["unknown"][0][3])
        if not failed:
            print("  limits ok")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
