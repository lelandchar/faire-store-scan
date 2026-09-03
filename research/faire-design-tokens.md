# Faire Wholesale (iOS) — Design Tokens & Component Specs

Purpose: replicate the look of the Faire Wholesale iOS app in a mobile-web prototype (Next.js + Tailwind).
Researched 2026-09-02 from (a) faire.com's live CSS bundles and computed styles, (b) 20 Faire Wholesale iOS screenshots pulled from Mobbin (saved in `research/mobbin/`).

Confidence legend: **[V]** verified from Faire's own CSS/tokens · **[M]** measured from screenshots (±2 px) · **[E]** estimated / judgment call.

---

## 0. TL;DR

| Token | Value |
|---|---|
| Serif display font | **Nantes** (Book 300 / Regular 400) — fallback **Newsreader** [V] |
| Sans body font | **Graphik** (400 / 500 / 600) — fallback **Inter** (Faire itself ships Inter 400/570/700) [V] |
| Text primary | `#333333` [V] |
| Text subdued / MSRP / captions | `#6c6a6a` [V] |
| Placeholder / disabled text / inactive tab | `#8e8c8c` [V] |
| Border (default hairline) | `#dadada`, 1 px [V] |
| Surface secondary (selected row, search pill, disabled button) | `#f7f7f7` [V] |
| Surface tertiary (image placeholders, banners) | `#f1f1f1` [V] |
| Warm off-white (category tiles) | `#fbf8f6` [V] |
| Primary button | `#333333` fill, `#ffffff` text, **48 px** tall, **4 px** radius [V][M] |
| Pill radius | `999px` / `32px` [V] |
| Body type | 14 / 20, letter-spacing 0.15 px [V] |
| Display type | 30/38 · 38/50 · 52/64 serif, weight 400 [V] |
| Elevation | low `0 2px 8px rgba(0,0,0,.10)` · medium `0 2px 12px rgba(0,0,0,.15)` [V] |

Faire's internal design system is called **Slate** (`--slate-*` CSS variables). Everything in section 2–4 maps 1:1 to those tokens.

---

## 1. Typography

### 1.1 Real fonts (verified from `cdn.faire.com` @font-face rules)

```
Nantes   — NantesWeb-Book.woff2 (declared at weights 100/300), NantesWeb-Regular.woff2 (400/700)
Graphik  — Graphik-Regular-Web.woff2 (400), Graphik-Medium-Web.woff2 (500), Graphik-Semibold-Web.woff2 (600)
Inter    — Inter-Regular (400), Inter-SemiBold (570!), Inter-Bold (700)   ← also bundled by Faire
```

Slate tokens: `--slate-typography-family-serif: "Nantes_fix"`, `--slate-typography-family-sans: "Graphik_fix"`, legacy `--f_t_font_family_serif: nantes, georgia, serif`, `--f_t_font_family_sans: graphik, helvetica, sans-serif`.

Computed on faire.com: `h1` = `Nantes_fix, serif` 30px/38px 400; `h2` = `nantes, georgia, serif` 52px/64px 400; `p` = `Graphik_fix, sans-serif` 14px/20px, letter-spacing 0.15px; buttons = Graphik 14px/20px 400, letter-spacing 0.15px.

### 1.2 Google Fonts fallbacks (recommendation)

| Role | Real | Use this | Why |
|---|---|---|---|
| Display serif | Nantes | **Newsreader** (opsz 6–72, wght 400) | Nantes is a transitional/Scotch-flavoured serif: moderate contrast, slightly narrow, bracketed serifs, crisp ball terminals. Newsreader at large optical size matches the contrast, proportions and "editorial but warm" feel almost exactly. Fraunces (SOFT=0, WONK=0) is the runner-up but reads chunkier; Instrument Serif is too condensed/Didone; Playfair Display is too high-contrast/decorative. |
| Wordmark "FAIRE" | Nantes-based custom | **Instrument Serif**, `letter-spacing: 0.32em`, uppercase | Only for the letterspaced logo lockup on the welcome/splash screens. |
| Sans | Graphik | **Inter** (400 / 500 / 600) | Graphik is a plain neo-grotesque with a compact x-height; Inter is the closest widely-available match, and Faire already bundles Inter in its own CSS as a Graphik substitute. Add `letter-spacing: 0.15px` on body sizes to mirror Slate's `letter-spacing-200`. Work Sans / DM Sans / Public Sans are all wider or more geometric than Graphik. |

CSS URL (verified 200):
```
https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Inter:wght@400;500;600&display=swap
```
Optional wordmark: `&family=Instrument+Serif`

