#!/usr/bin/env node
/**
 * build-shopify-catalog.mjs
 *
 * Assembles `data/catalog-shopify.json` + `public/catalog-shopify/<id>.jpg` from the
 * Hugging Face dataset `Shopify/product-catalogue` (Apache-2.0, 38,631 train rows).
 *
 * Nothing is downloaded from the 9.5 GB parquet. Rows are paged through the
 * datasets-server rows API (100 rows per request, ~390 requests) and each page is
 * cached under `.cache/shopify-rows/` so re-runs are cheap. Each row's image comes as a
 * signed URL that expires after ~1 hour; the image stage downloads from the cached URL
 * and, if the signature has expired, re-fetches that one page for a fresh URL.
 *
 * Usage:
 *   node scripts/build-shopify-catalog.mjs            # full build
 *   node scripts/build-shopify-catalog.mjs --dry      # fetch/parse only, no image downloads; prints mapping stats
 *   node scripts/build-shopify-catalog.mjs --cap 40   # per-category cap (default 100)
 *   node scripts/build-shopify-catalog.mjs --test "<raw title>" "<brand>"   # debug the name cleaner
 *
 * Env:
 *   HF_TOKEN   optional Hugging Face token (raises the datasets-server rate limit)
 *
 * The cleaning, price/rating synthesis, tiering, dedupe and image normalisation are the
 * same as scripts/build-public-catalog.mjs so the two catalogs are consistent.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_JSON = path.join(ROOT, "data", "catalog-shopify.json");
const OUT_IMG_DIR = path.join(ROOT, "public", "catalog-shopify");
const CACHE_ROWS = path.join(ROOT, ".cache", "shopify-rows");
const CACHE_IMG = path.join(ROOT, ".cache", "shopify-images");
const API = "https://datasets-server.huggingface.co/rows";
const DATASET = "Shopify/product-catalogue";
const DATASET_ID = "Shopify/product-catalogue (Hugging Face), Apache-2.0";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const CAP = Number(args[args.indexOf("--cap") + 1]) || 100; // per-category cap
const OVERSELECT = 1.35; // select extra candidates to absorb image failures
const PAGE = 100;
const FETCH_CONCURRENCY = 5;
const IMG_CONCURRENCY = 6;
const MAX_EDGE = 512;
const TARGET_BYTES = 48 * 1024; // per image; total budget is ~40 MB
const SEED = "faire-shopify-catalog-v1";

const CATEGORIES = [
  "Home decor",
  "Kitchen & tabletop",
  "Candles & fragrance",
  "Stationery & paper",
  "Books & journals",
  "Apparel",
  "Jewelry & accessories",
  "Bath & body",
  "Food & drink",
  "Kids & baby",
  "Pets",
  "Garden & outdoor",
];

// ---------------------------------------------------------------------------
// Seeded RNG helpers (deterministic output for a given SEED) — same as ABO build
// ---------------------------------------------------------------------------

function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (key) => mulberry32(cyrb53(SEED + "|" + key) >>> 0);
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Category mapping: Google product taxonomy path prefix -> demo category.
// Ordered; the first prefix that matches (exact or "prefix > ...") wins.
// `null` = explicit skip (electrics, medical, perishables, big furniture, ...).
// Anything with no matching rule is dropped. The table is reproduced in
// data/README-shopify.md.
// ---------------------------------------------------------------------------

const MAP = [
  // --- Candles & fragrance ---
  ["Home & Garden > Decor > Home Fragrance", "Candles & fragrance"], // Home Fragrances + Home Fragrance Accessories
  ["Home & Garden > Decor > Candles", "Candles & fragrance"],
  ["Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne", "Candles & fragrance"],

  // --- Garden & outdoor (outdoorsy Decor subtrees first, before the generic Decor rule) ---
  ["Home & Garden > Decor > Outdoor", "Garden & outdoor"],
  ["Home & Garden > Decor > Bird & Wildlife", "Garden & outdoor"],
  ["Home & Garden > Decor > Wind Chimes", "Garden & outdoor"],
  ["Home & Garden > Decor > Wind Wheels & Spinners", "Garden & outdoor"],
  ["Home & Garden > Decor > Lawn Ornaments & Garden Sculptures", "Garden & outdoor"],
  ["Home & Garden > Decor > Garden & Stepping Stones", "Garden & outdoor"],
  ["Home & Garden > Decor > Fountains & Ponds", "Garden & outdoor"],
  ["Home & Garden > Decor > Weather Vanes & Roof Decor", "Garden & outdoor"],
  ["Home & Garden > Decor > Flags & Windsocks", "Garden & outdoor"],
  ["Home & Garden > Decor > Address Signs", "Garden & outdoor"],
  ["Home & Garden > Decor > Mailbox", "Garden & outdoor"],
  ["Home & Garden > Decor > Rain Chains", "Garden & outdoor"],
  ["Home & Garden > Lighting > Landscape Pathway Lighting", "Garden & outdoor"],
  ["Home & Garden > Lawn & Garden > Outdoor Power Equipment", null],
  ["Home & Garden > Lawn & Garden > Snow Removal", null],
  ["Home & Garden > Lawn & Garden > Watering & Irrigation > Watering Cans", "Garden & outdoor"],
  ["Home & Garden > Lawn & Garden > Watering & Irrigation", null],
  ["Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Furniture", null],
  ["Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Structures", null],
  ["Home & Garden > Lawn & Garden > Gardening > Fertilizers", null],
  ["Home & Garden > Lawn & Garden > Gardening > Mulch", null],
  ["Home & Garden > Lawn & Garden > Gardening > Sand & Soil", null],
  ["Home & Garden > Lawn & Garden > Gardening > Disease Control", null],
  ["Home & Garden > Lawn & Garden > Gardening > Herbicides", null],
  ["Home & Garden > Lawn & Garden > Gardening > Greenhouses", null],
  ["Home & Garden > Lawn & Garden > Gardening > Hydroponics", null],
  ["Home & Garden > Lawn & Garden > Gardening > Composting", null],
  ["Home & Garden > Lawn & Garden > Gardening > Garden Pathway Tiles", null],
  ["Home & Garden > Lawn & Garden", "Garden & outdoor"],
  ["Home & Garden > Plants", "Garden & outdoor"],

  // --- Home decor ---
  ["Home & Garden > Decor", "Home decor"],
  ["Home & Garden > Linens & Bedding > Table Linens", "Kitchen & tabletop"],
  ["Home & Garden > Linens & Bedding > Kitchen Linens", "Kitchen & tabletop"],
  ["Home & Garden > Linens & Bedding", "Home decor"],
  ["Home & Garden > Lighting > Light Bulbs", null],
  ["Home & Garden > Lighting > Emergency Lighting", null],
  ["Home & Garden > Lighting > Flood & Spot Lights", null],
  ["Home & Garden > Lighting > In-Ground Lights", null],
  ["Home & Garden > Lighting > Track Lighting", null],
  ["Home & Garden > Lighting > Lighting Accessories", null],
  ["Home & Garden > Lighting", "Home decor"],
  ["Home & Garden > Bathroom Accessories > Bath Mats & Rugs", "Home decor"],
  ["Home & Garden > Bathroom Accessories > Shower Curtains", "Home decor"],
  ["Home & Garden > Bathroom Accessories > Toilet", null],
  ["Home & Garden > Bathroom Accessories", "Bath & body"],
  ["Home & Garden > Household Supplies > Storage & Organization > Household Storage Baskets", "Home decor"],

  // --- Kitchen & tabletop ---
  ["Home & Garden > Kitchen & Dining > Kitchen Appliance", null], // Kitchen Appliances + Kitchen Appliance Accessories
  ["Home & Garden > Kitchen & Dining", "Kitchen & tabletop"],

  // --- Stationery & paper / Books & journals ---
  ["Office Supplies > General Office Supplies > Paper Products > Notebooks & Notepads", "Books & journals"],
  ["Office Supplies > Book Accessories", "Books & journals"],
  ["Office Supplies > Office Equipment", null],
  ["Office Supplies > Shipping Supplies", null],
  ["Office Supplies > Office & Chair Mats", null],
  ["Office Supplies > Impulse Sealers", null],
  ["Office Supplies > Office Carts", null],
  ["Office Supplies > Presentation Supplies", null],
  ["Office Supplies > General Office Supplies > Laminating", null],
  ["Office Supplies > General Office Supplies > Binding Supplies", null],
  ["Office Supplies > General Office Supplies > Paper Products > Printer & Copier Paper", null],
  ["Office Supplies", "Stationery & paper"],
  ["Arts & Entertainment > Party & Celebration > Gift Giving > Greeting & Note Cards", "Stationery & paper"],
  ["Arts & Entertainment > Party & Celebration > Gift Giving > Gift Wrapping", "Stationery & paper"],
  ["Arts & Entertainment > Party & Celebration > Party Supplies > Invitations", "Stationery & paper"],
  ["Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits", "Stationery & paper"],
  ["Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Art & Craft Paper", "Stationery & paper"],
  ["Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Craft Paint, Ink & Glaze", "Stationery & paper"],
  ["Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Tools > Art Brushes", "Stationery & paper"],
  ["Media > Books", "Books & journals"],

  // --- Apparel / Jewelry & accessories ---
  ["Apparel & Accessories > Clothing > Baby & Toddler Clothing", "Kids & baby"],
  ["Apparel & Accessories > Clothing > Underwear & Socks > Socks", "Apparel"],
  ["Apparel & Accessories > Clothing > Underwear & Socks > Hosiery", "Apparel"],
  ["Apparel & Accessories > Clothing > Underwear & Socks", null],
  ["Apparel & Accessories > Clothing > Uniforms", null],
  ["Apparel & Accessories > Clothing", "Apparel"],
  ["Apparel & Accessories > Shoes", "Apparel"],
  ["Apparel & Accessories > Clothing Accessories > Baby & Toddler Clothing Accessories", "Kids & baby"],
  ["Apparel & Accessories > Clothing Accessories > Sunglasses", "Jewelry & accessories"],
  ["Apparel & Accessories > Clothing Accessories > Hair Accessories", "Jewelry & accessories"],
  ["Apparel & Accessories > Clothing Accessories > Maternity Belts", null],
  ["Apparel & Accessories > Clothing Accessories", "Apparel"],
  ["Apparel & Accessories > Jewelry", "Jewelry & accessories"],
  ["Apparel & Accessories > Handbags, Wallets & Cases", "Jewelry & accessories"],
  ["Apparel & Accessories > Handbag & Wallet Accessories", "Jewelry & accessories"],
  ["Home & Garden > Parasols & Rain Umbrellas", "Jewelry & accessories"],

  // --- Bath & body ---
  ["Health & Beauty > Personal Care > Back Care", null],
  ["Health & Beauty > Personal Care > Ear Care", null],
  ["Health & Beauty > Personal Care > Enema", null],
  ["Health & Beauty > Personal Care > Feminine Sanitary Supplies", null],
  ["Health & Beauty > Personal Care > Vision Care", null],
  ["Health & Beauty > Personal Care > Personal Lubricants", null],
  ["Health & Beauty > Personal Care > Foot Care", null],
  ["Health & Beauty > Personal Care > Massage & Relaxation > Massage Oil", "Bath & body"],
  ["Health & Beauty > Personal Care > Massage & Relaxation > Massage Stone", "Bath & body"],
  ["Health & Beauty > Personal Care > Massage & Relaxation", null],
  ["Health & Beauty > Personal Care > Shaving & Grooming > Electric Razors", null],
  ["Health & Beauty > Personal Care > Shaving & Grooming > Hair Clippers & Trimmers", null],
  ["Health & Beauty > Personal Care > Hair Care > Hair Dryer", null],
  ["Health & Beauty > Personal Care > Hair Care > Hair Styling Tools", null],
  ["Health & Beauty > Personal Care > Hair Care > Hair Styling Tool Accessories", null],
  ["Health & Beauty > Personal Care > Oral Care > Dental Water Jets", null],
  ["Health & Beauty > Personal Care > Oral Care > Power Flossers", null],
  ["Health & Beauty > Personal Care > Oral Care > Toothbrush Accessories", null],
  ["Health & Beauty > Personal Care > Oral Care > Orthodontic", null],
  ["Health & Beauty > Personal Care > Cosmetics > Cosmetic Tools > Skin Care Tools > Facial Saunas", null],
  ["Health & Beauty > Personal Care > Cosmetics > Cosmetic Tools > Skin Care Tools > Skin Cleansing Brush", null],
  ["Health & Beauty > Personal Care > Sleeping Aids > Sleep Masks", "Bath & body"],
  ["Health & Beauty > Personal Care > Sleeping Aids", null],
  ["Health & Beauty > Personal Care", "Bath & body"],

  // --- Food & drink ---
  ["Food, Beverages & Tobacco > Tobacco Products", null],
  ["Food, Beverages & Tobacco > Beverages > Alcoholic Beverages", null],
  ["Food, Beverages & Tobacco > Beverages > Milk", null],
  ["Food, Beverages & Tobacco > Beverages > Buttermilk", null],
  ["Food, Beverages & Tobacco > Beverages", "Food & drink"],
  ["Food, Beverages & Tobacco > Food Items > Dairy Products", null],
  ["Food, Beverages & Tobacco > Food Items > Fresh & Frozen", null],
  ["Food, Beverages & Tobacco > Food Items > Meat, Seafood & Eggs", null],
  ["Food, Beverages & Tobacco > Food Items > Frozen Desserts", null],
  ["Food, Beverages & Tobacco > Food Items > Prepared Foods", null],
  ["Food, Beverages & Tobacco > Food Items > Tofu, Soy & Vegetarian Products", null],
  ["Food, Beverages & Tobacco > Food Items > Bakery > Bread", null],
  ["Food, Beverages & Tobacco > Food Items > Bakery > Cakes", null],
  ["Food, Beverages & Tobacco > Food Items > Bakery > Pies", null],
  ["Food, Beverages & Tobacco > Food Items > Bakery > Pastries", null],
  ["Food, Beverages & Tobacco > Food Items > Bakery > Muffins", null],
  ["Food, Beverages & Tobacco > Food Items", "Food & drink"],

  // --- Kids & baby ---
  ["Baby & Toddler > Baby Health", null],
  ["Baby & Toddler > Baby Safety", null],
  ["Baby & Toddler > Baby Transport", null],
  ["Baby & Toddler > Potty Training", null],
  ["Baby & Toddler > Nursing & Feeding > Breast", null],
  ["Baby & Toddler > Baby & Toddler Furniture", null],
  ["Baby & Toddler", "Kids & baby"],
  ["Toys & Games > Outdoor Play Equipment", null],
  ["Toys & Games", "Kids & baby"],

  // --- Pets ---
  ["Animals & Pet Supplies > Live Animals", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet Medical", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet Medicine", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet Vitamins", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet Flea", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet First Aid", null],
  ["Animals & Pet Supplies > Pet Supplies > Fish Supplies", null],
  ["Animals & Pet Supplies > Pet Supplies > Reptile", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet Door", null],
  ["Animals & Pet Supplies > Pet Supplies > Pet Containment", null],
  ["Animals & Pet Supplies", "Pets"],
];

// Cheap prefix index: first path segment -> rules, preserving order.
function mapCategory(pathStr) {
  for (const [prefix, cat] of MAP) {
    if (pathStr === prefix || pathStr.startsWith(prefix)) {
      // `startsWith` alone would let "Home & Garden > Decor > Candlesticks" match "... > Candles";
      // require the match to end at a segment boundary unless the rule is deliberately a stem.
      const rest = pathStr.slice(prefix.length);
      if (rest === "" || rest.startsWith(" > ") || /^[a-z ,&-]*( > |$)/i.test(rest) === true) return cat;
    }
  }
  return undefined;
}

// Subcategory fallbacks for paths whose leaf is the generic node itself.
const FALLBACK_SUB = {
  "Home decor": "Home accents",
  "Kitchen & tabletop": "Kitchen tools",
  "Candles & fragrance": "Home fragrance",
  "Stationery & paper": "Desk accessories",
  "Books & journals": "Notebooks",
  Apparel: "Accessories",
  "Jewelry & accessories": "Jewelry",
  "Bath & body": "Personal care",
  "Food & drink": "Pantry",
  "Kids & baby": "Baby care",
  Pets: "Pet supplies",
  "Garden & outdoor": "Outdoor living",
};
const GENERIC_LEAVES = new Set(["Decor", "Clothing", "Shoes", "Jewelry", "Personal Care", "Cosmetics", "Food Items", "Beverages", "Toys", "Games", "Pet Supplies", "Lawn & Garden", "Gardening", "Kitchen & Dining", "Books", "Office Supplies", "General Office Supplies", "Paper Products", "Baby & Toddler", "Clothing Accessories", "Outdoor Living", "Lighting", "Linens & Bedding", "Bedding", "Plants", "Bathroom Accessories", "Home Fragrances", "Home Fragrance Accessories"]);

/** "Piggy Banks & Money Jars" -> "Piggy banks & money jars"; keeps acronyms ("BBQ", "LED"). */
function humanizeLeaf(leaf) {
  const words = leaf.trim().split(/\s+/);
  return words
    .map((w, i) => {
      if (/^[A-Z0-9&-]{2,5}$/.test(w) && /[A-Z]/.test(w)) return w; // acronym
      const lower = w.toLowerCase();
      if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join(" ");
}

function subcategoryFor(category, pathStr) {
  const parts = pathStr.split(" > ").map((s) => s.trim());
  let leaf = parts[parts.length - 1];
  if (GENERIC_LEAVES.has(leaf) || parts.length <= 2) {
    // Special-case a few generic leaves that still say something.
    if (leaf === "Home Fragrances") return "Home fragrance";
    if (leaf === "Bedding") return "Bedding";
    if (leaf === "Plants") return "Plants";
    if (leaf === "Books") return "Books";
    if (leaf === "Lighting") return "Lighting";
    return FALLBACK_SUB[category];
  }
  return humanizeLeaf(leaf);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

// Utility / electronics / medical / big-box / weapons / adult — dropped regardless of category.
// Superset of the ABO build's HARD_SKIP plus the Shopify-specific additions from the brief.
const HARD_SKIP = /\b(replacement|refill cartridge|spare parts?|battery|batteries|charger|usb|hdmi|bluetooth|wifi|wi-fi|electric|electrical|cordless|corded|voltage|watt|led bulb|light bulb|bulbs?|power strip|extension cord|surge|socket|plug|phone case|iphone|ipad|galaxy|pixel \d|xiaomi|redmi|oneplus|samsung|huawei|airpods?|macbook|mobile cover|back cover|screen protector|laptop|tablet|kindle|printer|toner|ink cartridge|adapter|cable|mount|bracket|hardware|screw|bolt|hinge|drawer slide|ladder|toilet|plunger|urinal|trash bag|garbage bag|detergent|bleach|disinfect|sanitizer|cleaner|cleaning|mop|broom|dustpan|vacuum|pest|insect|rodent|mouse trap|medic\w*|pharma\w*|tablets?|capsules?|softgels?|supplements?|vitamins?|probiotics?|prescription|melatonin|creatine|protein powder|pre-?workout|collagen peptides|condoms?|lubricant|pregnancy test|thermometer|blood pressure|glucose|nicotine|cigarette|cigar|vape|e-?liquid|hookah|bong|cannabis|cbd|thc|marijuana|knife sharpener|lawn mower|chainsaw|generator|automotive|car seat cover|steering|tire|wiper|engine|motor oil|3d printer|filament|subscription|gift card|e-gift|digital (code|download|product|file)|download|printable|swatch|sample|renewed|refurbished|strip lights?|rope lights?|work lights?|flood lights?|led strip|thermoelectric|12v|ac\/ ?dc|amazon|walmart|costco|ebay|aliexpress|temu|shein|wish\.com|dropship\w*|pack of (\d{3,}|[5-9]\d)|(\d{3,}|[5-9]\d)[- ]?(pack|pcs|pieces|count|ct)|wholesale lot|guns?|rifle|pistol|firearm|ammo|ammunition|holster|swords?|machete|crossbow|taser|stun gun|pepper spray|brass knuckles|knuckles|tactical|airsoft|sex|sexy|dildo|vibrator|erotic|adult toys?|bondage|fetish|lingerie|g-string|pre-?order|preorder|deposit|custom order|reserved for|do not buy|test product|placeholder)\b/i;

// Non-English function words (German, French, Spanish, Italian, Swedish/Danish/Norwegian, Dutch, Portuguese).
const NON_EN = /\b(mit|und|für|fuer|teilig|aus|oder|nicht|sind|der|das|avec|pour|les|des|une|sont|dans|votre|vous|cette|para|con|del|una|por|las|los|está|este|esta|della|dello|degli|pezzi|sono|questo|och|för|med|till|från|som|het|een|voor|niet|ook|zijn|deze|não|você|juego|conjunto|ensemble|stück|stuck|größe|grösse|farbe|schwarz|weiß|weiss|noir|blanc|rouge|bleu|vert|negro|blanco|rojo|azul|nero|bianco|rosso|svart|vit|blå|grön)\b/i;
const NON_EN_G = new RegExp(NON_EN.source, "gi");
const EN_STOP_G = /\b(the|and|with|for|of|in|is|are|this|that|your|our|from|made|to|on|by|it|you|or|at|as|be|has|have|will|can|all|each|every|perfect|beautiful|design|designed|quality|handmade|gift|available|features?|includes?|comes?|size|color|colour)\b/gi;
const COMMON_EN = /\b(the|and|with|for|of|in|set|gift|handmade|made|from|by|to|on|your|our|kit|box|bag|cup|mug|candle|soap|cards?|book|print|art|tee|shirt|dress|hat|toy|dog|cat|baby|kids|home|wall|table|kitchen|garden|natural|organic|small|large|mini|new|classic|vintage|wood|wooden|cotton|glass|ceramic|leather|gold|silver|black|white|blue|green|pink|red|grey|gray|brown|hand|face|body|hair|bath|tea|coffee|chocolate|honey|jam|cookies?|candy|salt|spice|oil|pet|puppy|kitten|bird|plants?|planter|pot|vase|pillow|blanket|throw|towel|earrings?|necklace|bracelet|ring|watch|wallet|tote|pen|pencil|notebook|journal|planner|stickers?|stationery|paper|wrap|wrapping|greeting|birthday|christmas|holiday|halloween|easter|valentine|wedding|women|womens|women's|men|mens|men's|boys|girls|kid|child|toddler|infant|newborn|pack|pair|piece|sets?|bowl|plate|jar|bottle|light|lamp|frame|clock|mirror|basket|tray|holder|stand|mat|rug|sign|ornament|decor|scent|scented|fragrance|diffuser|lotion|cream|balm|scrub|wash|shampoo|mask|serum|socks|scarf|gloves|beanie|cap|sweater|hoodie|jacket|pants|shorts|skirt|top|boots|sandals|sneakers|shoes|bib|onesie|romper|plush|puzzle|game|blocks|doll|treats?|collar|leash|bed|seeds?|tool|tools)\b/i;

const RX = {
  feetInches: /\b\d+(\.\d+)?\s*['′]\s*(\d+(\.\d+)?\s*["”″])?(\s*[x×]\s*\d+(\.\d+)?\s*['′]\s*(\d+(\.\d+)?\s*["”″])?)?/g,
  perishable: /\b(cream|milk|cheese|yogurt|yoghurt|butter(?!\s*(cookie|cracker|toffee|pecan|cake mix))|eggs?|chicken|beef|pork|turkey|salmon|tuna|fish|shrimp|steak|sausage|bacon|ham|deli|frozen|ice cream|fresh|salad|sandwich|sushi|tofu|hummus|dip|smoothie|kombucha|bread|bagels?|muffins?|cakes?|pies?|pastry|dough|tortillas?|lettuce|spinach|kale|carrots?|onions?|potato(es)?|tomato(es)?|peppers?|broccoli|celery|cucumber|melon|mango|pineapple|lemons?|limes?|oranges?|apples?|bananas?|grapes|berries|strawberr\w+|blueberr\w+|avocado|guacamole|wraps?|burrito|pizza|lasagna|meal|entree|dinner|lunch|bowl|juice|sparkling water|soda|water|pt\b|quart|gallon|half gallon|lb\b|pound)\b/i,
  dims: /\b\d+(\.\d+)?\s*(cm|mm|in|inch|inches|ft|feet|['"”″′]|-inch|-in)?[\s-]*(x|×|by)[\s-]*\d+(\.\d+)?\s*(cm|mm|in|inch|inches|ft|feet|['"”″′]|-inch|-in)?([\s-]*(x|×|by)[\s-]*\d+(\.\d+)?\s*(cm|mm|in|inch|inches|ft|feet|['"”″′]|-inch|-in)?)?(?![A-Za-z0-9])/gi,
  units: /\b\d+(\.\d+)?(\s*(-|–|to)\s*\d+(\.\d+)?)?\s*[-–]?\s*(fl\.?\s*oz|fluid\s*ounces?|fz|oz|ounces?|lbs?|pounds?|ml|l|liters?|litres?|g|gr|grams?|kg|mg|mm|cm|m|meters?|metres?|yds?|yards?|inch|inches|in(?!\s*[-–]?\s*\d)|ft|feet|foot|pt|qt|quarts?|gal|gallons?|w|watts?|v|volts?|mah|gsm|tc|thread count|count|ct|pcs?|pieces?(?=\s*(pack|set|$))|pairs?|sheets?|pages?|labels?|units?|packets?|pulls?|rolls?|tabs?)\b\.?/gi,
};

// Per-category title filters (on top of the taxonomy rules).
const CAT_SKIP = {
  "Food & drink": (t) => RX.perishable.test(t) || /\b(crescent|refrigerated|ready to bake|pie crust|pizza crust|catering|party tray|platter)\b/i.test(t),
  "Bath & body": (t) => /\b(device|dryer|straightener|curler|curling|trimmer|epilator|clipper|massager|machine|laser|microcurrent|ipl)\b/i.test(t),
  "Kitchen & tabletop": (t) => /\b(blender|toaster|microwave|air fryer|pressure cooker|coffee maker|espresso machine|machine|appliance|mixer|processor|juicer|dishwasher|refrigerator|freezer|stove|oven|induction|disposable|compostable|biodegradable|take ?away|takeout|paper (plates?|cups?|napkins?)|foam|styrofoam|\d-ply|catering|commercial)\b/i.test(t),
  "Home decor": (t) => /\b(mattress|box spring|bed frame|headboard|sofa|sectional|loveseat|dresser|wardrobe|armoire|cabinet|tv stand|bunk|futon|recliner|heater|fan|curtain rods?|shower rods?|tension rods?)\b/i.test(t) && !/\bmattress (pad|protector|topper)\b/i.test(t),
  "Kids & baby": (t) => /\b(monitor|breast pump|sterilizer|car seat|stroller|gate|humidifier|trampoline|playhouse|swing set)\b/i.test(t),
  Pets: (t) => /\b(flea|tick|dewormer|medication|litter box|aquarium|filter|pump|heater|automatic|gps|tracker|clipper|trimmer)\b/i.test(t),
  "Garden & outdoor": (t) => /\b(mower|trimmer|blower|pressure washer|hose reel|propane|heater|pesticide|herbicide|weed killer|fertilizer|spreader|greenhouse|shed|gazebo|pergola)\b/i.test(t),
  Apparel: (t) => /\b(bra|bras|panties|briefs|boxers|underwear|thong|bodysuit lingerie|shapewear|jockstrap|uniform|scrubs)\b/i.test(t),
  "Stationery & paper": (t) => /\b(shredder|laminator|calculator|label maker|shipping|mailer|bubble|packing|toner|ink cartridge)\b/i.test(t),
};

// ---------------------------------------------------------------------------
// Text helpers (same as the ABO build, minus the Amazon house-brand handling)
// ---------------------------------------------------------------------------

const COLOR_WORDS = [
  ["black"], ["white"], ["off-white", "off white"], ["ivory"], ["cream"], ["beige"], ["tan"], ["sand"], ["taupe"],
  ["khaki"], ["brown"], ["walnut"], ["oak"], ["natural"], ["grey", "gray"], ["charcoal"], ["silver"],
  ["rose gold"], ["gold", "golden"], ["copper"], ["bronze"], ["navy"], ["blue"], ["teal"], ["turquoise"], ["aqua"],
  ["sage"], ["olive"], ["mint"], ["green"], ["yellow"], ["mustard"], ["orange"], ["rust"], ["terracotta", "terra cotta"],
  ["coral"], ["burgundy"], ["maroon"], ["red"], ["blush"], ["pink"], ["lavender"], ["lilac"], ["purple"], ["plum"],
  ["multicolor", "multicolour", "multi-color", "multi"], ["clear", "transparent"], ["amber"], ["indigo"], ["espresso"],
  ["honey"], ["mocha"], ["camel"], ["nude"], ["cobalt"], ["emerald"], ["peach"], ["chocolate"],
];
const COLOR_CANON = COLOR_WORDS.map((w) => w[0]);
const COLOR_ALIASES = new Set(COLOR_WORDS.flat());

const MATERIALS = [
  ["stoneware", /\bstoneware\b/i],
  ["ceramic", /\bceramics?\b/i],
  ["porcelain", /\bporcelain\b/i],
  ["glass", /\bglass(ware)?\b/i],
  ["linen", /\blinen\b/i],
  ["cotton", /\bcotton\b/i],
  ["wool", /\bwool(len)?\b|\bmerino\b|\bcashmere\b/i],
  ["wood", /\bwood(en)?\b|\bwalnut\b|\boak\b|\bacacia\b|\bteak\b|\bmango wood\b|\bpine\b|\bbirch\b/i],
  ["bamboo", /\bbamboo\b/i],
  ["brass", /\bbrass\b/i],
  ["gold", /\bgold\b|\b\d{1,2}k\b/i],
  ["silver", /\bsilver\b|\bsterling\b/i],
  ["paper", /\bpaper\b|\bcardstock\b|\bkraft\b/i],
  ["soy-wax", /\bsoy\s*wax\b/i],
  ["leather", /\bleather\b|\bsuede\b/i],
  ["rattan", /\brattan\b|\bwicker\b|\bseagrass\b/i],
  ["stainless-steel", /\bstainless(-|\s)?steel\b/i],
  ["marble", /\bmarble\b/i],
  ["concrete", /\bconcrete\b|\bcement\b/i],
  ["silicone", /\bsilicone\b/i],
  ["plastic", /\bplastic\b|\bacrylic\b|\bpolypropylene\b|\bpvc\b/i],
  ["resin", /\bresin\b/i],
  ["felt", /\bfelt\b/i],
  ["jute", /\bjute\b|\bsisal\b|\bhemp\b/i],
];

const ACRONYMS = new Set(["USA", "UK", "US", "EU", "LED", "USB", "BPA", "UV", "SPF", "BBQ", "XL", "XXL", "XS", "DIY", "OEKO", "TEX", "GOTS", "FSC", "PU", "PVC", "BCAA", "MCT", "K", "NYC", "LA", "SF", "CA", "NY", "DC", "OG", "II", "III", "IV"]);
const SIZE_WORDS = new Set(["small", "medium", "large", "x-large", "xx-large", "xl", "xxl", "xs", "regular", "wide", "narrow", "youth", "adult", "unisex"]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function titleCaseWord(w) {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function normalizeText(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[™®©℠]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBrand(raw) {
  let b = normalizeText(raw);
  b = b.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  b = b.replace(/^(brand|by|from)\s*:\s*/i, "");
  b = b.replace(/\s+(inc\.?|llc\.?|ltd\.?|co\.?|corp\.?|gmbh)$/i, "");
  const letters = b.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5 && letters === letters.toUpperCase()) b = b.split(" ").map(titleCaseWord).join(" ");
  if (!/^[\x20-\x7e]+$/.test(b)) b = b.replace(/[^\x20-\x7e]+/g, "").replace(/\s+/g, " ").trim();
  if (/^(n\/a|na|none|null|unknown|no brand|generic|-+|—)$/i.test(b)) b = "";
  return b.trim() || "—";
}

function fixCaps(s) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length > 10) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.8) {
      return s
        .split(/(\s+|-|\/)/)
        .map((w) => (ACRONYMS.has(w) ? w : /^[A-Z]{2,}$/.test(w) ? titleCaseWord(w) : w))
        .join("");
    }
  }
  return s
    .split(/(\s+)/)
    .map((w) => {
      const core = w.replace(/[^A-Za-z]/g, "");
      if (core.length >= 4 && /^[A-Z]+$/.test(core) && !ACRONYMS.has(core)) {
        return w.replace(core, titleCaseWord(core));
      }
      return w;
    })
    .join("");
}

function truncateWords(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, max + 1);
  const i = cut.lastIndexOf(" ");
  if (i > max * 0.5) cut = cut.slice(0, i);
  else cut = s.slice(0, max);
  cut = cut.replace(/[\s,;:\-–—&|/]+$/g, "");
  cut = cut.replace(/\s+(and|with|for|of|in|the|a|an|or|to|by|on|at|from|&)$/i, "");
  return cut;
}

/** Title with the brand removed from the start / " by Brand" / " | Brand" / " - Brand" positions. */
function stripBrand(raw, brand) {
  let s = normalizeText(raw);
  s = s.replace(/^\s*(\[[^\]]*\]|\([^)]*\))\s*/g, "");
  if (brand && brand !== "—") {
    const b = escapeRegex(brand.replace(/[.!]+$/, ""));
    for (let i = 0; i < 2; i++) {
      s = s.replace(new RegExp(`^\\s*${b}\\b[.!]?\\s*[-–—:|,]?\\s*`, "i"), "");
      s = s.replace(new RegExp(`\\s+by\\s+${b}\\b[.!]?`, "i"), "");
      s = s.replace(new RegExp(`\\s*[-–—|:,]\\s*${b}\\b[.!]?\\s*$`, "i"), "");
      // brand mentioned mid-title: drop it unless the brand is a short/common word
      if (brand.length >= 5) s = s.replace(new RegExp(`(^|[\\s,(-])${b}\\b[.!]?(?=$|[\\s,)-])`, "gi"), "$1");
    }
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

function cleanName(raw, brand) {
  let s = stripBrand(raw, brand);
  // parentheticals / brackets (sizes, SKUs, color codes)
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/[()[\]{}]/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(RX.feetInches, " ");
  s = s.replace(/\b(\d)\s*-?\s*in\s*-?\s*1\b/gi, "$1-in-1");
  // pack counts
  s = s.replace(/\b(pack|case|box|bag|bundle|carton|lot|multipack)\s+of\s+\d+\b/gi, " ");
  s = s.replace(/\b\d+\s*[-–]?\s*(pack|pk|count|ct|pcs|pc|pairs?)\b\.?/gi, " ");
  s = s.replace(/^\s*\d+\s*[x×]\s+(?=[A-Za-z])/i, "");
  s = s.replace(/\b[x×]\s*\d+\b/gi, " ");
  s = s.replace(/\b\d+\s*\/\s*\d*\b/g, " ");
  // dimensions
  s = s.replace(RX.dims, " ");
  s = s.replace(/\b\d+(\.\d+)?(\s*(-|–|to)\s*\d+(\.\d+)?)?\s*(["”″′]|'')\s*([whdl]\b)?/gi, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*[-–]?\s*(inch|inches|in|cm|mm|ft|feet)\s*[-–]?\s*(w|h|d|l|wide|high|deep|long|tall)\b/gi, " ");
  s = s.replace(RX.units, " ");
  // clothing / shoe sizes
  s = s.replace(/\b(size\s*)?\d+(\.\d+)?\s*(b|d|m|w|wide|narrow|medium|regular)?\s*(us|uk|eu|eur|au|cn)\b/gi, " ");
  s = s.replace(/\b(us|uk|eu|eur)\s*(size\s*)?\d+(\.\d+)?\b/gi, " ");
  s = s.replace(/\bsize\s*[:\-]?\s*(xs|s|m|l|xl|xxl|xxxl|os|one size|\d+(\.\d+)?)\b/gi, " ");
  s = s.replace(/\b(xs|xxl|xxxl|xl|xx-large|x-large)\b/gi, " ");
  s = s.replace(/\s*\/\s*(pack|set|box|carton)\b/gi, " ");
  s = s.replace(/\bone size\b/gi, " ");
  s = s.replace(/\b(us\s+)?(little|big|toddler)\s+kids?\b/gi, " ");
  s = s.replace(/,\s*(small|medium|large|x-large|extra large)\s*$/i, "");
  s = s.replace(/\b\d+(\.\d+)?\s*(small|medium|large|x-large|wide|narrow|regular|youth|years?\+?|yrs?\+?|months?)\b/gi, " ");
  // SKU-ish tokens
  s = s.replace(/\b(?=[A-Za-z0-9_/-]{5,}\b)(?=[A-Za-z0-9_/-]*\d[A-Za-z0-9_/-]*\d[A-Za-z0-9_/-]*\d)(?=[A-Za-z0-9_/-]*[A-Za-z])[A-Za-z0-9_/-]+\b/g, " ");
  s = s.replace(/\b(?=[A-Z0-9/_-]{6,}\b)(?=[A-Z0-9/_-]*\d)(?=[A-Z0-9/_-]*[A-Z])[A-Z0-9/_-]+\b/g, " ");
  s = s.replace(/\b\d{6,}[\d-]*\b/g, " ");
  s = s.replace(/\b[A-Z0-9]+\/[A-Z0-9/]+\b/g, " ");
  s = s.replace(/\b(model|sku|item|part|style)\s*(no\.?|number|#)?\s*:?\s*[A-Z0-9-]+\b/gi, " ");
  s = s.replace(/#\s*\d+\b/g, " ");
  // marketing junk
  s = s.replace(/\b(new arrival|new|hot sale|best ?seller|premium quality|high quality|top quality|100%\s*(pure|natural|genuine|authentic)|free shipping|limited edition|value pack|family pack|bulk|wholesale|exclusive|official|original|genuine|authentic|brand new|great gift|gift idea|perfect gift|on sale|sale|clearance|in stock|ready to ship|ships? (today|now|free)|for (men|women|kids|boys|girls|him|her|adults|teens)(\s*(and|or|&|\/)\s*(men|women|kids|boys|girls|him|her|adults|teens))*)\b/gi, " ");
  s = s.replace(/["”″′]/g, " ");
  s = s.replace(/(?<![A-Za-z])'|'(?![A-Za-z])/g, " ");
  s = s.replace(/(^|[\s,])\+(?=[\s,]|$)/g, "$1");
  s = s.replace(/(^|,)\s*&\s*(?=,|$)/g, "$1");
  s = s.replace(/,\s*&\s+/g, ", ");
  s = s.replace(/\s[-–—]\s*[A-Za-z]\s*$/g, "");
  s = s.replace(/\s*[-–—]\s*[-–—]\s*/g, " - ");
  s = s.replace(/\s*[-–—]\s*,/g, ",");
  s = s.replace(/,\s*[-–—]\s*/g, ", ");
  s = s.replace(/\s*[,;:|]\s*(?=[,;:|.])/g, "");
  s = s.replace(/[,.;:]{2,}/g, ",");
  s = s.replace(/\s*[-–—]\s*,/g, ",");
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/\s+([,;:.!?])/g, "$1");
  s = s.replace(/([,;:])\s*\1+/g, "$1");
  s = s.replace(/(,\s*)+$/g, "");
  s = s.replace(/^[\s,;:.\-–—|&/]+|[\s,;:.\-–—|&/!]+$/g, "");
  s = s.replace(/,\s*(and|with|for|of|in|or|&)\s*,/gi, ",");
  s = s.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  s = s.replace(/\bunisex[- ]adults?\b/gi, "Unisex");
  s = fixCaps(s);
  s = tidyEnds(s);
  s = truncateWords(s, 70);
  s = tidyEnds(s);
  return s.trim();
}

function tidyEnds(s) {
  s = s.replace(/\.{2,}/g, "").replace(/\s*\.\s*,/g, ",").replace(/\s{2,}/g, " ");
  s = s.replace(/\s*[-–—]\s*(set|kit|pack)\s*$/i, " $1");
  s = s.replace(/\s*[-–—]\s*,/g, ",");
  s = s.replace(/^[\s,;:.\-–—|&/]+|[\s,;:.\-–—|&/]+$/g, "");
  s = s.replace(/(?<!\bof)[,\s]+\d+(\.\d+)?\.?$/g, "");
  s = s.replace(/\s+(and|with|for|of|in|the|a|an|or|to|by|on|at|from|&)$/i, "");
  s = s.replace(/^[\s,;:.\-–—|&/]+|[\s,;:.\-–—|&/]+$/g, "");
  return s.trim();
}

/** True when a cleaned name still carries at least two meaningful words. */
function nameLooksReal(name) {
  const words = name
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !COLOR_ALIASES.has(w) && !SIZE_WORDS.has(w) && !["men", "women", "mens", "womens", "kids", "boys", "girls", "set", "pack", "with", "and", "the", "for", "colour", "color", "assorted"].includes(w));
  return words.length >= 2;
}

/** ASCII-letter share >= 90 %, no foreign function words, and (common English word or no diacritics). */
function looksEnglish(title, desc) {
  const letters = title.match(/\p{L}/gu) || [];
  if (letters.length < 4) return false;
  const ascii = letters.filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (ascii / letters.length < 0.9) return false;
  if (NON_EN.test(title)) return false;
  const hasDiacritics = /[À-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿]/.test(title);
  if (hasDiacritics && !COMMON_EN.test(title)) return false;
  const d = normalizeText(desc).slice(0, 500);
  if (d) {
    const nonEn = (d.match(NON_EN_G) || []).length;
    const en = (d.match(EN_STOP_G) || []).length;
    if (nonEn >= 3 && nonEn > en) return false;
    const dl = d.match(/\p{L}/gu) || [];
    if (dl.length >= 40) {
      const da = dl.filter((ch) => /[A-Za-z]/.test(ch)).length;
      if (da / dl.length < 0.85) return false;
    }
  }
  return true;
}

function extractColors(title) {
  const out = new Set();
  const src = (title || "").toLowerCase();
  for (const group of COLOR_WORDS) {
    for (const alias of group) {
      const rx = new RegExp(`(^|[^a-z])${escapeRegex(alias)}([^a-z]|$)`, "i");
      if (rx.test(src)) {
        out.add(group[0]);
        break;
      }
    }
    if (out.size >= 3) break;
  }
  return [...out];
}

function extractMaterials(text) {
  const out = [];
  for (const [name, rx] of MATERIALS) {
    if (rx.test(text)) out.push(name);
    if (out.length >= 4) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Price / rating synthesis — identical to the ABO build
// ---------------------------------------------------------------------------

const BASE_MSRP = {
  "Home decor": 42,
  "Kitchen & tabletop": 28,
  "Candles & fragrance": 26,
  "Stationery & paper": 12,
  "Books & journals": 18,
  Apparel: 54,
  "Jewelry & accessories": 38,
  "Bath & body": 16,
  "Food & drink": 11,
  "Kids & baby": 24,
  Pets: 20,
  "Garden & outdoor": 36,
};
const SUB_MULT = [
  [/chairs|tables|ottomans|benches|stools|patio furniture|shelving|seating|screens|hammocks|shelters|fire pits|grills/i, 4.5],
  [/rugs|outdoor rugs/i, 3.2],
  [/lamps|lighting|mirrors|wall art|fountains|curtains|window shades|bedding|pet beds|crates|patio umbrellas|camping|garden structures/i, 2.2],
  [/necklaces|rings|bracelets|watches|handbags|backpacks|jewelry sets|bags/i, 1.8],
  [/pillows|throws|clocks|vases|baskets|storage|frames|planters|sculpture|figurines|wallets|tote bags|dresses|outerwear|sweaters/i, 1.5],
  [/cookware|knives|dinnerware|bakeware|cutting boards|jars|pitchers|pet food|coolers|outdoor lighting|bird feeders/i, 1.7],
  [/boots|sneakers|heels|loafers|dress shoes|shoes/i, 1.4],
  [/sandals|flats|slippers/i, 1.1],
  [/hats|scarves|gloves|socks|belts|neckties|athletic|cold-weather|hair accessories|charms|earrings|anklets|sunglasses|eyewear|umbrellas|keychains|pouches/i, 0.8],
  [/coffee|tea|wine|oils|honey|spreads|confectionery/i, 1.3],
  [/snacks|cookies|pantry|spices|sauces|beverages|baking|breakfast/i, 0.8],
  [/drinkware|coasters|kitchen tools|barware|kitchen linens|table linens|bottles|flatware|serveware|salt/i, 0.9],
  [/candles|diffusers|perfume/i, 1.2],
  [/incense|wax melts|room fragrance|potpourri|essential oils/i, 0.7],
  [/pens|markers|sticky|labels|envelopes|stickers|paper|desk tools|cards|folders/i, 0.8],
  [/boards|desk accessories|calendars|art supplies|classroom/i, 1.4],
  [/journals|planners|sketchbooks|books|bookends/i, 1.1],
  [/notebooks|notepads/i, 0.8],
  [/makeup|skin care|hair care|gift sets|body oils|perfume/i, 1.4],
  [/wipes|cotton|oral care|lip care|deodorant|bath accessories|shaving/i, 0.6],
  [/toys|games|puzzles|building|ride-ons|kids room|baby gear|costumes/i, 1.4],
  [/diapers|baby care|feeding|pacifiers|baby food/i, 0.8],
  [/pet apparel|collars|bowls|pet toys|treats|grooming|litter/i, 0.9],
  [/garden tools|plants|garden decor|beach|outdoor cushions|furniture covers|garden/i, 1.1],
];

function synthPrice(category, subcategory, title, key) {
  const rng = rngFor("price|" + key);
  let m = 1;
  for (const [rx, mult] of SUB_MULT) {
    if (rx.test(subcategory)) {
      m = mult;
      break;
    }
  }
  if (/\b(14k|18k|10k|sterling|diamond|sapphire|emerald|ruby|pearl|solid gold|platinum)\b/i.test(title)) m *= 2.4;
  if (/\b(set of|piece set|-piece|pc set|set\b)/i.test(title)) m *= 1.3;
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  let msrp = BASE_MSRP[category] * m * Math.exp(0.4 * z);
  msrp = Math.max(3, Math.round(msrp * 2) / 2);
  if (msrp >= 20) msrp = Math.round(msrp);
  const wholesale = Math.round((msrp / 2) * 100) / 100;
  return { msrp, wholesale };
}

// ---------------------------------------------------------------------------
// HTTP helpers: datasets-server pages (cached) and signed image URLs
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADERS = { "user-agent": "faire-personalization-prototype/1.0 (catalog build script)" };
if (process.env.HF_TOKEN) HEADERS.authorization = `Bearer ${process.env.HF_TOKEN}`;

async function fetchWithRetry(url, { attempts = 6, timeoutMs = 60000, headers = HEADERS } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new Error(`GET ${url.slice(0, 120)} -> ${res.status}`);
      lastErr.status = res.status;
      if (!retryable) return res;
      const ra = Number(res.headers.get("retry-after"));
      await sleep((ra ? ra * 1000 : 1000 * 2 ** i) + Math.random() * 500);
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** i + Math.random() * 500);
    }
  }
  throw lastErr;
}

function pageFile(offset) {
  return path.join(CACHE_ROWS, `rows-${String(offset).padStart(5, "0")}.json`);
}

/** One page of rows (100). Cached on disk; `force` bypasses the cache (fresh signed image URLs). */
async function fetchPage(offset, { force = false } = {}) {
  const file = pageFile(offset);
  if (!force && fs.existsSync(file)) {
    try {
      return JSON.parse(await fsp.readFile(file, "utf8"));
    } catch {
      /* corrupt cache; refetch */
    }
  }
  const url = `${API}?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${offset}&length=${PAGE}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`rows API ${res.status} at offset ${offset}`);
  const json = await res.json();
  if (!Array.isArray(json.rows)) throw new Error(`rows API: no rows at offset ${offset}`);
  const slim = {
    fetchedAt: new Date().toISOString(),
    num_rows_total: json.num_rows_total,
    rows: json.rows.map((r) => ({
      row_idx: r.row_idx,
      product_title: r.row.product_title,
      product_description: r.row.product_description,
      product_image: r.row.product_image ? { src: r.row.product_image.src, width: r.row.product_image.width, height: r.row.product_image.height } : null,
      ground_truth_brand: r.row.ground_truth_brand,
      ground_truth_is_secondhand: r.row.ground_truth_is_secondhand,
      ground_truth_category: r.row.ground_truth_category,
    })),
  };
  await fsp.mkdir(CACHE_ROWS, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(slim));
  return slim;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        results[idx] = { error: e };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sniffExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "bmp";
  if ((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d)) return "tiff";
  return null;
}

// Pages re-fetched for fresh signatures during the image stage (at most once per page).
const freshPages = new Map();
async function freshImageUrl(rowIdx) {
  const offset = Math.floor(rowIdx / PAGE) * PAGE;
  if (!freshPages.has(offset)) freshPages.set(offset, fetchPage(offset, { force: true }));
  const page = await freshPages.get(offset);
  const row = page.rows.find((r) => r.row_idx === rowIdx);
  return row && row.product_image && row.product_image.src;
}

/** Download the row's image into the image cache; returns the cached file path. */
async function ensureImage(rowIdx, src) {
  await fsp.mkdir(CACHE_IMG, { recursive: true });
  for (const ext of ["jpg", "png", "gif", "webp", "bmp", "tiff"]) {
    const f = path.join(CACHE_IMG, `${rowIdx}.${ext}`);
    if (fs.existsSync(f) && fs.statSync(f).size > 0) return f;
  }
  let url = src;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!url) throw new Error("no image url");
    const res = await fetchWithRetry(url, { attempts: 4, headers: { "user-agent": HEADERS["user-agent"] } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = sniffExt(buf);
      if (!ext) throw new Error("not an image");
      const f = path.join(CACHE_IMG, `${rowIdx}.${ext}`);
      await fsp.writeFile(f, buf);
      return f;
    }
    // 403/400 = expired signature -> re-fetch the page once for a fresh URL.
    if (attempt === 0 && (res.status === 403 || res.status === 400 || res.status === 401 || res.status === 404)) {
      url = await freshImageUrl(rowIdx);
      continue;
    }
    throw new Error(`image ${res.status}`);
  }
  throw new Error("image download failed");
}

// ---------------------------------------------------------------------------
// Image pipeline (macOS sips) — same parameters as the ABO build
// ---------------------------------------------------------------------------

async function sipsDims(file) {
  const { stdout } = await execFileP("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
  const w = Number((stdout.match(/pixelWidth:\s*(\d+)/) || [])[1]);
  const h = Number((stdout.match(/pixelHeight:\s*(\d+)/) || [])[1]);
  return { w, h };
}

async function convertImage(src, dest) {
  const { w, h } = await sipsDims(src);
  if (!w || !h) throw new Error("no dims");
  if (Math.max(w, h) < 200) throw new Error(`too small ${w}x${h}`);
  const resize = Math.max(w, h) > MAX_EDGE ? ["-Z", String(MAX_EDGE)] : [];
  for (const q of [78, 70, 62, 54, 46, 40]) {
    await execFileP("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(q), ...resize, src, "--out", dest]);
    const size = fs.statSync(dest).size;
    if (size <= TARGET_BYTES) return { w, h, size, q };
  }
  return { w, h, size: fs.statSync(dest).size, q: 40 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const ti = args.indexOf("--test");
  if (ti >= 0) {
    const raw = args[ti + 1] || "";
    const brand = normalizeBrand(args[ti + 2] || "");
    console.log(JSON.stringify({ brand, stripped: stripBrand(raw, brand), name: cleanName(raw, brand), english: looksEnglish(raw, "") }, null, 2));
    return;
  }
  const t0 = Date.now();
  console.log(`Dataset: ${DATASET_ID}`);
  console.log(`Row cache: ${path.relative(ROOT, CACHE_ROWS)}  image cache: ${path.relative(ROOT, CACHE_IMG)}`);

  // 1. Page through the rows API (cached).
  const first = await fetchPage(0);
  const total = first.num_rows_total;
  const offsets = [];
  for (let o = 0; o < total; o += PAGE) offsets.push(o);
  let fetched = 0;
  let fromNetwork = 0;
  const pages = await pool(offsets, FETCH_CONCURRENCY, async (o) => {
    const cached = fs.existsSync(pageFile(o));
    const p = await fetchPage(o);
    if (!cached) fromNetwork++;
    fetched++;
    if (fetched % 50 === 0) console.log(`  pages ${fetched}/${offsets.length}`);
    return p;
  });
  const pageErrors = pages.filter((p) => p && p.error);
  if (pageErrors.length) {
    console.error(`  ${pageErrors.length} pages failed:`, pageErrors.slice(0, 3).map((p) => String(p.error.message || p.error)));
    throw new Error("page fetch failed; re-run to resume from the cache");
  }
  console.log(`Fetched ${offsets.length} pages (${fromNetwork} from network, ${offsets.length - fromNetwork} cached); ${total} rows`);

  // 2. Rows -> candidates.
  const stats = { rows: 0, secondhand: 0, unmapped: 0, skippedByRule: 0, hardSkip: 0, nonEnglish: 0, catSkip: 0, noImage: 0, smallImage: 0, badName: 0, dupe: 0 };
  const unmapped = new Map();
  const candidates = [];
  const seenTitle = new Set();
  const seenBrandKey = new Set();
  for (const page of pages) {
    for (const r of page.rows) {
      stats.rows++;
      if (r.ground_truth_is_secondhand !== false) {
        stats.secondhand++;
        continue;
      }
      const pathStr = normalizeText(r.ground_truth_category);
      if (!pathStr) {
        stats.unmapped++;
        continue;
      }
      const category = mapCategory(pathStr);
      if (category === undefined) {
        stats.unmapped++;
        const k2 = pathStr.split(" > ").slice(0, 2).join(" > ");
        unmapped.set(k2, (unmapped.get(k2) || 0) + 1);
        continue;
      }
      if (category === null) {
        stats.skippedByRule++;
        continue;
      }
      const rawTitle = normalizeText(r.product_title);
      const brand = normalizeBrand(r.ground_truth_brand);
      if (!rawTitle || HARD_SKIP.test(rawTitle) || (brand !== "—" && /\b(amazon|walmart|costco|ebay|aliexpress|temu|shein)\b/i.test(brand))) {
        stats.hardSkip++;
        continue;
      }
      const desc = normalizeText(r.product_description);
      if (!looksEnglish(rawTitle, desc)) {
        stats.nonEnglish++;
        continue;
      }
      const strippedTitle = stripBrand(rawTitle, brand);
      const catSkip = CAT_SKIP[category];
      if (catSkip && catSkip(strippedTitle)) {
        stats.catSkip++;
        continue;
      }
      const img = r.product_image;
      if (!img || !img.src) {
        stats.noImage++;
        continue;
      }
      if (Math.max(img.width || 0, img.height || 0) < 200) {
        stats.smallImage++;
        continue;
      }
      const name = cleanName(rawTitle, brand);
      if (name.length < 8 || name.length > 70 || !/[a-z]/i.test(name) || !nameLooksReal(name) || !/^[\x20-\x7e]+$/.test(name)) {
        stats.badName++;
        continue;
      }
      // Dedupe: normalised title, and brand + first three words.
      const normTitle = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const brandKey = brand.toLowerCase() + "|" + normTitle.split(" ").slice(0, 3).join(" ");
      if (seenTitle.has(normTitle) || seenBrandKey.has(brandKey)) {
        stats.dupe++;
        continue;
      }
      seenTitle.add(normTitle);
      seenBrandKey.add(brandKey);

      const subcategory = subcategoryFor(category, pathStr);
      const consumable = category === "Food & drink" || category === "Bath & body";
      const text = [strippedTitle, desc.slice(0, 600)].join(" ");
      const materials = consumable
        ? extractMaterials(text).filter((m) => ["glass", "cotton", "bamboo", "wood", "paper", "silicone", "stainless-steel"].includes(m) && category !== "Food & drink")
        : extractMaterials(text);
      const colors = consumable ? [] : extractColors(strippedTitle);
      candidates.push({
        rowIdx: r.row_idx,
        rawTitle,
        name,
        brand,
        category,
        subcategory,
        sourceCategory: pathStr,
        imageSrc: img.src,
        imgW: img.width,
        imgH: img.height,
        materials,
        colors,
      });
    }
  }
  console.log(`Scanned ${stats.rows} rows -> ${candidates.length} unique candidates`);
  console.log(`  dropped: secondhand ${stats.secondhand}, unmapped taxonomy ${stats.unmapped}, skipped-by-rule ${stats.skippedByRule}, hard-skip ${stats.hardSkip}, non-English ${stats.nonEnglish}, category filter ${stats.catSkip}, no image ${stats.noImage}, tiny image ${stats.smallImage}, bad name ${stats.badName}, duplicate ${stats.dupe}`);
  if (DRY) {
    const top = [...unmapped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    console.log("Top unmapped 2-level paths:");
    for (const [k, v] of top) console.log(`  ${String(v).padStart(5)}  ${k}`);
  }

  // 3. Balanced selection: per category, round-robin across taxonomy leaf paths.
  const byCat = new Map(CATEGORIES.map((c) => [c, new Map()]));
  for (const c of candidates) {
    const m = byCat.get(c.category);
    if (!m.has(c.sourceCategory)) m.set(c.sourceCategory, []);
    m.get(c.sourceCategory).push(c);
  }
  const selected = [];
  const poolCounts = {};
  const leafCounts = {};
  for (const cat of CATEGORIES) {
    const buckets = [...byCat.get(cat).entries()].map(([leaf, arr]) => [leaf, shuffle(arr, rngFor("bucket|" + cat + "|" + leaf))]);
    poolCounts[cat] = buckets.reduce((a, [, arr]) => a + arr.length, 0);
    leafCounts[cat] = buckets.length;
    const order = shuffle(buckets, rngFor("order|" + cat));
    const want = Math.ceil(CAP * OVERSELECT);
    const picked = [];
    let progress = true;
    let round = 0;
    while (picked.length < want && progress) {
      progress = false;
      for (const [, arr] of order) {
        if (round < arr.length) {
          picked.push(arr[round]);
          progress = true;
          if (picked.length >= want) break;
        }
      }
      round++;
    }
    selected.push(...picked);
  }
  console.log("Candidate pool per category (leaf categories):");
  for (const cat of CATEGORIES) console.log(`  ${cat.padEnd(24)} ${String(poolCounts[cat]).padStart(5)}  (${leafCounts[cat]} leaves)`);
  console.log(`Selected ${selected.length} candidates for image fetch (cap ${CAP} × ${OVERSELECT})`);
  if (DRY) {
    for (const cat of CATEGORIES) {
      const sample = selected.filter((c) => c.category === cat).slice(0, 6);
      console.log(`  [${cat}]`);
      for (const c of sample) console.log(`     ${c.name}  |  ${c.brand}  |  ${c.subcategory}`);
    }
  }

  // 4. Images.
  await fsp.mkdir(OUT_IMG_DIR, { recursive: true });
  const tmpDir = path.join(ROOT, ".cache", "shopify-tmp");
  await fsp.mkdir(tmpDir, { recursive: true });
  let done = 0;
  const imgResults = DRY
    ? selected.map(() => ({ ok: true, dry: true }))
    : await pool(selected, IMG_CONCURRENCY, async (c) => {
        try {
          const src = await ensureImage(c.rowIdx, c.imageSrc);
          if (fs.statSync(src).size < 3000) throw new Error("tiny file");
          const tmp = path.join(tmpDir, c.rowIdx + ".jpg");
          const info = await convertImage(src, tmp);
          if (info.size < 2500) throw new Error("blank-looking output");
          return { ok: true, tmp, info };
        } catch (e) {
          return { ok: false, error: String(e.message || e) };
        } finally {
          done++;
          if (done % 100 === 0) console.log(`  images ${done}/${selected.length}`);
        }
      });

  // 5. Keep first CAP successes per category, assign ids, move images into place.
  const perCat = {};
  const final = [];
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    const r = imgResults[i];
    if (!r || !r.ok) continue;
    perCat[c.category] = (perCat[c.category] || 0) + 1;
    if (perCat[c.category] > CAP) continue;
    final.push({ ...c, img: r });
  }
  final.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.rowIdx - b.rowIdx);

  if (!DRY) for (const f of await fsp.readdir(OUT_IMG_DIR)) if (f.endsWith(".jpg")) await fsp.unlink(path.join(OUT_IMG_DIR, f));

  const products = [];
  let n = 0;
  for (const c of final) {
    n++;
    const id = `shp-${String(n).padStart(4, "0")}`;
    if (!DRY) await fsp.copyFile(c.img.tmp, path.join(OUT_IMG_DIR, id + ".jpg"));
    // Real, diverse brands here, so minOrder and isNewBrand are brand-level (as in catalog.json).
    const brandRng = rngFor("brand|" + c.brand.toLowerCase());
    const minOrder = [50, 75, 100, 150, 200, 250][Math.floor(brandRng() * 6)];
    const isNewBrand = c.brand === "—" ? rngFor("item-newbrand|" + c.rowIdx)() < 0.25 : brandRng() < 0.25;
    const rng = rngFor("item|" + c.rowIdx);
    const rating = Math.round((4.2 + 0.8 * (1 - Math.pow(rng(), 2))) * 10) / 10;
    let reviewCount = Math.round(Math.exp(Math.log(3) + rng() * (Math.log(1500) - Math.log(3))));
    if (isNewBrand) reviewCount = Math.max(2, Math.round(reviewCount * 0.15));
    const leadTimeDays = 3 + Math.floor(rng() * 12);
    const { msrp, wholesale } = synthPrice(c.category, c.subcategory, c.rawTitle, String(c.rowIdx));
    products.push({
      id,
      name: c.name,
      brand: c.brand,
      category: c.category,
      subcategory: c.subcategory,
      wholesalePrice: wholesale,
      msrp,
      priceSynthetic: true,
      minOrder,
      rating,
      reviewCount,
      ratingSynthetic: true,
      styles: [],
      materials: c.materials,
      colors: c.colors,
      priceTier: "mid",
      isBestseller: false,
      isNewBrand,
      leadTimeDays,
      madeIn: "Unknown",
      image: `/catalog-shopify/${id}.jpg`,
      source: "Shopify/product-catalogue",
      sourceId: c.rowIdx,
      sourceCategory: c.sourceCategory,
    });
  }

  // 6. priceTier tertiles within category; bestseller top ~15 % by rating*log(reviews).
  for (const cat of CATEGORIES) {
    const ps = products.filter((p) => p.category === cat).sort((a, b) => a.msrp - b.msrp);
    ps.forEach((p, i) => {
      const q = (i + 0.5) / ps.length;
      p.priceTier = q < 1 / 3 ? "value" : q < 2 / 3 ? "mid" : "premium";
    });
  }
  const scored = products.map((p) => p.rating * Math.log(p.reviewCount + 1)).sort((a, b) => b - a);
  const cutoff = scored[Math.floor(scored.length * 0.15)] ?? Infinity;
  for (const p of products) p.isBestseller = p.rating * Math.log(p.reviewCount + 1) >= cutoff;

  // 7. Write.
  if (!DRY) {
    await fsp.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fsp.writeFile(OUT_JSON, JSON.stringify(products, null, 2) + "\n");
  }

  // 8. Report.
  const counts = {};
  for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;
  let totalBytes = 0;
  let imgCount = 0;
  let maxBytes = 0;
  if (!DRY) {
    for (const f of await fsp.readdir(OUT_IMG_DIR)) {
      if (!f.endsWith(".jpg")) continue;
      imgCount++;
      const sz = fs.statSync(path.join(OUT_IMG_DIR, f)).size;
      totalBytes += sz;
      maxBytes = Math.max(maxBytes, sz);
    }
  }
  const failed = imgResults.filter((r) => !r || !r.ok);
  const failReasons = {};
  for (const r of failed) failReasons[r.error || "?"] = (failReasons[r.error || "?"] || 0) + 1;
  console.log("\n==== SUMMARY ====");
  console.log(`Dataset: ${DATASET_ID}`);
  console.log(`Rows scanned: ${stats.rows} (of ${total})`);
  console.log(`Products: ${products.length}${DRY ? " (dry run, no images written)" : ""}`);
  for (const cat of CATEGORIES) console.log(`  ${cat.padEnd(24)} ${String(counts[cat] || 0).padStart(4)}   (pool ${poolCounts[cat]}, ${leafCounts[cat]} leaves)`);
  if (!DRY) {
    console.log(`Images: ${imgCount} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total, avg ${(totalBytes / Math.max(1, imgCount) / 1024).toFixed(1)} KB, max ${(maxBytes / 1024).toFixed(0)} KB`);
    console.log(`Image fetch/convert failures among selected: ${failed.length} ${failed.length ? JSON.stringify(failReasons) : ""}`);
    if (imgCount !== products.length) console.log(`WARNING: image count ${imgCount} != product count ${products.length}`);
  }
  const brands = new Set(products.map((p) => p.brand));
  console.log(`Bestsellers: ${products.filter((p) => p.isBestseller).length}; new-brand: ${products.filter((p) => p.isNewBrand).length}; distinct brands: ${brands.size}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}; elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("Caveats: prices, ratings, review counts, minOrder, lead times and new-brand flags are synthetic (the dataset has none); madeIn is Unknown; category comes from a prefix map over the Google product taxonomy and subcategory is the taxonomy leaf; images are the sellers' own product photos (mostly lifestyle/packshot mix).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
