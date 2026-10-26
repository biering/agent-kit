# Store asset specifications

Checked 2026-10-18 against Apple's pages linked below. Apple changes these
every autumn: re-check the source before trusting a number here, and update
the date when you do.

## Screenshot classes (iPhone)

From [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/):

| Class | Portrait sizes | Status | Compositor size |
|---|---|---|---|
| Dynamic Island (medium display) | 1206x2622, 1179x2556 | **Required**: "at least one screenshot" | `6.3` |
| Dynamic Island (large display) | 1320x2868, 1290x2796, 1260x2736 | Optional | `6.9`, `6.7` |
| Face ID (large display) | 1284x2778, 1242x2688 | Optional | `6.5` |
| iPhone Duo, inner display | 2007x2853 | Optional; required from April 2027 for apps built with the iOS 27.1 SDK or later | `duo-inner` |
| iPhone Duo, outer display | 1398x2034 | Same | `duo-outer` |

The Face ID class is its own older slot (`APP_IPHONE_65`): a 1242x2688 frame
does not satisfy a Dynamic Island requirement, and one uploaded to a Dynamic
Island slot is rejected.

Smaller classes fall back to scaled versions of larger ones, but the page lists
**no fallback for iPhone Duo**: a Duo set has to be made from Duo captures
(Xcode 27.1 simulator). Submitting one puts an "optimized for iPhone Duo" badge
on the product page.

Up to 10 screenshots per class, `.png`/`.jpg`, no alpha. Up to 3 app previews,
15 to 30 s; Duo previews upload at 886x1920 portrait
([app preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications)).

**Display types `eas metadata:push` knows** stop at `APP_IPHONE_67`, which
takes both large Dynamic Island sizes. So 1290x2796 (`6.7`) is the largest set
pushable from git; 1320x2868 (`6.9`) is the sharpest, kept as the source of
record and uploaded by hand if wanted.

**Uploading the required class from git is unverified.** `@expo/apple-utils`
(eas-cli 24.14) knows `APP_IPHONE_61`, which is presumably where the medium
Dynamic Island sizes go, but nothing in eas-cli checks pixel sizes, and it has
no Duo display type at all. Push, then `eas metadata:pull` to see what landed.
Duo screenshots go up by hand in App Store Connect for now.

## Product page header (new, iOS 27)

From [creative assets specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications)
and [managing assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets):

- Optional, shown at the top of the product page on iOS/iPadOS 27 and later.
- Image: 21:9 at 3840x1646 (`.png`/`.jpg`), or 16:9 at 5244x2950 (`.png`). No alpha.
- Video: 21:9 at 3840x1646, 5 to 30 s, 30 or 60 fps, loops, muted until the viewer unmutes.
- Uploaded under the version's Product Page Information ("Header and Search
  Results") or through the new Asset Library; usable on custom product pages and
  in product page optimization tests.
- Apple's guidance: one clear idea, focal point centred inside the template's
  safe area, text only as a short phrase that adds to the image, localized.

## Search result asset (new)

- Optional 3:2 image or video, 1920x1280 up to 3840x2560; video is always muted.
- Without one, search shows in-app events, previews and up to three screenshots,
  which is why frames 1 to 3 still have to work as a group.
- Apple's guidance: make the app's purpose obvious at a glance; show the real
  experience.

The compositors here make screenshots only. A header or search asset is a
landscape composition with a centred focal point, so it is designed (or built
with `compose-artboards.mjs` adapted to the canvas), not cropped from a
portrait frame.

## Rules for every asset

[Asset best practices](https://developer.apple.com/app-store/asset-best-practices/)
apply to screenshots, previews, headers and search assets alike: no prices,
discounts, URLs or copyright symbols; no unverifiable claims or awards; no
other platforms' or marketplaces' logos or references; no Apple recognitions
(Editor's Choice, App of the Day, and so on); 4+ age rating.
