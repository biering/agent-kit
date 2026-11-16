# What is known about screenshots that convert

Researched 2026-11-16. Primary sources (Apple, the FTC) are rules; vendor
figures are case studies that vendors chose to publish, so read them as "this
has happened", not "this will happen". Where nothing could be sourced, it says
so. Re-check Apple's pages each autumn.

## 1. How much the screenshots matter, and how far people look

- Most visitors never reach the later frames. SplitMetrics (1,800 A/B tests,
  2018): 11% of users reached the fifth portrait screenshot.
  [source](https://splitmetrics.com/blog/apple-screenshots-scroll-depth/)
- Visitors spend about 7 seconds on a listing, 9% scroll the portrait
  screenshots and under 4% enlarge one (AppAgent via Phiture, 2017).
  [source](https://phiture.com/asostack/why-7-seconds-could-make-or-break-your-mobile-app-f41000fb2a17/)
- Screenshot tests have moved installs: about +18% on average across
  SplitMetrics' tests (2018). AppTweak's case list (2024) includes +13%, +32%
  and +19.7%.
  [source](https://www.apptweak.com/en/aso-blog/ultimate-guide-to-screenshots-a-slash-b-testing)
- The often-quoted "60% never swipe past the first two" and "50% decide on the
  first impression" (StoreMaven) could not be traced to a primary source. Do
  not cite them.

**Rule:** the first frames carry the decision. Frame 1 alone must sell the
outcome; frames 4 and up are for the few who are already interested.

## 2. The first three frames

- Apple: "Depending on orientation, up to three screenshots can appear in
  search results."
  [asset best practices](https://developer.apple.com/app-store/asset-best-practices/)
- Apple: "the first one to three images will appear in search results when no
  app preview is available, so make sure these highlight the essence of your
  app." [product page](https://developer.apple.com/app-store/product-page/)
- An app preview autoplays in search and on the product page, and takes the
  first slot. [app previews](https://developer.apple.com/app-store/app-previews/)
- New with iOS 27: an optional search result asset and product page header can
  replace the default screenshots in those places (WWDC26 session 205,
  `store-assets.md`). Frames 1 to 3 still show wherever neither is set.

**Rule:** frames 1 to 3 work as a group (outcome, how, proof) and are checked
together with the review sheet. A set with a preview still needs them: the
preview can be off, and the search asset is optional.

## 3. Panoramas

- The store shows each screenshot as a separate rounded card with visible space
  between them, and Apple does not publish how much. Keep headlines, devices and
  faces inside a card; let the background and objects cross.
  [appscreenshotstudio, 2026](https://appscreenshotstudio.com/blog/panoramic-app-store-screenshot-dimensions-slicing-2026)
- The "+30% for panoramas" figure in circulation traces back to vendor blogs
  that cite no study. No controlled evidence was found that panoramas convert
  better.

**Rule:** a panorama is a design choice, not a proven lift. Use it to make
frames 1 and 2 read as one picture, and judge it on the review sheet, which
shows the gaps.

## 4. Captions

- Apple: "If using text, use a short phrase that enhances your visual rather
  than describes it", and "Ensure all key elements are readable — especially
  any text." [asset best practices](https://developer.apple.com/app-store/asset-best-practices/)
- Long captions force small type that cannot be read in search (SplitMetrics,
  2018). A consistent caption flow gave +25.6% in one case, and a bolder key
  word in the caption gave +6% in another (same source as §1).
- "Three to six words" is practitioners' consensus, not a measured optimum.
- Appfigures (June 2025) infers, and Apple has not confirmed, that the store
  now reads caption text as keyword metadata.
  [source](https://appfigures.com/resources/guides/app-store-algorithm-update-2025)
  Cheap insurance: let a caption use the words the listing targets (the `aso`
  skill), in plain type, never as an image of text that a reader could miss.
- No test data was found on top versus bottom captions or on benefit versus
  feature captions.

**Rules:** three to six words, one idea, set as the largest thing on the frame;
one emphasised word at most; the same position and type size across the set.

## 5. Localisation

- Apple: "make sure to localize your app description, keywords, app previews,
  and screenshots, for each of the markets in which you offer your app."
  [product page](https://developer.apple.com/app-store/product-page/)
- Localised screenshots have moved conversion (+36% for one game in Japan,
  SplitMetrics case), and in another test made no difference (a Dutch test,
  2016). [ZiMAD](https://splitmetrics.com/cases/zimad-app-store-screenshots-localization/),
  [Paper](https://www.smashingmagazine.com/2016/03/design-app-pages-for-better-conversion-case-study-of-paper-by-fiftythree/)
- Translated text grows: up to 200–300% for strings of ten characters or
  fewer, and about 130% for strings over 70 characters (W3C, citing IBM).
  [source](https://www.w3.org/International/articles/article-text-size)
- Right-to-left languages mirror the layout but not photographs, illustrations
  or the order of digits in a number (Apple HIG).
  [source](https://developer.apple.com/design/human-interface-guidelines/right-to-left)

**Rules:** one spec per locale with captures from the localised app (never
English UI under a translated caption); write the caption again in the language
rather than translating it, and keep it short enough that the set's type size
holds; for right-to-left, mirror the template's placements (`x` becomes
`430 - x`, `rotate` changes sign) but not the hero object.

## 6. Apple's rules

From the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):

- **2.3.3:** "Screenshots should show the app in use, and not merely the title
  art, login page, or splash screen. They may also include text and image
  overlays."
- **2.3.7:** no "trademarked terms, popular app names, pricing information"
  in metadata, screenshots included.
- **2.3.8:** screenshots suit a 4+ age rating, whatever the app's rating.
- **2.3.10:** "don't include names, icons, or imagery of other mobile
  platforms or alternative app marketplaces".
- **2.3.14:** no "references to other apps with an intent to mislead,
  unverifiable product claims, or specific or discounted pricing information."
- **5.2.4:** Apple applies the Editor's Choice badge itself.

Sizes, the required class and the iPhone Duo dates are in `store-assets.md`.
Up to 10 screenshots per class, no alpha.

Testing:

- **Product Page Optimization:** up to three treatments against the original
  (icons, screenshots, previews), localisable, running up to 90 days; Apple
  suggests acting at 90% confidence or more.
  [source](https://developer.apple.com/app-store/product-page-optimization/)
- **Custom product pages:** up to 70 more versions with their own screenshots,
  each with its own URL for a campaign.
  [source](https://developer.apple.com/app-store/custom-product-pages/)

**Rule:** change one thing per test (frame 1, or the order), and let a PPO test
decide instead of a week of downloads.

## 7. Honesty

- The FTC's rule on consumer reviews and testimonials (16 CFR 465, in force
  since 21 October 2024) bans fake or AI-written reviews, reviews bought for a
  sentiment, undisclosed insider reviews and fake social-media indicators. A
  review used in your own marketing is a testimonial.
  [rule](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials),
  [Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
- Earnings claims need a basis in what typical users earn; the FTC has warned
  more than 1,100 businesses about them.
  [source](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/next-up-earnings-claims-notice-of-penalty-offenses-sent-to-1100-direct-selling-companies-and-others-in-the-gig-economy.md)

**Rules:** every rating, review, user count and amount of money carries a
`source` in the spec; earnings shown are typical, not the best case; no
recognition Apple did not give. The compositor refuses the patterns it can see
(`templates.md`, "Honesty").

## 8. Device frames

- Apple neither requires nor forbids device frames in screenshots, and says to
  use "images captured from your app's UI".
  [product page](https://developer.apple.com/app-store/product-page/)
- Apple's [marketing guidelines](https://developer.apple.com/app-store/marketing/guidelines/)
  say to use Apple's product bezels "as is": no cropping, tilting, reflections
  or shadows, and no "rendering in 3D or creating any simulation of an Apple
  product". A generic device must not "include details that are unique to Apple
  products, such as the iPhone Home button, sensor housing, Ring/Silent switch,
  or volume controls". Whether these guidelines bind screenshots is not stated.

**Rule:** the compositors draw a generic slab with rounded corners and nothing
else: no island, notch, buttons or switches. Tilt and crop that, never Apple's
bezel images.
