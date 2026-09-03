# Shopify product-catalogue wholesale catalog (`catalog-shopify.json`)

`catalog-shopify.json` + `public/catalog-shopify/<id>.jpg` is a third catalog for the
Faire-style personalization demo, built from the Hugging Face dataset
**`Shopify/product-catalogue`** (Apache-2.0). Unlike the ABO build (`catalog-public.json`,
Amazon private-label products on white) this one is real Shopify merchants: ~926 distinct
brands, seller-shot product photos, a wide spread of niche product types. It uses the same
`Product` schema (`src/lib/types.ts`) plus `source*` provenance fields, so the app and the
embedding retrieval can consume it like the other two files.

Everything is produced by one reproducible script (plain Node 22, no npm dependencies,
macOS `sips` for images):

```bash
node scripts/build-shopify-catalog.mjs                  # full build: pages through the rows API, caches, downloads images
node scripts/build-shopify-catalog.mjs --dry            # fetch/parse only, prints mapping stats, no images
node scripts/build-shopify-catalog.mjs --cached-only    # use only pages already in .cache/ (no rows-API calls; what shipped)
node scripts/build-shopify-catalog.mjs --cap 40         # per-category cap (default 100)
node scripts/build-shopify-catalog.mjs --test "<raw title>" "<brand>"   # debug the name cleaner / English check
HF_TOKEN=hf_... node scripts/build-shopify-catalog.mjs  # optional: authenticated rows-API calls (higher rate limit)
DEBUG_DROPS=1 node scripts/build-shopify-catalog.mjs --dry --cached-only   # print examples of each drop reason
```

The build is deterministic for a given set of cached pages (seeded RNG, seed
`faire-shopify-catalog-v1`): same rows in, same products / ids / synthetic values out.

## Dataset

**Shopify/product-catalogue** on the Hugging Face Hub, split `train`, 38,631 rows, ~9.5 GB of
parquet (the size is the embedded images).

- <https://huggingface.co/datasets/Shopify/product-catalogue>
- License: **Apache-2.0** (dataset card)
- Columns used: `product_title`, `product_description`, `product_image` (image),
  `ground_truth_brand`, `ground_truth_is_secondhand`, `ground_truth_category`
  (a Google product taxonomy path, e.g. `Home & Garden > Decor > Piggy Banks & Money Jars > Piggy Banks`).
  `potential_product_categories` is not used.

### How it is fetched (no parquet download)

The script pages through the **datasets-server rows API**
(`https://datasets-server.huggingface.co/rows?dataset=Shopify/product-catalogue&config=default&split=train&offset=N&length=100`,
387 pages) and stores each page, slimmed to the six columns above, under
`.cache/shopify-rows/rows-NNNNN.json` (gitignored). Re-runs read from that cache.

Two things about that API shaped the script:

- **Rate limit.** The datasets-server enforces a short-window burst limit per IP; unpaced
  concurrent requests get `429` almost immediately. The script uses 3 workers behind a global
  pacer (one request start per second) and, on any `429`, pauses every worker for 45 s. That
  sustains roughly 20-25 pages/minute unauthenticated. `HF_TOKEN` raises the limit.
- **Signed image URLs.** Each row's `product_image.src` is a CloudFront-signed URL that expires
  after about an hour. The image stage downloads from the cached URL and, on `403`, re-fetches
  that one page (at most once per page, paced) to get a fresh signature. Downloaded originals
  are cached under `.cache/shopify-images/<row_idx>.<ext>` (sniffed: jpg/png/webp/gif) so a
  rebuild never re-downloads.

## Category mapping

`ground_truth_category` is matched against an **ordered prefix table** (`MAP` in the script).
A prefix matches at a segment boundary (`Home & Garden > Decor` matches
`Home & Garden > Decor > Vases`, not `Home & Garden > Decorative...`); a prefix ending in `*`
is a stem (`... > Home Fragrance*` covers both `Home Fragrances` and
`Home Fragrance Accessories`). The first matching rule wins; `skip` rules come before the
broader rule they carve out of; paths with no rule are dropped.