`next/font` setup:
```ts
// app/fonts.ts
import { Newsreader, Inter, Instrument_Serif } from "next/font/google";

export const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
});
export const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
export const wordmark = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-wordmark",
  display: "swap",
});
```
```ts
// tailwind.config.ts (fontFamily)
fontFamily: {
  serif: ["var(--font-serif)", "Georgia", "serif"],
  sans:  ["var(--font-sans)", "Helvetica", "Arial", "sans-serif"],
  wordmark: ["var(--font-wordmark)", "Georgia", "serif"],
},
```
Tip: Newsreader's opsz axis auto-selects a display cut at ≥ 30 px; add `font-optical-sizing: auto` (default) and never fake-bold it — Faire's serif is always weight 400.

### 1.3 Type scale (Slate tokens [V], plus iOS-observed sizes [M])

Slate size/line-height steps: 100 = 12/16 · 200 = 14/20 · 300 = 18/26 · 400 = 22/32 · 500 = 30/38 · 600 = 38/50 · 700 = 52/64 · 800 = 72/86. Letter-spacing: serif 0, sans 0.15 px. Weights: 400 / 500 / 600 only.

| Tailwind name | Font | Size / LH | Weight | Tracking | Used for (iOS) |
|---|---|---|---|---|---|
| `display-xl` | serif | 44 / 52 | 400 | 0 | "Congratulations!" (web display-l is 52/64; iOS renders ≈ 44) [M] |
| `display-l` | serif | 38 / 50 | 400 | 0 | Onboarding questions: "Which of these best describes your store?", "Store type" [M matches Slate 600] |
| `display-m` | serif | 30 / 38 | 400 | 0 | "Welcome to Faire", "Store Details", "Enter verification code" [V][M] |
| `page-heading` | serif | 22 / 30 | 400 | 0 | PDP product title ("Crochet Shopping Bag Tote"), "Products from similar brands", "Jump back in", "Thanks for your order!", "Saved", "Filters" (Slate page-heading 22/32) |
| `section` | sans | 20 / 28 | 500 | 0 | "Ideas for you", "Similar products", "Complete your cart", "Popular with stores like yours" (Slate section-heading is 22/32 500 on web; iOS ≈ 20) [M] |
| `subheading` | sans | 18 / 26 | 500 | 0.15px | Brand name on PDP, cart brand names, "Brand minimum" |
| `body-lg` | sans | 16 / 24 | 400 | 0.15px | Onboarding subtitle, option-row labels, input values |
| `body` | sans | 14 / 20 | 400 | 0.15px | Product names, descriptions, cart meta, tabs |
| `body-md` | sans | 14 / 20 | 500 | 0.15px | Emphasis inline ("Estimated delivery **Jan 5-14**"), button labels, tab labels |
| `price` | sans | 16 / 20 | 600 | 0 | "$3", "$4.80" |
| `label` | sans | 12 / 16 | 400 | 0.15px | Input labels ("Store Name"), MSRP, "Case of 1", "250 characters max", captions |
| `label-md` | sans | 12 / 16 | 500 | 0.15px | Badges ("Bestseller"), chips, tab-bar labels (tab bar is 10/12 500) |
| `wordmark` | Instrument Serif | 18 / 24 | 400 | 0.32em, uppercase | "F A I R E" |

Big number: brand rating "4.9" = serif 44/48 400 next to a 20 px star.

---

## 2. Color tokens (Slate palette, hex verified from faire.com CSS)

### 2.1 Primitive palette

