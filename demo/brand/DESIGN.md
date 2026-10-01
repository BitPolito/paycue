# BitPolito demo design guide

How the Paycue demos look, derived from BitPolito's own sources:
[bitpolito.it](https://bitpolito.it) (its stylesheet), the
[media kit](https://github.com/BitPolito/media-kit), the
[decks](https://github.com/BitPolito/decks) fonts, and the
[Bitcoin Academy](https://github.com/BitPolito/bitcoin-academy) web app's
Tailwind config and globals, which is the team's most recent product UI.

## 1. Principles

1. **One ink.** Everything is drawn in BitPolito blue on paper, or white on
   blue. No gradients, no second brand colour, no drop shadows.
2. **Hard edges.** Structure comes from 2 px solid borders in the ink colour,
   not from shadows or tinted cards. Thin 1 px rules (ink at 18 %) separate
   rows and sections.
3. **Pixels mean Bitcoin.** BitPolito's marks are pixel art (the italic
   wordmark, the bull head, the ₿). New illustration follows the same rule:
   squares on a grid, no anti-aliased curves.
4. **Say it plainly.** Short labels, sentence case, numbers in tabular figures.
   Small uppercase mono labels carry metadata ("BITPOLITO · DEMO").

## 2. Tokens

```css
:root {
  --bp-blue: #001CE0;      /* the ink; also the dark-mode background */
  --bp-paper: #F9F9F9;     /* light background */
  --bp-white: #FFFFFF;     /* cards on paper; ink in dark mode */
  --bp-ink-soft: #0A1A4A;  /* long body text on paper, if pure blue tires */
  --bp-rule: #E4E6F2;      /* hairline separators on paper */
  --bp-rule-soft: #EFF1F8; /* zebra rows, inset wells */
  --bp-line: rgba(0, 28, 224, 0.18);  /* thin borders on paper */
  --bp-ok: #1A7F3A;
  --bp-warn: #A55A00;
  --bp-err: #B3261E;
}
/* Dark mode is the inverse, not black: white on BitPolito blue. */
.dark, [data-theme="dark"] {
  --ink: #FFFFFF;
  --bg: #001CE0;
  --line: rgba(255, 255, 255, 0.22);
}
```

Semantic colours appear **only** inside status chips and short messages,
never as decoration. On the blue background use them as white text on a
semantic chip, or white text with a semantic left bar.

## 3. Type

| Role | Face | Notes |
|---|---|---|
| UI and body | `"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | BitPolito's deck and web face. Bold (700) for headings and buttons. |
| Rounded accents | `"SF Pro Rounded"` | Only where the decks use it; falls back to the stack above. |
| Labels, numbers, code | `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` | Google Fonts. Uppercase labels: 11–12 px, `letter-spacing: .18em`, weight 600. |
| Display (rare) | `"Playfair Display"` italic 700 | The site's logo face. Use for one editorial word at most, never body. |

SF Pro isn't on Google Fonts: rely on the system stack (it is SF on Apple
devices). Load JetBrains Mono, and Playfair Display only where used.

Scale: 12 · 14 · 16 · 20 · 28 · 40 · 56 px. Headings `text-wrap: balance`.

## 4. Components

- **Pill button**: `border-radius: 9999px; border: 2px solid var(--ink);
  font-weight: 700; padding: 10px 20px`. Primary = filled ink with paper
  text; secondary = transparent with ink text. Arrow suffix (`Discover →`)
  for navigation buttons, as on bitpolito.it.
- **Card**: white (or transparent on blue) with a 2 px ink border,
  radius 12 px (16 px for hero cards). No shadow.
- **Mono label / eyebrow**: `BITPOLITO · <SECTION>` in the mono label style.
- **Status chip**: radius 9999 px, 11 px mono uppercase, 1 px border in the
  semantic colour, tinted background at 10 %. States: settled → ok, failed →
  err, unknown/stuck → warn, in progress → ink.
- **Textures**: the dot grid (`radial-gradient(var(--line) 1px, transparent
  1px)` at 14 px) for hero backgrounds; diagonal stripes for empty or
  placeholder areas.
- **Focus**: 2 px ink outline, 2 px offset. Never remove it.

## 5. Brand assets (do not modify)

In `demo/brand/` straight from the media kit, which asks that logos and icons
not be modified without permission:

| File | Use |
|---|---|
| `bitpolito-logo.svg` | the pixel italic wordmark, blue |
| `bitpolito-pictogram.svg`, `bitpolito-bull-head.svg` | the pixel bull |
| `bitpolito-b.svg` | the pixel ₿ |

Recolouring a mark to white for the blue background is the media kit's own
"White" variant, so it is allowed; any other change is not. Use the files as
`<img>` or inline them unchanged except for `fill`.

New pixel art (ships, coins, rocks) is drawn on a **2-unit grid of squares**,
like the Academy's `BrandMark`, in the current ink colour.

## 6. Motion

Short and mechanical: 120–200 ms steps, `steps()` easing for pixel things,
no bounces. Everything honours `prefers-reduced-motion`.

## 7. Applying it to the demos

| Surface | Mode | Notes |
|---|---|---|
| Landing page | paper, light | Dot-grid hero, wordmark, two demo cards |
| Bounty board | paper, light | Hard-border cards; mono labels; GitHub links as pill buttons |
| Game (Orbital Sats) | **blue, dark**: white pixels on `#001CE0` | An arcade on BitPolito blue; coins are the pixel ₿ |
| Player wallet | blue, dark | Phone-sized, matches the game |
| Operator console | neutral (product UI of `@paycue/server`) | Not themed: it ships to all Paycue users |
