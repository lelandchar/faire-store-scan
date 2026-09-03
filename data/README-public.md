# Public-dataset wholesale catalog (`catalog-public.json`)

`catalog-public.json` + `public/catalog-public/<id>.jpg` is a second, larger catalog for the
Faire-style personalization demo, assembled from a **real, openly licensed product dataset**
rather than hand-authored. It uses the same `Product` schema as `catalog.json`
(`src/lib/types.ts`) plus a few `source*` provenance fields, so the app and the
embedding-based retrieval can consume either file.

Everything here is produced by one reproducible script:

```bash
node scripts/build-public-catalog.mjs            # full build (downloads ~90 MB of metadata + one image per product)
node scripts/build-public-catalog.mjs --dry      # metadata only, no image downloads
node scripts/build-public-catalog.mjs --cap 50   # per-category cap (default 100 = the shipped build; 50 gives a ~575-product catalog in ~40 s)
node scripts/build-public-catalog.mjs --test "<raw title>" "<brand>"   # debug the name cleaner
ABO_CACHE_DIR=/some/dir node scripts/build-public-catalog.mjs          # where shards/originals are cached (default: $TMPDIR/abo-cache)
```

The build is deterministic (seeded RNG, seed `faire-public-catalog-v1`); re-running it with the
same dataset files produces the same products, ids and synthetic values.

## Dataset

**Amazon Berkeley Objects (ABO)**, Amazon.com, 2021 — the 147,702-listing product catalog with
398,212 catalog images.

- Homepage / download index: <https://amazon-berkeley-objects.s3.amazonaws.com/index.html>
- License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
  <https://creativecommons.org/licenses/by/4.0/>
  ("The ABO dataset is released under the CC BY 4.0 license", per the dataset homepage and
  the `LICENSE-CC-BY-4.0.txt` shipped in every ABO archive.)
- Citation:

  > Jasmine Collins, Shubham Goel, Kenan Deng, Achleshwar Luthra, Leon Xu, Erhan Gundogdu,
  > Xi Zhang, Tomas F. Yago Vicente, Thomas Dideriksen, Himanshu Arora, Matthieu Guillaumin,
  > Jitendra Malik. *ABO: Dataset and Benchmarks for Real-World 3D Object Understanding.*
  > CVPR 2022. <https://arxiv.org/abs/2110.06199>

Files actually read by the script (all fetched per-file from the official S3 bucket; the
3 GB `abo-images-original.tar` is never downloaded):

| File | Size | Purpose |
|------|------|---------|
| `listings/metadata/listings_{0..f}.json.gz` (16 shards) | ~87 MB | one JSON listing per line: titles, brand, product_type, color, bullets, keywords, `main_image_id` |
| `images/metadata/images.csv.gz` | 6 MB | `image_id -> path,height,width` |
| `images/original/<path>` | one per selected product | the listing's main image (mostly >= 2000 px) |

### Why ABO (and not the alternatives)

Candidates were evaluated in the order requested:

1. **ABO — chosen.** Clear CC BY 4.0 license, ~123k English-titled listings across 530
   product types, real brand/colour/material fields, and high-resolution product-on-white
   photos. Two Hugging Face mirrors exist and carry the same CC BY 4.0 tag
   (`suvadityamuk/amazon-berkeley-objects`, `hyper3labs/amazon-berkeley-objects`); the
   datasets-server `/rows` API works on them, but the official S3 bucket serves every
   metadata shard and image individually, which is simpler, canonical and needs no parquet
   reader, so the script reads from S3 directly. The HF mirrors are a drop-in fallback
   (`hyper3labs/.../listings` even exposes the same `main_image_url`).
2. **Marqo `amazon-products-eval` / `google-shopping-general-eval`** — rejected: neither
   dataset card declares a license (the HF API reports `license: None`), and the rows only
   carry image + title + query, no brand/category/price.
3. **Other HF product sets** (`Shopify/product-catalogue`, `rajuptvs/ecommerce_products_clip`,
   H&M sets, …) — rejected as either apparel-only, license-less, or lacking images.

## What the script does

1. Streams the 16 listing shards (`zlib` + `readline`, no dependencies).
2. Keeps rows from English-language marketplaces (`US GB CA AU IN SG AE`) with an `en_*`
   title. (Japanese/German/… listings also carry `en_US` titles but they are romanized, e.g.
   "suta-ringusiruba-kuria", so marketplace filtering is essential.)
3. Drops utility / electronics / medical / disposable / non-English rows by keyword
   (`HARD_SKIP`, `NON_EN`) and everything whose ABO `product_type` is not in the whitelist.
4. Maps `product_type` -> one of the 12 demo categories (whitelist of ~230 types), then
   applies title-keyword overrides (pets, kids & baby, candles & fragrance, books & journals,
   garden & outdoor) and per-type filters (e.g. perishable groceries, big furniture, printer
   labels stay, phone cases go).
5. Derives a human `subcategory` (e.g. "Vases", "Loafers", "Spices & herbs") from the type
   or from title keywords.
6. Cleans the title into `name` (<= 70 chars): strips Amazon house-brand prefixes
   ("Amazon Brand - Solimo …"), the brand itself, parentheticals, pack counts, dimensions,
   units, sizes, SKU codes, marketing words; fixes ALL CAPS; truncates on a word boundary.
