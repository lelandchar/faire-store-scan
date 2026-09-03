# Synthetic wholesale catalog

`catalog.json` is a hand-authored, fully synthetic product catalog for the Faire-style
personalization demo. Every brand, product, price and review count is fictional; no real
marketplace brands are referenced. It is deliberately diverse (styles, price tiers,
bestsellers vs. new brands) so a personalization layer can visibly re-rank it.

## Contents

- 72 products, 6 per category across 12 categories
- 43 fictional brands; ~half are reused across 2-3 products
- ~28% of products belong to brands flagged as new to the marketplace
- Product images live in `public/catalog/<id>.jpg` (800x800 JPEG, <=120KB each)

Categories (exact `category` strings) and their id prefixes:

| Prefix | Category               |
|--------|------------------------|
| `hd`   | Home decor             |
| `kt`   | Kitchen & tabletop     |
| `cf`   | Candles & fragrance    |
| `sp`   | Stationery & paper     |
| `bj`   | Books & journals       |
| `ap`   | Apparel                |
| `ja`   | Jewelry & accessories  |
| `bb`   | Bath & body            |
| `fd`   | Food & drink           |
| `kb`   | Kids & baby            |
| `pt`   | Pets                   |
| `go`   | Garden & outdoor       |

## Schema

`catalog.json` is a JSON array of product objects:

```jsonc
{
  "id": "kt-01",                          // "<category prefix>-<2-digit number>", unique
  "name": "Stoneware Serving Bowl, Oat",   // Faire-style listing name, 3-7 words
  "brand": "Hearth & Hollow",              // fictional small-brand name
  "category": "Kitchen & tabletop",        // one of the 12 categories above
  "subcategory": "Serveware",              // free-text, e.g. Drinkware, Candles, Earrings
  "wholesalePrice": 14.5,                  // USD, what a retailer pays per unit
  "msrp": 29,                              // USD suggested retail, ~2x wholesale
  "minOrder": 100,                         // brand minimum in USD: 50 | 75 | 100 | 150 | 200 | 250
  "rating": 4.8,                           // 4.3 - 5.0
  "reviewCount": 132,                      // retailer review count (low for new brands)
  "styles": ["minimalist", "modern-farmhouse"],  // 1-3 style tags, see list below
  "materials": ["stoneware"],              // simple material words
  "colors": ["oat", "cream"],              // simple color words
  "priceTier": "mid",                      // "value" | "mid" | "premium" (relative within category)
  "isBestseller": true,                    // marketplace bestseller badge
  "isNewBrand": false,                     // brand-level flag, ~25% of products
  "leadTimeDays": 5,                       // typical ship lead time
  "madeIn": "USA",                         // country of manufacture
  "image": "/catalog/kt-01.jpg",           // path under public/
  "imagePrompt": "Wholesale marketplace product photo of ..."  // exact prompt used for the image
}
```

Style vocabulary (`styles`): `minimalist`, `modern-farmhouse`, `boho`, `coastal`,
`cottagecore`, `playful`, `luxe`, `rustic`, `vintage`, `scandinavian`, `maximalist`,
`literary`, `natural`.

Brand-level fields (`minOrder`, `isNewBrand`) are constant for every product of a brand, so
filtering or ranking by brand stays consistent.

Each category intentionally contains a spread of:

- styles (e.g. minimalist/scandinavian vs. boho vs. playful/maximalist vs. luxe/vintage)
- price tiers (at least one `value` and one `premium` product per category)
- bestsellers (about half) and products from new brands (at least one per category)

## How the images were produced

Every product has one square photo generated with OpenAI `gpt-image-2` via the Codex CLI
(`codex-image` wrapper, billed to the ChatGPT subscription rather than an API key).

Prompt style is identical for all products; the only variable part is the product
description. The exact prompt for each product is stored in its `imagePrompt` field:

```
Wholesale marketplace product photo of <product description>. Single product, centered,
soft natural window light, plain warm off-white background or simple styled surface,
shallow depth of field, no text, no logos, no people, editorial catalog photography, square.
```

Pipeline per product:

1. `codex-image -o <id>.png "<imagePrompt>"` -> a 1254x1254 PNG (the model's native square size)
2. macOS `sips`: square-crop if needed, resize to 800x800, encode JPEG at quality 80,
   stepping quality down (72, 64, ...) only if the file exceeds 120KB
3. saved as `public/catalog/<id>.jpg`

Generation ran 4 products at a time, each in an isolated `CODEX_HOME` so concurrent runs
could not pick up each other's output files.

## Regenerating

- Data: `catalog.json` was emitted by a small Python script that holds the product table and
  validates it (72 products, 6 per category, unique ids, valid styles/tiers/min orders,
  msrp ~2x wholesale). Edit the JSON directly for small tweaks.
- Images: re-run the `imagePrompt` for a product through `codex-image`, then resize with
  `sips -z 800 800 in.png --out tmp.png && sips -s format jpeg -s formatOptions 80 tmp.png --out public/catalog/<id>.jpg`.
