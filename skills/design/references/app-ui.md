# App UI

App screens are used, not read once. The taste kit's art direction is for public pages; here
the job is consistency, density and states.

## Source of truth, in order

1. The app's `DESIGN.md`, tokens or brand file. Read it before the first edit.
2. The component kit the repo's `AGENTS.md` names. Use its components and their props before
   writing a styled `div`. Common pairings, installed as their own upstream skills:
   - React web: `coss` (shadcn-style, Base UI) and `coss-particles`.
   - Nuxt / Vue: `nuxt-ui`.
   - Expo / React Native: `heroui-native` with Uniwind.
3. Existing screens of the same app. A new screen looks like its siblings.

No kit named and no `DESIGN.md`: ask once which to use, or propose the stack default from the
`scaffold` skill.

## Rules

- **Tokens only.** Colours, radii, spacing and type from the theme. A hex value or a one-off
  pixel size in a component is a bug.
- **Every state.** Loading (skeletons shaped like the content), empty (says what to do next,
  one action), error (what happened and how to recover), disabled, and the long-text case.
- **Density fits the task.** Tables and lists for work people repeat; whitespace for screens
  people read once.
- **Phone is its own layout.** Check 390 width: nothing overflows, targets are at least 44px,
  forms do not hide behind the keyboard.
- **Accessible by default.** Real buttons and links, labels on inputs, visible focus, contrast
  at AA, no meaning carried by colour alone.
- **Motion is feedback.** Short (150 to 250ms), transform and opacity, a reduced-motion fallback.
  Polish with the upstream `emil-design-eng` skill.

## Look

Screenshot the changed screens at 390 and 1440 width, in light and dark if the app has both.
Compare to a sibling screen. Fix what does not match, look again.