| Name | Hex | Notes |
|---|---|---|
| grey-100 | `#ffffff` | surface primary |
| grey-200 | `#f7f7f7` | surface secondary: selected option row, search pill bg, disabled button, chips |
| grey-300 | `#f1f1f1` | surface tertiary: image placeholder, info banners (Top Shop card), cart-details header band |
| grey-400 | `#dadada` | border muted: hairlines, input borders, dividers, tab-bar top border |
| grey-600 | `#8e8c8c` | placeholder text, disabled text, inactive tab icon/label, star rating bars (empty) |
| grey-700 | `#6c6a6a` | text subdued: MSRP, captions, secondary meta, border-subdued |
| grey-800 | `#474747` | pressed/hover of primary |
| grey-900 | `#333333` | text primary, icons, primary button fill, active border |
| grey-1000 | `#000000` | hover/active of primary button (web) |
| neutral-100 | `#fbf8f6` | warm off-white — home category tiles |
| neutral-600 | `#b5a998` | warm mid — decorative strokes |
| neutral-1000 | `#585550` | warm dark |
| orange-100 | `#f6eee4` | peach tile bg (Browse "Categories" row), "Free returns" banner |
| orange-400 | `#ab7456` | "Minimum reached" text, "Up to 10% off" promo |
| orange-1000 | `#7d3e1e` | sale text ("Only 5 Left."), message-text-sale |
| red-100 | `#f2e5e1` | critical surface |
| red-200 | `#e9e0dc` | expressive red surface |
| red-500 | `#d17e70` | critical border |
| red-700 | `#921100` | "Final Sale", "Bestseller" (PDP red label), critical text, favorited heart (token) |
| red-800 | `#5a1e09` | critical hover |
| red-1000 | `#390d18` | expressive red text |
| green-100 | `#e9f1e5` | success surface |
| green-200 | `#dde3d0` | Top Shop surface |
| green-300 | `#d9d8cd` | expressive green surface |
| green-500 | `#91957b` | Top Shop badge/icon (sage) |
| green-600 | `#91a793` | success border |
| green-700 | `#49694c` | brand-minimum progress bar, success icon |
| green-1000 | `#3e4023` | Top Shop text |
| teal-600 | `#36676a` | "Free shipping over $250" text, Insider icon |
| teal-900 | `#154548` | Insider text |
| blue-100 | `#f2f5f5` | info surface (light) |
| blue-200 | `#e2e7f0` | info surface, saved-board placeholder (`#e5e9ea` observed) |
| blue-400 | `#7a7885` | info border |
| blue-700 | `#275ec5` | focus ring |
| blue-1000 | `#1b2834` | info text |
| yellow-100 | `#f6efdb` | warning surface |
| yellow-200 | `#ece3d2` | expressive yellow surface |
| yellow-400 | `#d1b985` | warning border |
| yellow-800 | `#907c3a` | warning icon (bronze) |
| yellow-1000 | `#595540` | expressive yellow text |
| bronze (faire_source) | `#735b21` | **gold/bronze check-circle on "Free Returns"** (observed ≈ `#857870` after JPEG; use `#735b21` or `#907c3a`) |
| faire_pay | `#365cbb` / surface `#e9eefb` | Faire Pay |
| market | `#df6630` / `#56160c` / `#f38f7f` | Faire Market promos |
| ai_suggestions | `#f7e9ff` / border `#eacfff` | AI suggestion surfaces |
| faire_direct | `#e8eeff` / `#a2b8ff` / `#fe8240` | Faire Direct |
| text-accent | `#ff5dd9` | hot-pink accent (rare) |
| marketing chartreuse | `#F1F29F` | faire.com hero headline color — NOT used in the app |
| transparent-grey-100 | `rgba(51,51,51,.05)` | overlay |
| transparent-grey-200 | `rgba(51,51,51,.10)` | overlay strong |
| transparent-grey-500 | `rgba(51,51,51,.50)` | modal mask / sheet scrim |

### 2.2 Semantic aliases (Tailwind-ready)

```ts
colors: {
  ink:        { DEFAULT: "#333333", subdued: "#6c6a6a", muted: "#8e8c8c", inverse: "#ffffff" },
  surface:    { DEFAULT: "#ffffff", 2: "#f7f7f7", 3: "#f1f1f1", warm: "#fbf8f6", peach: "#f6eee4", blush: "#fdf7f7", inverse: "#333333" },
  line:       { DEFAULT: "#dadada", strong: "#333333", subdued: "#6c6a6a" },
  action:     { DEFAULT: "#333333", hover: "#000000", pressed: "#474747", disabled: "#f7f7f7", "disabled-text": "#8e8c8c" },
  focus:      "#275ec5",
  sale:       "#7d3e1e",
  critical:   "#921100",
  warn:       "#ab7456",
  ship:       "#36676a",
  progress:   "#49694c",
  topshop:    { DEFAULT: "#91957b", surface: "#dde3d0", text: "#3e4023" },
  bronze:     "#735b21",
  heart:      "#921100",
  scrim:      "rgba(51,51,51,0.5)",
}
```

Contrast notes: `#333` on `#fff` = 12.6:1; `#6c6a6a` on `#fff` = 5.3:1 (AA); `#8e8c8c` on `#fff` = 3.4:1 (large text/placeholder only); `#fff` on `#333` = 12.6:1.

---

## 3. Spacing, radii, borders, shadows [V]

Slate base unit `--slate-dimensions-1` = 4 px.

| Token | Value | Where |
|---|---|---|
| space-1 … space-8 | 4, 8, 12, 16, 20, 24, 32 | element xsmall 4 · small/default 8 · medium 12 · large 16 · xlarge 20 · xxlarge 24 · xxxlarge 32; group 8/12/16; section 32 |
| page gutter | **16 px** (home, PDP, cart) · **32 px** (onboarding question screens) [M] | |
| grid gap | 12 px between product columns, 24 px between rows [M] | |
| radius-sm | 2 px | checkbox, tags |
| radius | **4 px** | buttons, inputs, option rows, cards, images, tiles, textarea, chips with border |
| radius-pill | 999 px (32 px) | search bar, filter chips, "Sort by Brand" pill, icon circles |
| border | 1 px | all hairlines; 1.5 px stroke for icons |
| shadow-low | `0 2px 8px 0 rgba(0,0,0,.10)` | sticky "brand minimum" card on PDP, floating "+" button |
| shadow-med | `0 2px 12px 0 rgba(0,0,0,.15)` | toasts, sheets |
| toast | bg `#333`, text `#fff`, radius 4, padding 14, min-height 48, `0 4px 12px rgba(0,0,0,.10)` | "1 brand removed  **Undo**", "✓ Added to cart" |

