---
name: distribution-reuse
description: >-
  Decide what a shipped change is worth telling people about and draft it before the owner approves: an X post on the product's brand account, a clip from the result video, a changelog entry, a launch asset. Drafts go into the result pitch; his approval of the result approves posting them as the brand, never as him. Use inside a result pitch, for 'reuse for distribution', 'what do we post about this'.
---

# Distribution reuse

Read the repo's `AGENTS.md`, `docs/agent-kit/distribution-reuse.md` and the product's distribution
file (Maelstrom: `docs/office-hours/<app>/DISTRIBUTION.md`, its channels and brand accounts) first; they
win where they differ from this skill.

Every change that ships in a live product is a reason to talk to its users and to people who might
become users. The video and screenshots for the result pitch already exist, so most of the work is
done: this skill decides which reuse is worth it and writes the drafts, so the owner's one approve
covers the ship and the post.

## 1. Is the product live

Live means real people can use it today: it is public (an app in a store, a site with sign-ups) and
has a brand account to post from. Read it from the product's distribution file or the portfolio.

- **Not live**: write `Not live yet: no post.` in the pitch's Distribution section and stop. Do not
  draft posts for a product nobody can use.
- **Live, but the change is invisible to users** (a speed-up nobody notices, a fix): usually a
  changelog line only, or nothing. Say which and why in one line.

## 2. Pick the reuse

At most two. The cheapest that reaches the people who care wins.

| Reuse | When | Draft |
|---|---|---|
| X post on the product's brand account | A change a user would show a friend; a new screen or flow | The post text (under 280 characters, the platform limits in the `unslop` skill), the media it carries (the clip or one screenshot, by its whole URL), alt text |
| Clip | The result video has 5 to 15 seconds that show the benefit alone | Start and end time in the result video, the caption burned in or the post text; the `video` skill cuts it |
| Changelog entry | Every user-visible change in a product that keeps a changelog | The entry, from the `product-changelog` skill's form |
| Launch asset | A new feature big enough for a launch site, a directory update, an App Store "What's new" | Which asset (a Product Hunt update, store release notes, a landing section), and its text |

Skip a reuse that only repeats another. Skip a post for a change that only makes sense to someone who
already uses the product daily: that is a changelog line.

## 3. Write the drafts

- Write as the product, in its voice (the repo's voice file, `unslop.voice`). Never as the owner: his
  own accounts, his name and his voice are his to post (the CEO manual's "Who decides what").
- Lead with what the user can now do, then the proof (the clip, the screenshot). No feature names a
  user does not know, no "excited to announce".
- Every fact is true of the build that ships: no number, price, quote or user count that is not real.
- Run the `unslop` skill on every draft (no em dashes, platform limits).

In the pitch, under **Distribution**:

```markdown
## Distribution
Live: yes (<product> on iOS, its brand account @<brand> on X)

- X post on @<brand>, with the clip:
  > End a session with one tap on the bowl. It rings, you breathe out, you are done.
  Media: https://<media>/<product>/bowl/clip-6s.mp4 (alt: a hand taps a bowl, the timer ends)
- Changelog: "A singing bowl ends your session: tap it when you are ready."
```

## 4. After the owner approves the result

Post the drafts as written, or with his notes, on the brand accounts, with the repo's posting tool
(Maelstrom: `docs/social-posting.md`). Put each post's link in the final report. A result that was sent
back posts nothing.