| Taxonomy prefix (Google product taxonomy, as used in this dataset) | Demo category |
|---|---|
| `Home & Garden > Decor > Home Fragrance*` (Home Fragrances: candles, incense, fragrance oil, potpourri, wax tarts; Home Fragrance Accessories: candle holders, diffusers, incense holders) | Candles & fragrance |
| `Home & Garden > Decor > Candle*` | Candles & fragrance |
| `Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne` | Candles & fragrance |
| `Home & Garden > Decor > {Outdoor*, Bird & Wildlife*, Wind Chimes, Wind Wheels & Spinners, Lawn Ornaments & Garden Sculptures, Garden & Stepping Stones, Fountains & Ponds, Weather Vanes & Roof Decor, Flags & Windsocks, Address Signs, Mailbox*, Rain Chains}` | Garden & outdoor |
| `Home & Garden > Lawn & Garden` (except skips below) | Garden & outdoor |
| `Home & Garden > Plants` | Garden & outdoor |
| `Home & Garden > Decor` (everything else: vases, clocks, frames, wall art, pillows, rugs, figurines, seasonal, window treatments, ...) | Home decor |
| `Home & Garden > Linens & Bedding` (Bedding, Towels) | Home decor |
| `Home & Garden > Linens & Bedding > {Table Linens, Kitchen Linens*}` | Kitchen & tabletop |
| `Home & Garden > Lighting` (lamps, fixtures, night lights, string lights; not bulbs / flood / track / in-ground / emergency / accessories) | Home decor |
| `Home & Garden > Bathroom Accessories > {Bath Mats & Rugs, Shower Curtains}` | Home decor |
| `Home & Garden > Bathroom Accessories` (soap dishes, dispensers, bath pillows, caddies; not `Toilet*`) | Bath & body |
| `Home & Garden > Household Supplies > Storage & Organization > Household Storage Baskets` | Home decor |
| `Home & Garden > Kitchen & Dining` (not `Kitchen Appliance*`, `Prefabricated Kitchens*`) | Kitchen & tabletop |
| `Office Supplies > General Office Supplies > Paper Products > Notebooks & Notepads` | Books & journals |
| `Office Supplies > Book Accessories` (bookends, bookmarks, book covers) | Books & journals |
| `Office Supplies` (pens, paper, desk organizers, cards, stamps, ...; not Office Equipment, Shipping Supplies, Presentation Supplies, chair mats, laminating, binding, printer paper, receipt rolls, ID cards, correction media, card files) | Stationery & paper |
| `Arts & Entertainment > Party & Celebration > Gift Giving > {Greeting & Note Cards, Gift Wrapping}` | Stationery & paper |
| `Arts & Entertainment > Party & Celebration > Party Supplies > Invitations` | Stationery & paper |
| `Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits` | Stationery & paper |
| `... > Arts & Crafts > Art & Crafting Materials > {Art & Craft Paper, Craft Paint, Ink & Glaze}`, `... > Art & Crafting Tools > Art Brushes` | Stationery & paper |
| `Media > Books` (not Audiobooks, E-books) | Books & journals |
| `Apparel & Accessories > Clothing > Baby & Toddler Clothing` | Kids & baby |
| `Apparel & Accessories > Clothing Accessories > Baby & Toddler Clothing Accessories` | Kids & baby |
| `Apparel & Accessories > Clothing` (not Lingerie, Underwear*, Uniforms; Socks kept) | Apparel |
| `Apparel & Accessories > Shoes` | Apparel |
| `Apparel & Accessories > Clothing Accessories` (hats, scarves, gloves, belts, ...; not maternity belts) | Apparel |
| `Apparel & Accessories > Clothing Accessories > {Sunglasses, Hair Accessories}` (not wigs / extensions) | Jewelry & accessories |
| `Apparel & Accessories > Jewelry` | Jewelry & accessories |
| `Apparel & Accessories > Handbags, Wallets & Cases`, `... > Handbag & Wallet Accessories` | Jewelry & accessories |
| `Home & Garden > Parasols & Rain Umbrellas` | Jewelry & accessories |
| `Health & Beauty > Personal Care` (bath & body, skin care, makeup, nail care, hair care products, shaving, deodorant, cotton, tweezers, sleep masks, massage oil, manual toothbrushes) | Bath & body |
| `Health & Beauty > Personal Care > {Back Care, Ear Care, Enema*, Feminine Sanitary Supplies, Vision Care, Personal Lubricants, Foot Care, Massage & Relaxation (massagers), Electric Razors, Hair Clippers & Trimmers, Hair Dryer*, Hair Styling Tools, Hair Loss*, Hair Color*, Hair Permanents*, Oral Care (except manual toothbrushes), Nail Drill*, Manicure & Pedicure*, Facial Saunas, Skin Cleansing Brush*, Sleeping Aids (except masks)}` | skip |
| `Food, Beverages & Tobacco > Food Items` (not Dairy, Fresh & Frozen*, Meat/Seafood/Eggs, Frozen Desserts*, Prepared Foods, Tofu/Soy, Bakery bread/cakes/pies/pastries/muffins) | Food & drink |
| `Food, Beverages & Tobacco > Beverages` (not Alcoholic Beverages, Milk, Buttermilk) | Food & drink |
| `Food, Beverages & Tobacco > Tobacco Products` | skip |
| `Baby & Toddler` (not Baby Health, Baby Safety, Baby Transport*, Potty Training, Breast*, Baby Formula, Diapers, Diaper Pail*, Diaper Liners, Baby Wipes, Diaper Rash*, Baby & Toddler Furniture) | Kids & baby |
| `Toys & Games` (not Outdoor Play Equipment) | Kids & baby |
| `Animals & Pet Supplies` (not Live Animals, Pet Medical*/Medicine*/Vitamins*/Flea*/First Aid*, Fish & Aquatic Supplies, Reptile*, Pet Door*, Pet Containment, Dog Diaper*, Cat Litter*) | Pets |
| `Home & Garden > Lawn & Garden > {Outdoor Power Equipment*, Snow Removal, Watering & Irrigation (except Watering Cans), Outdoor Living > Outdoor Furniture / Outdoor Structures, Gardening > Gardening Tool Accessories / Fertilizers / Mulch / Sand & Soil / Disease Control / Herbicides / Greenhouses / Hydroponics / Composting / Garden Pathway Tiles}` | skip |
| everything else (Furniture, Hardware, Electronics, Sporting Goods, Vehicles, Business & Industrial, Musical Instruments, Collectibles, Health Care, Household Supplies, ...) | dropped (no rule) |