Tailwind snippet:
```ts
theme: {
  extend: {
    borderRadius: { DEFAULT: "4px", sm: "2px", pill: "999px" },
    boxShadow: {
      low: "0 2px 8px 0 rgba(0,0,0,0.10)",
      med: "0 2px 12px 0 rgba(0,0,0,0.15)",
      toast: "0 4px 12px 0 rgba(0,0,0,0.10)",
    },
    letterSpacing: { body: "0.15px", wordmark: "0.32em" },
    fontSize: {
      "display-xl": ["44px", { lineHeight: "52px", fontWeight: "400" }],
      "display-l":  ["38px", { lineHeight: "50px", fontWeight: "400" }],
      "display-m":  ["30px", { lineHeight: "38px", fontWeight: "400" }],
      "page":       ["22px", { lineHeight: "30px", fontWeight: "400" }],
      "section":    ["20px", { lineHeight: "28px", fontWeight: "500" }],
      "sub":        ["18px", { lineHeight: "26px", fontWeight: "500", letterSpacing: "0.15px" }],
      "body-lg":    ["16px", { lineHeight: "24px", letterSpacing: "0.15px" }],
      "body":       ["14px", { lineHeight: "20px", letterSpacing: "0.15px" }],
      "price":      ["16px", { lineHeight: "20px", fontWeight: "600" }],
      "label":      ["12px", { lineHeight: "16px", letterSpacing: "0.15px" }],
      "tab":        ["10px", { lineHeight: "12px", fontWeight: "500" }],
    },
    height: { btn: "48px", row: "48px", search: "40px", tab: "50px" },
  },
}
```

---

## 4. Component specs

All measurements in CSS px at 390-wide viewport (screenshots are 393×852 iPhone; scaled 1.314× from 299 px Mobbin thumbnails).

### 4.1 Buttons
| Variant | Spec |
|---|---|
| **Primary** | h 48, full-width (gutter 16 or 32), bg `#333`, text `#fff` 14/20 500 (tracking 0.15), radius 4, no shadow. Hover/active: `#000` / `#474747`. Examples: "Next", "Continue", "Add to cart", "Checkout 1 brand", "Start Shopping", "Show 5,000+ matches". |
| **Primary disabled** | bg `#f7f7f7`, text `#8e8c8c`, no border. ("Continue →" on welcome, "Let's go shopping" before selection, "Checkout" under minimum.) |
| **Secondary** | h 48, bg `#fff`, 1 px `#dadada` border (web) / `#333` border (iOS "Show all", "Notify me when back in stock", "Shop all"), text `#333` 14/20 500, radius 4. |
| **Secondary with icon** | as above + 20 px leading icon (Apple/Google) left-aligned 16 px from edge, label centered. |
| **Plain / link button** | inline text `#333` 14/20, `text-decoration: underline`, `text-underline-offset: 25%` (≈3 px), thickness 1 px. ("Show details", "Resend code", "Learn more", "Save for Later", "Remove all", "Show more"). Hover: `filter: brightness(90%)`. |
| **Icon button (circle)** | 32×32 (36 on PDP hero), bg `#fff`, 1 px `#dadada` border, radius 999, icon 20 px stroke 1.5 `#333`. Heart, "⋮" more, back chevron on image-headers. |
| **Floating "+" add** | 32×32 circle `#fff`, shadow-low, "+" 16 px `#333`; bottom-right of product image, inset 8. |
| **Quantity stepper** | h 48, border 1 px `#dadada` radius 4, "−" / number / "+" segments; number box 40 wide with 1 px `#dadada` border. |
| **Quantity dropdown** | h 48, border 1 px `#dadada` radius 4, "1 ($4.80)" 14/20 centered + chevron 16 px; sits beside a primary "Add to cart" (dropdown ≈ 43% width, gap 12). |

### 4.2 Option list rows (onboarding "Which of these best describes your store?")
- Row: full width inside 32 px gutters (326 wide), **h 48**, bg `#fff`, 1 px `#dadada` border, radius 4, label 16/24 400 `#333` centered.
- Gap between rows: **12 px**.
- **Selected**: bg `#f7f7f7`, border `#333` 1 px (no check icon, no bold).
- Pressed: bg `#f1f1f1`.
- Heading above: display-l 38/50 serif, 40 px below the back chevron; 24 px gap to first row.
- List scrolls under a fixed bottom CTA (primary button h 48, 16 px above the home indicator, white gradient fade above it).