7. Extracts `materials` (from the 24-word list, using title + bullets + `material` field) and
   simple `colors` (from the `color` field and the brand-stripped title; for food and
   bath/body only the `color` field is used, so "Honey" and "Olive Oil" don't become colours).
8. Deduplicates by `main_image_id` and by a normalised name key (category + first five
   non-colour tokens), which collapses colour/size variants of the same product.
9. Balances: per category, candidates are bucketed by subcategory, each bucket is
   seeded-shuffled, and products are picked round-robin across buckets up to the cap
   (x1.35 over-selection to absorb image failures). This is what keeps "Apparel" from being
   100 % shoes and "Jewelry" from being 100 % rings.
10. Downloads each selected product's original image, converts with macOS `sips` to JPEG,
    max 512 px on the long edge, stepping quality 78 -> 40 until the file is <= 48 KB. Images
    that 404, are < 200 px, or come out suspiciously tiny (blank) are dropped and the
    product with them. The output folder is cleared first so image count == product count.
11. Writes `catalog-public.json` (ids `pub-0001`… in category order), then computes
    `priceTier` tertiles per category and the bestseller flag.

## Shipped build

`node scripts/build-public-catalog.mjs` (cap 100) on 2026-09-02:

| Category | Products | Candidate pool |
|----------|---------:|---------------:|
| Home decor | 100 | 4,354 |
| Kitchen & tabletop | 100 | 518 |
| Candles & fragrance | 85 | 85 |
| Stationery & paper | 100 | 447 |
| Books & journals | 25 | 25 |
| Apparel | 100 | 1,988 |
| Jewelry & accessories | 100 | 1,472 |
| Bath & body | 100 | 564 |
| Food & drink | 100 | 2,560 |
| Kids & baby | 100 | 507 |
| Pets | 100 | 266 |
| Garden & outdoor | 100 | 507 |
| **Total** | **1,110** | |

- Images: 1,110 files in `public/catalog-public/`, 35.2 MB total, average 33 KB, max 70 KB,
  512 px on the long edge. Every product has exactly one image and vice versa.
- 0 image fetch/convert failures among the 1,460 candidates attempted.
- 167 bestsellers (15 %), 279 new-brand items (25 %), 116 distinct brands.
- 15 images were spot-checked by eye across all categories; all were genuine product photos.

## Schema

Same as `catalog.json` (see `data/README.md`) with these additions / differences:

```jsonc
{
  "id": "pub-0001",
  "name": "Mid-Century Modern Stoneware Planter, Dark Green",
  "brand": "Stone & Beam",              // ABO brand field, normalised ("Amazon Brand - Solimo" -> "Solimo"); "—" if missing
  "category": "Garden & outdoor",
  "subcategory": "Planters",
  "wholesalePrice": 25.5, "msrp": 51,   // SYNTHETIC (see below)
  "priceSynthetic": true,
  "minOrder": 100,                      // synthetic, constant per brand
  "rating": 4.7, "reviewCount": 212,    // SYNTHETIC
  "ratingSynthetic": true,
  "styles": [],                         // left empty; the app derives styles from image embeddings
  "materials": ["stoneware", "ceramic"],
  "colors": ["green"],
  "priceTier": "mid",                   // msrp tertiles within category
  "isBestseller": false,                // top ~15 % overall by rating * ln(reviews + 1)
  "isNewBrand": false,                  // ~25 %, per-item seeded random (see caveats)
  "leadTimeDays": 7,                    // synthetic, 3-14
  "madeIn": "Unknown",                  // ABO has no country-of-manufacture field
  "image": "/catalog-public/pub-0001.jpg",
  "source": "amazon-berkeley-objects",
  "sourceId": "B07XYZ1234",             // ABO item_id (an ASIN)
  "sourceUrl": "https://www.amazon.com/dp/B07XYZ1234",   // built from ABO domain_name + item_id
  "sourceImageId": "71abcDEF12L",       // ABO main_image_id
  "sourceProductType": "PLANTER"        // raw ABO product_type, useful for debugging the mapping
}
```

### Synthetic fields

ABO contains **no prices, ratings, review counts, minimums or lead times**. These are
synthesised deterministically from the item id so the demo has something to rank on, and
every product is flagged `priceSynthetic: true` / `ratingSynthetic: true`:

- `msrp`: category base price (e.g. Home decor $42, Food & drink $11) x a subcategory
  multiplier (chairs/rugs high, socks/snacks low; +2.4x for fine-jewellery keywords) x
  log-normal jitter (sigma 0.4), rounded to $0.50 (<$20) or $1. `wholesalePrice = msrp / 2`.
- `rating`: 4.2-5.0, skewed high. `reviewCount`: log-uniform 3-1500, cut to ~15 % for
  new-brand items.
- `isNewBrand`: 25 % per item. It is *not* brand-level here (unlike `catalog.json`) because
  ABO's brand set is a handful of Amazon house brands (AmazonBasics alone is ~30 % of rows);
  a brand-level flag cannot land near 25 %.
- `minOrder`: brand-level, from {50, 75, 100, 150, 200, 250}.

## Caveats

- **Brands are almost all Amazon private labels** (AmazonBasics, Solimo, Rivet, Stone & Beam,
  Strathwood, 365 Everyday Value, Whole Foods Market, find., Amazon Collection, …). Treat
  `brand` as a grouping key, not as marketing copy.
- **Apparel is mostly footwear** (ABO has SHOES/BOOT/SANDAL but almost no shirts or dresses);
  hats, scarves, gloves, socks, belts and ties fill the rest.
- **Books & journals is thin** (ABO has three real books); it is AmazonBasics notebooks,
  journals and bookends.
- **Candles & fragrance** includes air fresheners and essential oils alongside candles,
  because that is what ABO has.
- Some kitchen/stationery items are office-supply flavoured (labels, folders, cookware)
  rather than gift-shop flavoured.
- Images are catalog photos (product on white); a handful are lifestyle shots or packaging.
- `madeIn` is always `Unknown`.

## Attribution

Product data and images © Amazon.com, Inc. or its affiliates, from the Amazon Berkeley
Objects dataset, used under CC BY 4.0. The catalogue also contains synthetic fields that are
not part of ABO (see above).