On top of the table, any path containing a parts/utility token (`Parts`, `Replacement`,
`Refills`, `Attachments`, `Lids`, `Stands`, `Blades`, `Filters`, `Tubings`, `Electric`,
`Machines`, `Appliances`, `Cleaning`, `Formula`, `Underwear`, `Whitening`, `Fresh & Frozen`,
`Sterilizers`, `Soil`, `Contractor`, `High Visibility`, `Ultrasonic`, ...) is dropped, as is any
leaf ending in `Accessories` at depth >= 4 ("Rolling Pin Accessories", "Cookware Accessories";
"Hair Accessories"-style nodes stay).

**Keyword overrides** (as in the ABO build, because these two categories are thin in the
taxonomy): a title whose head noun is a candle / tealight / wax melt / diffuser / incense /
room spray / perfume, coming from Home decor, Kitchen, Bath & body, Garden, Stationery, Jewelry
or Apparel, is re-routed to Candles & fragrance (candle *molds*, wicks, kits and holders-for
are not); a title whose head noun is a notebook / journal / planner / diary / sketchbook /
book, coming from Stationery, Home decor or Kitchen, goes to Books & journals (pens *for*
planners, book lights, bookends, covers are not). 11 products in the shipped build.

`subcategory` = the humanised **leaf** of the taxonomy path ("Piggy Banks" -> "Piggy banks",
"Greeting & Note Cards" -> "Greeting cards"); a handful of generic nodes get a fixed label
(`Handbags, Wallets & Cases` -> "Bags", `Parasols & Rain Umbrellas` -> "Umbrellas",
`Decor` -> "Home accents", ...).

## Filters

Rows are kept only if all of these hold:

1. `ground_truth_is_secondhand === false`.
2. The path maps to a category (table above) and is not a parts/utility leaf.
3. Title survives `HARD_SKIP`: the ABO build's list (electrics, batteries/USB/bluetooth,
   phone cases for named models, printers/toner, cleaning/pest, medications, supplements/
   vitamins/capsules, nicotine/vape, automotive, gift cards/digital downloads, samples,
   refurbished, ...) plus the brief's additions: `Amazon`, `Walmart`, `Costco`, `eBay`,
   `AliExpress`, `Temu`, `Shein`, `dropship*`, `Pack of 50+`/`100 pcs`, replacement/spare parts,
   `... only` ("Stand Only"), weapons (gun, rifle, ammo, holster, sword, machete, taser, pepper
   spray, tactical, airsoft), adult items, `pre-order`, `deposit`, `custom order`.
   The brand is checked against the marketplace names too.
4. Title **looks English**: >= 90 % of its letters are ASCII, no foreign function word
   (German/French/Spanish/Italian/Portuguese/Dutch/Swedish/Romanian lists; ambiguous ones like
   `de`, `la`, `le`, `el`, `il`, `per` count only in lower case and `eau de parfum` / `de la mer`
   are exempt), and either it contains a common English product word or it has no diacritics.
   The description (first 600 chars) is tallied too: >= 3 foreign stop words that outnumber
   English ones (or >= 2 when the title has no English word) drops the row.