### 4.3 Text inputs
- **Underline style** (onboarding "Store Name", sign-up form): label 12/16 `#6c6a6a` above; value 16/24 `#333`; bottom border 1 px `#dadada`; focused bottom border `#333`; padding 8 px 0 12 px; no bg, no side borders. Helper "250 characters max" 12/16 `#6c6a6a` below-left.
- **Boxed input** (welcome email, filters search): h 48, border 1 px `#dadada`, radius 4, padding 0 12, placeholder `#8e8c8c`. Focus: border `#333` (+ optional 2 px `#275ec5` ring on web).
- **Textarea**: same as boxed, min-h 132, counter "9/500" bottom-right 12/16 `#6c6a6a`.
- **Verification code**: six 44×48 boxes, 1 px `#dadada`, radius 4, gap 8, active box border `#333`.
- **Select**: h 48, 1 px `#dadada` radius 4, value centered, chevron right.
- **Checkbox**: 20×20, 1 px `#333` (unchecked `#6c6a6a`), radius 2; checked = `#333` fill with white check.
- **Radio**: 20×20 circle, 1 px `#6c6a6a`; selected = 2 px `#333` ring + 10 px `#333` dot.

### 4.4 Search pill (home / browse / brand page / cart)
- h **40**, radius 999, bg `#fff`, 1 px `#dadada` border (cart variant: bg `#f7f7f7`, border `#dadada`).
- Left: 20 px magnifier icon at 12 px inset; placeholder "Search" 16/24 `#333` (yes, primary color, not grey) 8 px after icon.
- Right: 20 px camera icon 12 px inset. (Focused state: "×" clear + "Cancel" text button outside the pill.)
- Home: pill x 16→330 (w 314); to its right a 32 px outlined circle with chat-bubble icon, right edge at 374.
- Below-pill top margin: 8 px from status bar; 28 px to first tile row.

### 4.5 Category tile (home, 2 rows horizontally scrolling)
- 168 × 64, radius 4, bg `#fbf8f6` (warm off-white); 6 px gap between tiles, 8 px between rows; row starts at x 16, overflows right (shows 2.3 tiles).
- Label 14/18 400 `#333`, 2 lines max, left padding 12, vertically centered.
- Image 48×48, radius 4, `object-cover`, right-aligned inset 8.
- Browse tab variant: 2-column tiles (173 × 52 top row w/ illustrations, 173 × 106 "For you" tiles) with bg `#fdf7f7` (blush) or `#f6eee4` (peach), title 14/20 500 top-left (12,12), 48×48 image bottom-left.

### 4.6 Product card (2-col grid)
```
┌─────────────────┐ 173 × 173 image, radius 4, bg #f1f1f1 while loading
│[Bestseller]   ♡ │ badge: 12 px inset; heart: 32 circle white, 8 px inset
│              (+)│ + button: 32 circle white shadow-low, 8 px inset
└─────────────────┘
$3  MSRP $6         price 16/20 600 #333 · gap 6 · "MSRP $6" 12/16 400 #6c6a6a, baseline-aligned, margin-top 12
Mini Organic Simmer name 14/20 400 #333, line-clamp-2, margin-top 4
Pot Kits
⛨ Lansing Scent Co… brand 13/18 400 #333 underlined (offset 3 px), preceded by 12 px Top Shop shield #91957b; single line ellipsis; margin-top 6
★ 4.9  $75 min      13/18 400 #333; star 12 px #333; gap 8; margin-top 4
```
- Column width 173 at 390 (gutter 16, gap 12). Row gap 24.
- Brand-page variant adds a row of 24 px circular color swatches "+22" and "Case of 1" 12/16 `#6c6a6a`.
- Bestseller badge on PDP is red text `#921100` 12/16 500 above the title (not a pill).

### 4.7 Badges & chips
| Badge | Spec |
|---|---|
| "Bestseller" pill on image | bg `#fff`, text `#333` 12/16 500, padding 4 × 8, radius 4 (slightly rounded rectangle, not full pill), no shadow. "Brand bestseller" wraps to 2 lines. |
| Top Shop shield | 12–16 px shield icon `#91957b`; large badge is a 96 px sage wreath rosette `#91a793` on `#f1f1f1` card. |
| "Top 5% reordered candles & holders" | chip h 24, 1 px `#dadada` border, radius 4, text 12/16 `#333`, 14 px ↻ icon. |
| Filter chips ("Low minimum", "Bestsellers") | h 36, 1 px `#333` border, radius 999, padding 0 16, text 14/20 `#333`; selected = `#333` fill / white text. "All filters" chip has ⚙ sliders icon. |
| "Sort by Brand ⌄" | h 36, `#333` fill, white text 14/20 500, radius 999, padding 0 16. |
| Tab bar cart count | 16 px circle `#333`, white 10 px digit, top-right of icon. Profile red dot = 8 px `#921100`. |
| "Free shipping over $250" | teal `#36676a` 14/20 with 16 px key/ticket icon. |
| "Minimum reached" | `#ab7456` 14/20; "No minimum" `#333`. |
| Brand-minimum progress | track 4 px `#dadada` radius 2; fill `#49694c`. |
| Inline sale/critical notes | "Final Sale." `#921100` 500 + rest `#333`; "Only 5 Left." `#7d3e1e`. |

