#!/usr/bin/env python3
"""List what a Mixkit tag page offers, with titles, so a pick is a name and not a guess.

    python3 mixkit.py music corporate        # id, title, download URL
    python3 mixkit.py sfx whoosh

Only the standard library. Mixkit's licence allows the files in a video but not
redistributing them, so a film commits the URL (cues.json `sources`), never the mp3.
"""
import html
import re
import sys
import urllib.request

PAGES = {
    'music': ('https://mixkit.co/free-stock-music/tag/{}/', r'assets\.mixkit\.co/music/(\d+)/',
              'https://assets.mixkit.co/music/{0}/{0}.mp3'),
    'sfx': ('https://mixkit.co/free-sound-effects/{}/', r'active_storage/sfx/(\d+)/',
            'https://assets.mixkit.co/active_storage/sfx/{0}/{0}-preview.mp3'),
}
TITLE = re.compile(r'item-grid-card__title[^>]*>\s*(?:<a[^>]*>)?\s*([^<]+)')


def parse(page, id_pattern):
    """[(id, title)] in page order: each card's title, paired with the last asset id before it."""
    out, seen = [], set()
    for m in TITLE.finditer(page):
        ids = re.findall(id_pattern, page[:m.start()])
        if ids and ids[-1] not in seen:
            seen.add(ids[-1])
            out.append((ids[-1], html.unescape(m.group(1).strip())))
    return out


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in PAGES:
        raise SystemExit(__doc__)
    url, id_pattern, asset = PAGES[sys.argv[1]]
    req = urllib.request.Request(url.format(sys.argv[2]), headers={'User-Agent': 'Mozilla/5.0'})
    page = urllib.request.urlopen(req).read().decode('utf-8', 'replace')
    for ident, title in parse(page, id_pattern):
        print(f'{ident:>5}  {title:<44}  {asset.format(ident)}')


if __name__ == '__main__':
    main()