5. Per-category title filters: perishables for Food & drink (the ABO list), electric devices
   for Bath & body, appliances/disposables for Kitchen, big furniture for Home decor,
   strollers/monitors for Kids, aquarium/flea/electronic for Pets, mowers/fertiliser for
   Garden, underwear/workwear for Apparel, office machines for Stationery.
6. Image present and >= 200 px on the long edge (from the row's width/height), and it
   downloads and converts (>= 3 KB original, >= 2.5 KB output).
7. Cleaned name is 8-70 characters, ASCII, and still has >= 2 meaningful words.
8. Not a duplicate: normalised name (lower-case alphanumerics) and `brand + first 3 words` are
   both unique.

Name cleaning is the ABO `cleanName` (parentheticals, pack counts, dimensions, units, sizes,
SKU-ish tokens, marketing words, ALL CAPS, 70-char word-boundary truncation) with the brand
stripped from the start / `by Brand` / trailing `| Brand`, `™®©` removed and en/em dashes
normalised. Brands are trimmed, title-cased if ALL CAPS, and replaced by `—` when empty,
placeholder (`N/A`, `Universal`, `Printify`, `TBA`, ...), numeric/SKU-like or > 40 chars
(some Shopify stores put location lists in the vendor field).

## Selection

Per category, candidates are bucketed by full taxonomy path, buckets and bucket order are
seeded-shuffled, and products are picked **round-robin across leaves** up to
`cap x 1.2` (over-selection absorbs image failures), then the first `cap` with a good image
are kept. Because this dataset is spread thinly over thousands of leaves (typically 1-4 rows
per leaf), the result is very diverse: 100 Kitchen products come from ~100 different leaves.

## Images

Same pipeline as the ABO build: macOS `sips`, JPEG, max 512 px on the long edge, quality
78 -> 40 stepped until <= 48 KB. Originals arrive as JPEG/PNG/WebP (sniffed by magic bytes);
the output folder is cleared first so image count == product count.

## Shipped build

`node scripts/build-shopify-catalog.mjs --cached-only` on 2026-09-02, cap 100, with the first
**162 of 387 pages (16,200 of 38,631 rows)** in the cache. The page fetch was time-boxed
because of the rows-API rate limit (see above); a plain `node scripts/build-shopify-catalog.mjs`
resumes from the cache, fetches the remaining 225 pages and rebuilds with ~2.4x larger pools,
which is what the three thin categories below need.

| Category | Products | Candidate pool | Leaves in pool |
|----------|---------:|---------------:|---------------:|
| Home decor | 100 | 175 | 100 |
| Kitchen & tabletop | 100 | 387 | 250 |
| Candles & fragrance | 20 | 20 | 15 |
| Stationery & paper | 100 | 194 | 128 |
| Books & journals | 15 | 15 | 12 |
| Apparel | 100 | 275 | 173 |
| Jewelry & accessories | 73 | 73 | 47 |
| Bath & body | 100 | 178 | 120 |
| Food & drink | 100 | 151 | 105 |
| Kids & baby | 100 | 402 | 265 |
| Pets | 100 | 256 | 166 |
| Garden & outdoor | 100 | 152 | 103 |
| **Total** | **1,008** | 2,278 | |

- Rows scanned: 16,200. Dropped: 125 secondhand, 10,381 unmapped taxonomy (Hardware,
  Sporting Goods, Vehicles, Electronics, Musical Instruments, ...), 2,294 skipped by an explicit
  rule, 204 hard-skip, 633 non-English, 145 category filter, 6 tiny image, 113 bad name,
  21 duplicates. 11 keyword overrides applied.
- Images: 1,008 files in `public/catalog-shopify/`, 33.8 MB total, average 34 KB, max 143 KB
  (a few dense photos do not reach 48 KB at quality 40; the ABO build has the same tail),
  512 px on the long edge. Exactly one image per product and vice versa.
- 1 image failure among 1,191 attempted (a 0-byte original), absorbed by over-selection.
- 152 bestsellers (15 %), 250 new-brand items (25 %), 926 distinct brands, 51 products with
  brand `—`.
- Build time: 21 s from cache (the image originals were already cached from the previous
  run; the first image pass over 1,191 rows took ~40 s). Page fetching, done separately, ran
  at ~20-25 pages/minute under the rate limit.
- 18 images were spot-checked by eye, at least one per category (`shp-0001`, `0050`, `0101`,
  `0150`, `0201`, `0215`, `0224`, `0300`, `0324`, `0339`, `0400`, `0439`, `0512`, `0612`, `0712`,
  `0812`, `0912`, `1000` of the previous, near-identical build): all genuine product photos
  (packshots on white and lifestyle shots; two carry seller marketing overlays), none were
  logos, text-only images or size charts, so none were excluded.

## Schema

Same as `catalog.json` / `catalog-public.json` with these provenance fields:

```jsonc
{
  "id": "shp-0001",
  "name": "Cute LED Ghost Night Light Children's Nightlight Gift Bedsid",
  "brand": "Novara Shop",                 // ground_truth_brand, normalised; "—" if empty / placeholder
  "category": "Home decor",
  "subcategory": "Night lights & ambient lighting",   // humanised taxonomy leaf
  "wholesalePrice": 71, "msrp": 142,      // SYNTHETIC (same generator as the ABO build)
  "priceSynthetic": true,
  "minOrder": 250,                        // synthetic, constant per brand
  "rating": 5, "reviewCount": 95,         // SYNTHETIC
  "ratingSynthetic": true,
  "styles": [],                           // left empty; the app derives styles from image embeddings
  "materials": [],                        // from title + description, 24-word list (ABO); e.g. ["ceramic", "wood"]
  "colors": [],                           // from the brand-stripped title; none for food / bath & body
  "priceTier": "premium",                 // msrp tertiles within category
  "isBestseller": false,                  // top ~15 % overall by rating * ln(reviews + 1)
  "isNewBrand": false,                    // brand-level, ~25 % of brands (like catalog.json)
  "leadTimeDays": 10,                     // synthetic, 3-14
  "madeIn": "Unknown",                    // the dataset has no origin field
  "image": "/catalog-shopify/shp-0001.jpg",
  "source": "Shopify/product-catalogue",
  "sourceId": 146,                        // row index in the train split (number)
  "sourceCategory": "Home & Garden > Lighting > Night Lights & Ambient Lighting"   // ground_truth_category
}
```

`sourceId` is the dataset row index; `.cache/shopify-rows/rows-<offset>.json` (offset =
`floor(sourceId / 100) * 100`) holds the original title, description, brand and image
dimensions for that row.

### Synthetic fields

The dataset has **no prices, ratings, review counts, minimums or lead times**. They are
synthesised exactly as in `README-public.md` (category base price x subcategory multiplier x
log-normal jitter; rating 4.2-5.0; log-uniform reviews 3-1500; bestseller = top 15 %), keyed
on the row index, and flagged `priceSynthetic` / `ratingSynthetic`. Two differences from the
ABO build: `minOrder` and `isNewBrand` are **brand-level** here (the brand set is large enough
that a per-brand 25 % flag lands near 25 % of items, as in `catalog.json`); products with brand
`—` get a per-item flag.

## Caveats

- **Partial scan.** Only rows 0-16,199 were scanned (rate-limited page fetch); Candles &
  fragrance (20), Books & journals (15) and Jewelry & accessories (73) are pool-limited, not
  cap-limited. Re-running without `--cached-only` fetches the rest and should roughly double
  those three.
- **Taxonomy leaves are literal.** `subcategory` is whatever leaf the dataset assigned, so it is
  fine-grained and occasionally odd ("Racquet sport toys", "Mailbox covers", "Astringents").
  Subcategory-based price multipliers therefore hit less often than in the ABO build and most
  items get the category base price.
- **Merchant quality varies.** Titles and descriptions are seller-written; some are keyword
  soup, some are dropship-style listings, a few luxury-resale listings are labelled
  first-hand. The English check is heuristic and a handful of non-English titles without
  diacritics or stop words can slip through (e.g. single-word Italian/Spanish product names).
- **Images are seller photos**, not catalog packshots: lifestyle shots, packaging, collages,
  occasional marketing text overlays. Aspect ratios vary. Two originals were GIF/WebP.
- **Brands** are raw Shopify vendor strings: mostly real makers, but also retailer names,
  store-location lists (replaced by `—`) and a few marketplaces.
- `madeIn` is always `Unknown`; `styles` is empty.
- `.cache/shopify-rows` (27 MB) and `.cache/shopify-images` (157 MB of originals) are
  gitignored; delete `.cache/shopify-images` to reclaim space (a rebuild re-downloads only
  what it needs).

## Attribution

Product data and images from the `Shopify/product-catalogue` dataset (Shopify), used under
the Apache License 2.0 (<https://www.apache.org/licenses/LICENSE-2.0>). Individual product
titles, descriptions and photos remain the property of the respective merchants. The catalogue
also contains synthetic fields that are not part of the dataset (see above).