### 4.8 Top navigation
- Height 44 (+ safe-area 47/54). Title 16/24 500 `#333` centered; optional 12/16 `#6c6a6a` subtitle ("4 saved").
- **Back chevron**: 24 px "‹" stroke 1.5 `#333`, 16 px from left edge (onboarding screens have chevron only, no title, 8 px below status bar).
- Over-image header (PDP): chevron/heart/more inside 36 px white circles with 1 px `#dadada`.
- Scrolled PDP header: pill-shaped title bar 40 h with chevron circle + truncated title + heart + more.
- Sheet header (filters): "×" 24 px right-aligned or left; title centered 16/24 500; "Clear all" plain link right.
- Segmented tabs (cart "In cart 2 | Saved 0", brand "All products | Bestsellers | New"): 14/20 400 `#333`, active 500 with 2 px `#333` underline, count in 12/16 `#6c6a6a`; hairline `#dadada` under the whole row.

### 4.9 Dividers & sections
- Hairline `#dadada` 1 px, full-bleed for list separators (reviews, cart brands, settings rows); inset 16 in cards.
- Congratulations screen: two full-width `#dadada` rules framing the "Your account has been created with ✓ Free Returns" line (24 px padding above/below); bronze check = 20 px circle, 1.5 px stroke `#735b21`, check inside.
- Section spacing: 32 px between sections, 12 px between section title and content.
- Grey band: `#f7f7f7` full-bleed 8 px between cart-details header and body; `#f1f1f1` cards for informational blocks (Top Shop explanation) with 16 px padding, radius 4.

### 4.10 Bottom tab bar
- Height **50** + 34 safe-area (total 84); bg `#fff`; top border 1 px `#dadada`.
- 5 items: Home (house), Browse (magnifier + sparkle), Cart (cart), Orders (box), Profile (person) — thin line icons 24×24 stroke 1.5.
- Active: icon + label `#333` (label 10/12 500); inactive `#8e8c8c`. No pill/indicator.
- Label 4 px below icon; item content vertically centered.

### 4.11 Toast
- Bottom sheet toast above tab bar: bg `#333`, text `#fff` 14/20, radius 4, padding 14 × 16, h 48, action "Undo" `#fff` underlined right-aligned; shadow-toast; slides up 8 px + fade 200 ms.

### 4.12 Sheets / modals
- Bottom sheet: bg `#fff`, top radius 12, scrim `rgba(51,51,51,.5)`, drag area 24; sticky footer with primary button + 16 px padding; behind-page scales 0.94 and darkens (iOS card presentation).

---

## 5. Home screen layout (390 × 844 frame; y in px from top)

```
y0    ┌────────────────────────────────────────────────┐
      │ 9:41                                   ●●● ▮   │  status bar 0–54 (safe-area 47 Dynamic Island)
y55   │ ╭──────────────────────────────────╮   ◯      │  search pill: x16→330 (w314) h40 r999 border #dadada
      │ │ ⌕  Search                      ◫ │ (chat)   │  icons 20px; chat = 32px outlined circle, right edge x374
y95   │ ╰──────────────────────────────────╯          │
      │                                                │  gap 28
y123  │ ┌────────────┬─┐┌────────────┬─┐┌──────       │  tile row 1: x16, each 168×64 r4 bg #fbf8f6, gap 6
      │ │Kitchen &   │▩││Candles     │▩││Thr          │  label 14/18 #333 @ pad 12; img 48×48 r4 inset 8
y187  │ │tabletop    │ ││& holders   │ ││& b          │
      │ └────────────┴─┘└────────────┴─┘└──────       │  row gap 8
y195  │ ┌────────────┬─┐┌────────────┬─┐┌──────       │  tile row 2 (Home accents, Wall decor, Garden…)
y259  │ └────────────┴─┘└────────────┴─┘└──────       │
      │                                                │  gap 32
y291  │ Ideas for you                                  │  section 20/28 500 #333, x16
      │                                                │  gap 12
y331  │ ┌───────────────┐    ┌───────────────┐         │  grid: 2 cols × 173, gap 12, gutter 16
      │ │[Bestseller]  ♡│    │[Bestseller]  ♡│         │  image 173×173 r4; badge inset 12; heart 32 circle inset 8
      │ │               │    │               │         │
      │ │            (+)│    │            (+)│         │  + 32 circle white, shadow-low, inset 8
y504  │ └───────────────┘    └───────────────┘         │
y516  │ $3  MSRP $6          $2.65  MSRP $5.30         │  price 16/20 600 + MSRP 12/16 #6c6a6a (mt 12)
y540  │ Mini Organic Simmer  Handmade Soap Bar,        │  name 14/20 400, 2 lines (mt 4)
y560  │ Pot Kits             Natural Soaps, Different… │
y586  │ ⛨ Lansing Scent Com… ⛨ Sweet Caramel Shop      │  brand 13/18 underlined + 12px shield #91957b (mt 6)
y608  │ ★ 4.9  $75 min       ★ 5.0  $150 min           │  13/18 #333 (mt 4)
      │                                                │  row gap 24
y632  │ ┌───────────────┐    ┌───────────────┐         │  next product row …
      │ │[Bestseller]  ♡│    │[Bestseller]  ♡│         │
y760  ├────────────────────────────────────────────────┤  tab bar top border 1px #dadada  (y ≈ 760–767)
      │   ⌂        ⌕        🛒        ▣        ◯       │  icons 24 stroke 1.5, centered in 5 × 78 px cells
y802  │  Home    Browse    Cart     Orders   Profile   │  labels 10/12 500; active #333, inactive #8e8c8c
y810  │                 ▬▬▬▬▬▬▬▬▬                      │  home indicator; safe-area bottom 34
y844  └────────────────────────────────────────────────┘
```
Horizontal rhythm: gutter 16 · tile width 168 · tile gap 6 · product col 173 · col gap 12 · icon inset 8 · badge inset 12.
Vertical rhythm: pill 40 · gap 28 · tiles 64+8+64 · gap 32 · title 28 · gap 12 · image 173 · text block ~104 · row gap 24 · tab bar 50+34.

