# Platform limits

Every field of user-facing copy has a point where the reader stops seeing it: the "more" fold,
the character cap, the second a scroller gives a video. Copy that puts its point after that point
has no point. `scripts/ship_check.py --platform <name>` checks the numeric ones; this file says
what each number means and what to do when a field is over it.

The numbers follow the limits Tobi Adonadon's /closer skill checks (tobiadonadon.com, November
2026). The 8-word reading of "3 seconds" is ours. Platforms move their folds; when a number here
is wrong, fix it here and in `LIMITS` in the script in the same edit.

| Platform (`--platform`) | Field | Limit | What it means |
|---|---|---|---|
| Instagram (`instagram`) | caption | 125 chars before "more" | The hook and the reason to tap sit in the first 125 chars. The rest can run long. |
| LinkedIn (`linkedin`) | post | 140 chars on a phone before "see more" | Write for the phone: the first 140 chars decide whether anyone expands the post. |
| X (`x`) | each post | 280 chars | A URL counts 23 whatever its length. In a thread, every post must stand alone. |
| TikTok, Reels (`tiktok`, `reels`) | spoken hook | 3 seconds | About 8 spoken words at a normal pace. The check reads the `Hook:` line, else line 1. |
| Email (`email`) | subject | the point in the first 40 chars | Phones cut the subject near 40. `copywriting` allows 45 in total; the point still sits in the first 40. |
| Cold email (`cold-email`) | subject, body | subject as email; body 50 to 90 words | Fewer than 50 says too little to earn a reply; more than 90 is not read. |
| Google Ads (`google-ads`) | headline, description | 30 chars per headline, 90 per description | Hard caps: the ad editor refuses longer fields. Check every one. |
| Meta Ads (`meta-ads`) | primary text | 125 chars before "more" | Same fold as Instagram. |

For a fold, the script checks two things: the first line fits before the fold, and when the text
has specifics, at least one of them sits before it. A short "Hi!" over a caption whose facts all
come after the fold fails.

## Platform unknown

Check against the **125-character fold** (Instagram and Meta Ads, the tightest feed fold) and say
in the delivery that you did, and that naming the platform gives its own limits. Copy that works
in 125 chars works on LinkedIn and X too; the reverse does not hold. For an email with no
platform named, use `email`. Text that never sits behind a fold (a landing section, docs, an app
string) takes `--platform none`: the script then checks specifics and placeholders only.

## Input format for the script

Plain text. Fields are lines with a label: `Subject:`, `Preview:`, `Headline:`, `Description:`,
`Hook:`, also numbered as ad exports write them (`Headline 1:`). Everything else is the body. Separate X posts with a line holding only `---`.

## When a field is over

1. Cut words before cutting facts. Run the unslop catalog first: the cut list and filler frames
   are usually the overrun.
2. Move the specific forward. The number, day, price or place goes before the fold, the adjectives
   after it or nowhere.
3. Never shorten a fact to fit ("Sa., 9h" for a Saturday 9am class is fine; a rounded price is
   not). If it still does not fit, show the user the two shortest honest versions and let them pick.