---

## 6. Motion notes

Faire is restrained; nothing bounces.
- Default transition: `150–200 ms`, `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease) for color/border/opacity; `250 ms cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo-ish) for movement.
- Button press: bg `#333 → #474747` 100 ms; no scale. Web hover: `#333 → #000`, plain links `filter: brightness(90%)`.
- Option row select: bg + border swap 150 ms ease; no ripple.
- Heart favorite: 150 ms fill `#921100`, tiny 1.1× pop optional; "Added to cart" toast slides up 8 px + fades in 200 ms, auto-dismiss 3 s; confetti burst (sparse, muted palette: `#f1f29f`, `#d17e70`, `#3e4023`, `#ab7456`) only on first add-to-cart.
- Screens push horizontally (iOS nav) 350 ms; sheets slide up 300 ms ease-out with scrim fade 200 ms; behind-view scales to 0.94.
- Skeletons: `#f1f1f1` blocks with a slow (1.4 s) shimmer, radius 4 — the search-focus state simply fades the page to 30 % opacity (no blur).
- Horizontal carousels: native momentum scroll, no snap points, 16 px leading gutter, peek ≈ 30 % of the next tile.
- Respect `prefers-reduced-motion`: drop the slide/scale, keep fades.

---

## 7. Do / Don't

**Do**
- Use serif (Newsreader) only for headings/titles at 22 px+, always weight 400, tracking 0, tight-ish leading (≈1.25–1.3).
- Keep everything else in the sans at 12/14/16 with `letter-spacing: 0.15px`; emphasize with 500/600 weight, never with color.
- Use one radius (4 px) for rectangles and 999 for pills/circles; no 8–16 px "card" corners.
- Keep the palette almost monochrome: `#333` / `#6c6a6a` / `#8e8c8c` / `#dadada` / `#f7f7f7` / `#f1f1f1` / `#fff`, plus the warm tile tints (`#fbf8f6`, `#f6eee4`, `#fdf7f7`).
- Reserve color for meaning: teal = shipping perk, sage = Top Shop, orange-brown = minimums/promos/sale, red = critical/favorited, bronze = account perks.
- Underline links (offset 3 px) in `#333`; do not color them blue.
- Photography does the decorating: square product images edge-to-edge in their column, off-white tiles behind lifestyle crops.
- Full-width 48 px dark buttons pinned to the bottom, one per screen.
- Hairline `#dadada` dividers, 1 px; borders on inputs/rows are 1 px `#dadada` → `#333` when active/selected.

**Don't**
- No drop shadows on cards or buttons (only the floating "+" and toasts).
- No bold serif, no italic serif, no serif in body copy or buttons.
- No blue links, no gradients, no filled colored buttons (the only fills are `#333` and `#f7f7f7`).
- No rounded-corner "cards" with borders around product grid items — items are borderless.
- Don't grey the placeholder in the search pill; it's `#333` text "Search".
- Don't use pure black `#000` for text; primary is `#333333`.
- Don't add iconography colors — icons are 1.5 px line icons in `#333` (or `#8e8c8c` inactive).
- Don't animate with springs/bounces or scale buttons on press.
- Don't use `#F1F29F` chartreuse in the app UI (marketing-site only).

---

## 8. Mobbin screenshot index (`research/mobbin/`, 299×678 jpg, ≈0.76× of 393×852)

| File | Screen | Mobbin |
|---|---|---|
| 01-home-ideas-for-you.jpg | Home: search pill, 2-row category tiles, "Ideas for you" grid, tab bar | https://mobbin.com/screens/f92840a0-2121-4d66-a5d4-9f5b8d162f98 |
| 02-home-alt-categories.jpg | Home (alt tile set: Throw pillows, Home fragrances, Garden, Bath) | https://mobbin.com/screens/c2d13b03-a7d7-46f7-91b0-33b5d5cd1835 |
| 03-onboarding-welcome.jpg | Welcome: hero photo, FAIRE wordmark, email input, disabled Continue, Apple/Google buttons | https://mobbin.com/screens/c6ccbf6e-c343-4ad2-a8b4-10701bd5a146 |
| 04-onboarding-store-type-list.jpg | "Which of these best describes your store?" option list, disabled CTA | https://mobbin.com/screens/c56321dd-05ce-424f-9ff1-f978713c9ecc |
| 05-onboarding-step-8.jpg | "Store Details": underline input + textarea + keyboard, Next button | https://mobbin.com/screens/52e13e34-36fa-47e1-b277-f30598397229 |
| 06-onboarding-step-10.jpg | Store type list scrolled, "Home Decor Store" selected, enabled CTA | https://mobbin.com/screens/4fc4513a-3c0d-4980-8213-9d9e2fd1cf93 |
| 07-onboarding-step-11-congrats.jpg | "Congratulations!" with Free Returns check + Start Shopping | https://mobbin.com/screens/aacf7ed7-eb33-41b2-9642-67814c030208 |
| 08-browse-tab.jpg | Browse tab: illustrated category tiles, "For you" 2-col tiles | https://mobbin.com/screens/24d67e77-fe1c-4c50-bd9d-354dbb080888 |
| 09-search-focused-empty.jpg | Search focused (page faded, keyboard, Cancel) | https://mobbin.com/screens/a3420109-a35d-4566-86a6-cd75edbcc2e9 |
| 10-search-suggestions-soap.jpg | Search suggestions + Brands rows | https://mobbin.com/screens/7d9074ce-c323-49c5-8fb2-60dc6df5a13b |
| 11-pdp-crochet-tote.jpg | PDP: hero, brand row, Bestseller label, serif title, price/MSRP, sticky minimum card, qty + Add to cart | https://mobbin.com/screens/fcacb090-83a2-422a-8a2a-fdbadabb2210 |
| 12-cart-two-brands-checkout.jpg | Cart with 2 brands, checkboxes, "Checkout 1 brand" | https://mobbin.com/screens/6f637520-1199-4a6b-a480-0f894395299d |
| 13-pdp-options-sizes.jpg | PDP options: stepper, swatch box, select, shipping bullets, Add to cart, Final Sale | https://mobbin.com/screens/dba34007-6a67-429d-bdec-22af92e9b821 |
| 14-cart-single-brand.jpg | Cart, 1 brand under minimum, disabled Checkout | https://mobbin.com/screens/ef8964a1-76c1-4218-97e1-e455de9bd6c0 |
| 15-cart-details.jpg | Cart details: brand header, line item, "Complete your cart", Proceed to checkout | https://mobbin.com/screens/fbae0131-9bd2-4b18-86bb-e89ea1627828 |
| 16-brand-page-products.jpg | Brand page product grid with swatches + "Case of 1" | https://mobbin.com/screens/eef344ac-8bcd-4675-a0eb-044d9649b12f |
| 17-pdp-matches-hero.jpg | PDP over-image header, dots, Top 5% chip, color label | https://mobbin.com/screens/53697bc8-98cc-45b6-a686-18cdffd0503f |
| 18-brand-rating-reviews.jpg | Brand rating 4.9 breakdown, category scores, reviews | https://mobbin.com/screens/f69501f7-7e9a-4439-9d5c-1cb8ca537125 |
| 19-filters-sheet.jpg | Filters sheet: chips, radios, search, checkboxes, CTA | https://mobbin.com/screens/ba4cafbc-54a1-4c9c-a47e-84cab6cf4c38 |
| 20-saved-boards.jpg | Saved boards grid, "Create New Board" | https://mobbin.com/screens/db51725c-7108-4a6d-b67a-cb254dc33700 |

Flows on Mobbin (login required for full res): Onboarding https://mobbin.com/flows/2aa5c6b1-3208-42ee-bb3a-233e57f2d373 · Logging in https://mobbin.com/flows/ba636ff6-7fc6-4e98-b6ec-53123b3a3591 · Searching https://mobbin.com/flows/f3f46bcf-ba44-4219-93c2-14d08f216aaf · Purchasing https://mobbin.com/flows/a7224618-09f9-4027-9385-98af90aa81b8 · Store detail https://mobbin.com/flows/b8f1e704-43f8-4552-963d-df6199e16a1a · App: https://mobbin.com/apps/faire-wholesale-ios-7fc33ff2-0840-4bcd-97d5-9c050ffb6719

Source CSS: `https://cdn.faire.com/visitor/_next/static/css/aa692050827d8ae0.css` (446 KB; contains all `--slate-*` tokens and `@font-face` rules).
