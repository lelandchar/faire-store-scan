#!/usr/bin/env node
/**
 * build-public-catalog.mjs
 *
 * Assembles `data/catalog-public.json` + `public/catalog-public/<id>.jpg` from the
 * Amazon Berkeley Objects (ABO) dataset (CC BY 4.0).
 *
 * Source files (all fetched directly from the official ABO S3 bucket, nothing else):
 *   listings/metadata/listings_{0..f}.json.gz   ~87 MB total, 147,702 listings
 *   images/metadata/images.csv.gz               image_id -> path,height,width
 *   images/original/<path>                      one JPEG per selected product
 *
 * Usage:
 *   node scripts/build-public-catalog.mjs            # full build
 *   node scripts/build-public-catalog.mjs --dry      # metadata only, no image downloads
 *   node scripts/build-public-catalog.mjs --cap 40   # per-category cap (default 100)
 *
 * Env:
 *   ABO_CACHE_DIR   where downloaded shards / originals are cached
 *                   (default: <os.tmpdir()>/abo-cache)
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_JSON = path.join(ROOT, "data", "catalog-public.json");
const OUT_IMG_DIR = path.join(ROOT, "public", "catalog-public");
const CACHE = process.env.ABO_CACHE_DIR || path.join(os.tmpdir(), "abo-cache");
const S3 = "https://amazon-berkeley-objects.s3.amazonaws.com";
const DATASET_ID = "amazon-berkeley-objects (ABO), CC BY 4.0";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const CAP = Number(args[args.indexOf("--cap") + 1]) || 100; // per-category cap
const OVERSELECT = 1.35; // select extra candidates to absorb image failures
const MAX_EDGE = 512;
const TARGET_BYTES = 48 * 1024; // per image; total budget is ~40 MB
const SEED = "faire-public-catalog-v1";
const CONCURRENCY = 8;

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
// Seeded RNG helpers (deterministic output for a given SEED)
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
// Category mapping: ABO product_type -> [category, subcategory | null]
// null subcategory => derived from title keywords (see deriveSubcategory)
// Anything not in this map is dropped unless a keyword override fires.
// ---------------------------------------------------------------------------

const PT = {
  // Home decor
  HOME: ["Home decor", null],
  HOME_FURNITURE_AND_DECOR: ["Home decor", null],
  HOME_BED_AND_BATH: ["Home decor", null],
  WALL_ART: ["Home decor", "Wall art"],
  RUG: ["Home decor", "Rugs"],
  LAMP: ["Home decor", "Lamps"],
  LIGHT_FIXTURE: ["Home decor", "Lighting"],
  HOME_LIGHTING_AND_LAMPS: ["Home decor", "Lighting"],
  STRING_LIGHT: ["Home decor", "String lights"],
  PILLOW: ["Home decor", "Pillows"],
  CLOCK: ["Home decor", "Clocks"],
  HOME_MIRROR: ["Home decor", "Mirrors"],
  VASE: ["Home decor", "Vases"],
  BASKET: ["Home decor", "Baskets"],
  PICTURE_FRAME: ["Home decor", "Frames"],
  FIGURINE: ["Home decor", "Figurines"],
  SCULPTURE: ["Home decor", "Sculpture"],
  CURTAIN: ["Home decor", "Curtains"],
  WINDOW_SHADE: ["Home decor", "Window shades"],
  BLANKET: ["Home decor", "Throws"],
  FLAT_SHEET: ["Home decor", "Bedding"],
  ARTIFICIAL_PLANT: ["Home decor", "Faux plants"],
  ARTIFICIAL_TREE: ["Home decor", "Faux plants"],
  STOOL_SEATING: ["Home decor", "Stools"],
  OTTOMAN: ["Home decor", "Ottomans"],
  BENCH: ["Home decor", "Benches"],
  SHELF: ["Home decor", "Shelving"],
  CHAIR: ["Home decor", "Chairs"],
  TABLE: ["Home decor", "Tables"],
  STORAGE_BOX: ["Home decor", "Storage"],
  LAUNDRY_HAMPER: ["Home decor", "Storage"],
  BEAN_BAG_CHAIR: ["Home decor", "Seating"],
  ROOM_DIVIDER: ["Home decor", "Screens"],
  // Kitchen & tabletop
  KITCHEN: ["Kitchen & tabletop", null],
  ABIS_KITCHEN: ["Kitchen & tabletop", null],
  FOOD_SERVICE_SUPPLY: ["Kitchen & tabletop", null],
  DRINKING_CUP: ["Kitchen & tabletop", "Drinkware"],
  JAR: ["Kitchen & tabletop", "Jars & canisters"],
  BOTTLE: ["Kitchen & tabletop", "Bottles"],
  THERMOS: ["Kitchen & tabletop", "Bottles"],
  PITCHER: ["Kitchen & tabletop", "Pitchers"],
  FLATWARE: ["Kitchen & tabletop", "Flatware"],
  DISHWARE_PLATE: ["Kitchen & tabletop", "Plates"],
  DISHWARE_BOWL: ["Kitchen & tabletop", "Bowls"],
  DISHWARE_PLACE_SETTING: ["Kitchen & tabletop", "Dinnerware"],
  PLACEMAT: ["Kitchen & tabletop", "Table linens"],
  DRINK_COASTER: ["Kitchen & tabletop", "Coasters"],
  SAUTE_FRY_PAN: ["Kitchen & tabletop", "Cookware"],
  DUTCH_OVENS: ["Kitchen & tabletop", "Cookware"],
  PRESSURE_COOKER: ["Kitchen & tabletop", "Cookware"],
  CASSEROLES: ["Kitchen & tabletop", "Bakeware"],
  BAKING_PAN: ["Kitchen & tabletop", "Bakeware"],
  SHEET_PAN: ["Kitchen & tabletop", "Bakeware"],
  BAKING_CUP: ["Kitchen & tabletop", "Bakeware"],
  FOOD_PREPARATION_MOLD: ["Kitchen & tabletop", "Bakeware"],
  COOKIE_CUTTER: ["Kitchen & tabletop", "Bakeware"],
  KITCHEN_KNIFE: ["Kitchen & tabletop", "Knives"],
  KNIFE_BLOCK_SET: ["Kitchen & tabletop", "Knives"],
  CUTTING_BOARD: ["Kitchen & tabletop", "Cutting boards"],
  KITCHEN_TOOLS: ["Kitchen & tabletop", "Kitchen tools"],
  CAN_OPENER: ["Kitchen & tabletop", "Kitchen tools"],
  GARLIC_PRESS: ["Kitchen & tabletop", "Kitchen tools"],
  BOTTLE_OPENER: ["Kitchen & tabletop", "Barware"],
  MEASURING_CUP: ["Kitchen & tabletop", "Kitchen tools"],
  ICE_CUBE_TRAY: ["Kitchen & tabletop", "Barware"],
  DRINKING_STRAW: ["Kitchen & tabletop", "Barware"],
  POT_HOLDER: ["Kitchen & tabletop", "Kitchen linens"],
  PAPER_TOWEL_HOLDER: ["Kitchen & tabletop", "Kitchen organization"],
  BOTTLE_RACK: ["Kitchen & tabletop", "Kitchen organization"],
  // Candles & fragrance
  CANDLE: ["Candles & fragrance", "Candles"],
  CANDLE_HOLDER: ["Candles & fragrance", "Candle holders"],
  INCENSE: ["Candles & fragrance", "Incense"],
  ESSENTIAL_OIL: ["Candles & fragrance", "Essential oils"],
  AREA_DEODORIZER: ["Candles & fragrance", null],
  // Stationery & paper
  OFFICE_PRODUCTS: ["Stationery & paper", null],
  PAPER_PRODUCT: ["Stationery & paper", null],
  WRITING_INSTRUMENT: ["Stationery & paper", "Pens & pencils"],
  MARKING_PEN: ["Stationery & paper", "Markers"],
  FILE_FOLDER: ["Stationery & paper", "Folders & binders"],
  STORAGE_BINDER: ["Stationery & paper", "Folders & binders"],
  LABEL: ["Stationery & paper", "Labels"],
  ENVELOPE: ["Stationery & paper", "Envelopes"],
  STICKER_DECAL: ["Stationery & paper", null],
  PRINT_COPY_PAPER: ["Stationery & paper", "Paper"],
  CARD_STOCK: ["Stationery & paper", "Paper"],
  WRITING_PAPER: ["Stationery & paper", "Paper"],
  WRITING_BOARD: ["Stationery & paper", "Boards"],
  PINBOARD: ["Stationery & paper", "Boards"],
  STAPLER: ["Stationery & paper", "Desk tools"],
  SCISSORS: ["Stationery & paper", "Desk tools"],
  SELF_STICK_NOTE: ["Stationery & paper", "Sticky notes"],
  ART_AND_CRAFT_SUPPLY: ["Stationery & paper", "Art supplies"],
  PAINT_BRUSH: ["Stationery & paper", "Art supplies"],
  TEACHING_EQUIPMENT: ["Stationery & paper", "Classroom supplies"],
  EDUCATIONAL_SUPPLIES: ["Kids & baby", "Learning"],
  // Books & journals
  ABIS_BOOK: ["Books & journals", "Books"],
  BOOKEND: ["Books & journals", "Bookends"],
  // Apparel
  SHOES: ["Apparel", null],
  BOOT: ["Apparel", "Boots"],
  SANDAL: ["Apparel", "Sandals"],
  TECHNICAL_SPORT_SHOE: ["Apparel", "Sneakers"],
  HAT: ["Apparel", "Hats"],
  ACCESSORY: ["Apparel", null],
  EARMUFF: ["Apparel", null],
  SWEATBAND: ["Apparel", "Athletic accessories"],
  LEOTARD: ["Apparel", "Dancewear"],
  SALWAR_SUIT_SET: ["Apparel", "Dresses & sets"],
  LEHENGA_CHOLI_SET: ["Apparel", "Dresses & sets"],
  TRACK_SUIT: ["Apparel", "Activewear"],
  OVERALLS: ["Apparel", "Overalls"],
  NECKTIE: ["Apparel", "Neckties"],
  SUSPENDER: ["Apparel", "Suspenders"],
  // Jewelry & accessories
  FINEEARRING: ["Jewelry & accessories", "Earrings"],
  EARRING: ["Jewelry & accessories", "Earrings"],
  FASHIONEARRING: ["Jewelry & accessories", "Earrings"],
  FINERING: ["Jewelry & accessories", "Rings"],
  RING: ["Jewelry & accessories", "Rings"],
  FASHIONRING: ["Jewelry & accessories", "Rings"],
  FINENECKLACEBRACELETANKLET: ["Jewelry & accessories", null],
  FASHIONNECKLACEBRACELETANKLET: ["Jewelry & accessories", null],
  NECKLACE: ["Jewelry & accessories", "Necklaces"],
  BRACELET: ["Jewelry & accessories", "Bracelets"],
  CHARM: ["Jewelry & accessories", "Charms"],
  JEWELRY_SET: ["Jewelry & accessories", "Jewelry sets"],
  JEWELRY: ["Jewelry & accessories", null],
  FINEOTHER: ["Jewelry & accessories", null],
  FASHIONOTHER: ["Jewelry & accessories", null],
  HANDBAG: ["Jewelry & accessories", "Handbags"],
  WALLET: ["Jewelry & accessories", "Wallets"],
  BACKPACK: ["Jewelry & accessories", "Backpacks"],
  TOTE_BAG: ["Jewelry & accessories", "Tote bags"],
  BAG: ["Jewelry & accessories", "Bags"],
  COSMETIC_CASE: ["Jewelry & accessories", "Pouches"],
  EYEWEAR: ["Jewelry & accessories", null],
  SUNGLASSES: ["Jewelry & accessories", "Sunglasses"],
  WATCH: ["Jewelry & accessories", "Watches"],
  HAIRBAND: ["Jewelry & accessories", "Hair accessories"],
  JEWELRY_STORAGE: ["Jewelry & accessories", "Jewelry boxes"],
  // Bath & body
  BEAUTY: ["Bath & body", null],
  ABIS_BEAUTY: ["Bath & body", null],
  HEALTH_PERSONAL_CARE: ["Bath & body", null],
  SKIN_CLEANING_AGENT: ["Bath & body", "Cleansers & soap"],
  SKIN_MOISTURIZER: ["Bath & body", "Moisturizers"],
  SKIN_EXFOLIANT: ["Bath & body", "Scrubs"],
  SHAMPOO: ["Bath & body", "Hair care"],
  CONDITIONER: ["Bath & body", "Hair care"],
  HAIR_CLEANER_CONDITIONER: ["Bath & body", "Hair care"],
  HAIR_STYLING_AGENT: ["Bath & body", "Hair care"],
  SUNSCREEN: ["Bath & body", "Sun care"],
  BATHWATER_ADDITIVE: ["Bath & body", "Bath soaks"],
  BODY_DEODORANT: ["Bath & body", "Deodorant"],
  LIP_BALM: ["Bath & body", "Lip care"],
  LIP_COLOR: ["Bath & body", "Makeup"],
  NAIL_POLISH: ["Bath & body", "Nail care"],
  MASCARA: ["Bath & body", "Makeup"],
  EYELID_COLOR: ["Bath & body", "Makeup"],
  EYEBROW_COLOR: ["Bath & body", "Makeup"],
  FACE_SHAPING_MAKEUP: ["Bath & body", "Makeup"],
  SKIN_FOUNDATION_CONCEALER: ["Bath & body", "Makeup"],
  COSMETIC_POWDER: ["Bath & body", "Makeup"],
  COSMETIC_BRUSH: ["Bath & body", "Beauty tools"],
  HAIR_COMB: ["Bath & body", "Hair tools"],
  HAIR_BRUSH: ["Bath & body", "Hair tools"],
  MANUAL_SHAVING_RAZOR: ["Bath & body", "Shaving"],
  MOUTHWASH: ["Bath & body", "Oral care"],
  TOOTHBRUSH: ["Bath & body", "Oral care"],
  TOOTH_CLEANING_AGENT: ["Bath & body", "Oral care"],
  SKIN_CLEANING_WIPE: ["Bath & body", "Wipes"],
  ASTRINGENT_SUBSTANCE: ["Bath & body", null],
  PUMP_DISPENSER: ["Bath & body", "Bath accessories"],
  SLEEP_MASK: ["Bath & body", "Sleep & relax"],
  // Food & drink
  GROCERY: ["Food & drink", null],
  COFFEE: ["Food & drink", "Coffee"],
  TEA: ["Food & drink", "Tea"],
  HERB: ["Food & drink", "Spices & herbs"],
  SNACK_MIX: ["Food & drink", "Snacks"],
  SNACK_CHIP_AND_CRISP: ["Food & drink", "Snacks"],
  PRETZEL: ["Food & drink", "Snacks"],
  POPCORN: ["Food & drink", "Snacks"],
  NUTS: ["Food & drink", "Snacks"],
  SNACK_FOOD_BAR: ["Food & drink", "Snacks"],
  FRUIT_SNACK: ["Food & drink", "Snacks"],
  JERKY: ["Food & drink", "Snacks"],
  CRACKER: ["Food & drink", "Snacks"],
  COOKIE: ["Food & drink", "Cookies"],
  CANDY: ["Food & drink", "Confectionery"],
  CHOCOLATE_CANDY: ["Food & drink", "Confectionery"],
  SUGAR_CANDY: ["Food & drink", "Confectionery"],
  SAUCE: ["Food & drink", "Sauces & condiments"],
  CONDIMENT: ["Food & drink", "Sauces & condiments"],
  SALAD_DRESSING: ["Food & drink", "Sauces & condiments"],
  VINEGAR: ["Food & drink", "Sauces & condiments"],
  NUT_BUTTER: ["Food & drink", "Spreads"],
  HONEY: ["Food & drink", "Honey & syrup"],
  EDIBLE_OIL_VEGETABLE: ["Food & drink", "Oils"],
  NOODLE: ["Food & drink", "Pantry"],
  RICE_MIX: ["Food & drink", "Pantry"],
  LEGUME: ["Food & drink", "Pantry"],
  FLOUR: ["Food & drink", "Baking"],
  SUGAR: ["Food & drink", "Baking"],
  BAKING_MIX: ["Food & drink", "Baking"],
  LEAVENING_AGENT: ["Food & drink", "Baking"],
  PANTRY: ["Food & drink", "Pantry"],
  PACKAGED_SOUP_AND_STEW: ["Food & drink", "Pantry"],
  BREAKFAST_CEREAL: ["Food & drink", "Breakfast"],
  DRINK_FLAVORED: ["Food & drink", "Beverages"],
  JUICE_AND_JUICE_DRINK: ["Food & drink", "Beverages"],
  WATER: ["Food & drink", "Beverages"],
  FLAVORED_DRINK_CONCENTRATE: ["Food & drink", "Beverages"],
  MILK_SUBSTITUTE: ["Food & drink", "Beverages"],
  WINE: ["Food & drink", "Wine & spirits"],
  SPIRITS: ["Food & drink", "Wine & spirits"],
  // Kids & baby
  BABY_PRODUCT: ["Kids & baby", null],
  TOY_FIGURE: ["Kids & baby", "Toys"],
  TOYS_AND_GAMES: ["Kids & baby", "Toys & games"],
  PUZZLES: ["Kids & baby", "Puzzles"],
  TOY_SLIME: ["Kids & baby", "Toys"],
  TOY_BUILDING_BLOCK: ["Kids & baby", "Building toys"],
  NON_RIDING_TOY_VEHICLE: ["Kids & baby", "Toys"],
  CHILDRENS_COSTUME: ["Kids & baby", "Costumes"],
  PACIFIER: ["Kids & baby", "Pacifiers"],
  BABY_BOTTLE: ["Kids & baby", "Feeding"],
  KICK_SCOOTER: ["Kids & baby", "Ride-ons"],
  GAME_DICE: ["Kids & baby", "Games"],
  TABLETOP_GAME: ["Kids & baby", "Games"],
  // Pets
  PET_SUPPLIES: ["Pets", null],
  PET_APPAREL: ["Pets", "Pet apparel"],
  ANIMAL_LITTER: ["Pets", "Litter"],
  LITTER_BOX: ["Pets", "Litter"],
  PET_TOY: ["Pets", "Pet toys"],
  ANIMAL_COLLAR: ["Pets", "Collars & leashes"],
  // Garden & outdoor
  OUTDOOR_LIVING: ["Garden & outdoor", null],
  PLANTER: ["Garden & outdoor", "Planters"],
  ABIS_LAWN_AND_GARDEN: ["Garden & outdoor", null],
  WILDLIFE_FEEDER: ["Garden & outdoor", "Bird feeders"],
  FOUNTAIN: ["Garden & outdoor", "Fountains"],
  BARBECUE_GRILL: ["Garden & outdoor", "Grills"],
  TENT: ["Garden & outdoor", "Camping"],
  SLEEPING_BAG: ["Garden & outdoor", "Camping"],
  ICE_CHEST: ["Garden & outdoor", "Coolers"],
  OUTDOOR_RECREATION_PRODUCT: ["Garden & outdoor", "Outdoor recreation"],
  AIR_MATTRESS: ["Garden & outdoor", "Camping"],
  FREESTANDING_SHELTER: ["Garden & outdoor", "Shelters & gazebos"],
  UMBRELLA: ["Garden & outdoor", null],
  AGRICULTURAL_SUPPLIES: ["Garden & outdoor", "Garden"],
};

// Types on which title-keyword overrides may re-route the category.
const OVERRIDE_OK = new Set([
  "HOME", "HOME_FURNITURE_AND_DECOR", "HOME_BED_AND_BATH", "KITCHEN", "ABIS_KITCHEN", "BEAUTY", "ABIS_BEAUTY",
  "HEALTH_PERSONAL_CARE", "OFFICE_PRODUCTS", "PAPER_PRODUCT", "ACCESSORY", "CHAIR", "TABLE", "STOOL_SEATING",
  "OTTOMAN", "BEAN_BAG_CHAIR", "BLANKET", "PILLOW", "RUG", "LAMP", "WALL_ART", "STORAGE_BOX", "BASKET",
  "TEACHING_EQUIPMENT", "EDUCATIONAL_SUPPLIES", "SHOES", "BOOT", "SANDAL", "HAT", "HANDBAG", "BACKPACK",
  "GROCERY", "UMBRELLA", "STICKER_DECAL", "DRINKING_CUP", "BOTTLE", "JAR", "TOTE_BAG", "FLAT_SHEET",
  "LIGHT_FIXTURE", "STRING_LIGHT", "SHELF", "CLOCK", "PICTURE_FRAME", "BENCH", "CURTAIN", "DISHWARE_PLATE",
  "DISHWARE_BOWL", "PLACEMAT", "FIGURINE", "SKIN_MOISTURIZER", "SKIN_CLEANING_AGENT", "SHAMPOO",
  "SKIN_CLEANING_WIPE", "TOY_FIGURE", "TOYS_AND_GAMES", "AREA_DEODORIZER", "PET_SUPPLIES", "OUTDOOR_LIVING",
  "SPORTING_GOODS", "BAG", "WALLET", "SUNSCREEN", "PLANTER", "LEGUME", "COOKIE", "CRACKER", "SNACK_MIX",
]);

const RX = {
  pet: /\b(dogs?|puppy|puppies|kitten|kittens|cat tree|cat bed|cat condo|cat scratch\w*|cat litter|pet bed|pet bowl|pet food|pets?|feline|canine|chew toy|leash)\b/i,
  petNeg: /\b(hot dog|cat eye|dog[- ]?ear|catwalk|doggy bag|puppy love|kitten heel|print|framed?|canvas|poster|wall art|artwork|pillow|cushion|mug|t-shirt|tee|socks?|pajamas?|costume|ornament|figurine|statue|sculpture|bookend|doorstop|ring dish|necklace|earrings?|charm|bracelet)\b/i,
  kids: /\b(kids?|kid's|children|children's|child's|toddlers?|baby(?!\s*(blue|pink|soft))|babies|infants?|nursery|newborn|boys?|girls?|boy's|girl's|youth|crib|kindergarten|preschool|plush|stuffed animal|teether|teething)\b/i,
  babyFood: /\b(baby food|infant formula|toddler formula|baby cereal|baby puree)\b/i,
  candle: /\b(candles?|tealights?|tea lights?|wax melts?|diffusers?|reed diffuser|incense|potpourri|room spray|air freshener|perfume|eau de (parfum|toilette|cologne)|cologne|fragrance mist|body mist|aromatherapy|scented)\b/i,
  candleBeauty: /\b(perfume|eau de (parfum|toilette|cologne)|cologne|fragrance mist|body mist|aromatherapy|essential oil|diffuser|candle)\b/i,
  book: /\b(notebooks?|journals?|planners?|diary|diaries|sketchbooks?|sketch book|notepads?|note pad|composition book|guest book|address book|memo book|cookbook|books?)\b/i,
  bookNeg: /\b(bookshelf|bookshelves|bookcase|bookcases|bookends?|book\s?shelf|book\s?case|book\s?end|bookmarks?|book light|book stand|book display|book rack|book art|e-?books?|kindle|book reader|book holder|notebook computer|laptop|checkbook|passbook|book bag|bookbag|steno)\b/i,
  candleHolder: /\b(candle ?holders?|candlesticks?|candle stands?|candelabras?|tealight (holders?|globes?|lanterns?)|candle (lanterns?|globes?|sconces?)|hurricanes?|votive holders?)\b/i,
  garden: /\b(outdoor|patio|garden|balcony|porch|poolside|lawn|backyard|deck|camping|picnic|bird ?feeder|bird ?bath)\b/i,
  perishable: /\b(cream|milk|cheese|yogurt|yoghurt|butter(?!\s*(cookie|cracker|toffee|pecan))|eggs?|chicken|beef|pork|turkey|salmon|tuna|fish|shrimp|steak|sausage|bacon|ham|deli|frozen|ice cream|fresh|salad|sandwich|sushi|tofu|hummus|dip|smoothie|kombucha|bread|bagels?|muffins?|cakes?|pies?|pastry|dough|tortillas?|lettuce|spinach|kale|carrots?|onions?|potato(es)?|tomato(es)?|peppers?|broccoli|celery|cucumber|melon|mango|pineapple|lemons?|limes?|oranges?|apples?|bananas?|grapes|berries|strawberr\w+|blueberr\w+|avocado|guacamole|wraps?|burrito|pizza|lasagna|meal|entree|dinner|lunch|bowl|juice|sparkling water|soda|water|pt\b|quart|gallon|half gallon|lb\b|pound)\b/i,
  dims: /\b\d+(\.\d+)?\s*(cm|mm|in|inch|inches|ft|feet|['"”″′])?\s*(x|×|by)\s*\d+(\.\d+)?(\s*(x|×|by)\s*\d+(\.\d+)?)?\s*(cm|mm|in|inch|inches|ft|feet|['"”″′]|-inch|-in)?(?![A-Za-z0-9])/gi,
  units: /\b\d+(\.\d+)?\s*[-–]?\s*(fl\.?\s*oz|fluid\s*ounces?|fz|oz|ounces?|lbs?|pounds?|ml|l|liters?|litres?|g|grams?|kg|mg|mm|cm|m|meters?|metres?|yds?|yards?|inch|inches|in(?!\s*[-–]?\s*\d)|ft|feet|foot|pt|qt|quarts?|gal|gallons?|w|watts?|v|volts?|mah|gsm|tc|thread count|count|ct|pcs?|pieces?(?=\s*(pack|set|$))|pairs?|sheets?|pages?|labels?|units?)\b\.?/gi,
};

// ---------------------------------------------------------------------------
// Subcategory derivation (for generic product types)
// ---------------------------------------------------------------------------

const SUB = {
  "Home decor": [
    [/\b(wall ?clock|clock)\b/i, "Clocks"],
    [/\bmirror/i, "Mirrors"],
    [/\b(photo|picture) frame|\bframe\b/i, "Frames"],
    [/\bvase/i, "Vases"],
    [/\b(lamp|lantern|sconce|chandelier|pendant light|light fixture|lighting)\b/i, "Lighting"],
    [/\b(pillow|cushion|sham)\b/i, "Pillows"],
    [/\b(throw|blanket|quilt|coverlet)\b/i, "Throws"],
    [/\b(curtain|drape|valance|blind|shade)\b/i, "Curtains"],
    [/\b(sheet|comforter|duvet|bedding|bed in a bag|mattress pad|pillowcase|bed skirt)\b/i, "Bedding"],
    [/\b(towel|bath mat|bath rug|shower curtain|bathroom)\b/i, "Bath textiles"],
    [/\b(rug|runner|carpet|doormat|door mat)\b/i, "Rugs"],
    [/\b(wall art|wall decor|wall décor|canvas|print|poster|painting|artwork|photograph|tapestry|wall hanging)\b/i, "Wall art"],
    [/\b(basket|bin|storage|organizer|hamper|box)\b/i, "Storage"],
    [/\btray\b/i, "Trays"],
    [/\b(shelf|shelves|ledge|bookcase|bookshelf)\b/i, "Shelving"],
    [/\b(figurine|statue|sculpture|bust)\b/i, "Sculpture"],
    [/\b(planter|plant pot|faux plant|artificial plant)\b/i, "Planters"],
    [/\b(ottoman|pouf)\b/i, "Ottomans"],
    [/\b(stool)\b/i, "Stools"],
    [/\b(bench)\b/i, "Benches"],
    [/\b(chair|recliner|seat)\b/i, "Chairs"],
    [/\b(table|desk|nightstand|console)\b/i, "Tables"],
    [/\b(candle|candleholder)/i, "Candle holders"],
    [/\b(hook|hanger|rack)\b/i, "Wall hooks"],
  ],
  "Kitchen & tabletop": [
    [/\b(mug|cup|tumbler|glass|glasses|goblet|stemware|wine glass|drinkware)\b/i, "Drinkware"],
    [/\b(bottle|flask|thermos)\b/i, "Bottles"],
    [/\b(plate|dinnerware|dish set|place setting)\b/i, "Dinnerware"],
    [/\b(bowl)\b/i, "Bowls"],
    [/\b(pitcher|carafe|jug|decanter)\b/i, "Pitchers"],
    [/\b(flatware|cutlery|silverware|spoon|fork)\b/i, "Flatware"],
    [/\b(knife|knives)\b/i, "Knives"],
    [/\b(cutting board|chopping board)\b/i, "Cutting boards"],
    [/\b(pan|skillet|pot|cookware|dutch oven|wok|saucepan|stockpot)\b/i, "Cookware"],
    [/\b(bakeware|baking|cake pan|muffin|sheet pan|loaf pan|cookie cutter|ramekin)\b/i, "Bakeware"],
    [/\b(placemat|napkin|table runner|tablecloth|table linen)\b/i, "Table linens"],
    [/\b(coaster)\b/i, "Coasters"],
    [/\b(jar|canister|container|storage)\b/i, "Jars & canisters"],
    [/\b(tray|platter|serving|serveware|cake stand|board)\b/i, "Serveware"],
    [/\b(apron|oven mitt|pot holder|dish towel|tea towel)\b/i, "Kitchen linens"],
    [/\b(shaker|grinder|salt|pepper)\b/i, "Salt & pepper"],
    [/\b(corkscrew|bar|cocktail|ice|straw|opener)\b/i, "Barware"],
    [/\b(teapot|kettle|tea infuser|french press|pour ?over|coffee)\b/i, "Coffee & tea"],
  ],
  "Candles & fragrance": [
    [/\b(candle)/i, "Candles"],
    [/\b(diffuser)/i, "Diffusers"],
    [/\b(perfume|eau de|cologne|fragrance mist|body mist)\b/i, "Perfume"],
    [/\b(wax melt)/i, "Wax melts"],
    [/\b(incense)/i, "Incense"],
    [/\b(essential oil|aromatherapy)/i, "Essential oils"],
    [/\b(room spray|air freshener|freshener|deodorizer|odor)/i, "Room fragrance"],
    [/\b(potpourri|sachet)/i, "Potpourri"],
  ],
  "Stationery & paper": [
    [/\b(marker|highlighter)s?\b/i, "Markers"],
    [/\b(pen|pencil|ballpoint|gel pen|fountain pen|rollerball)s?\b/i, "Pens & pencils"],
    [/\b(binder|folder|divider|portfolio|file)s?\b/i, "Folders & binders"],
    [/\b(sticky note|post-?it|self-stick)s?\b/i, "Sticky notes"],
    [/\b(label)s?\b/i, "Labels"],
    [/\b(envelope)s?\b/i, "Envelopes"],
    [/\b(greeting card|cards?|card stock|cardstock)\b/i, "Cards"],
    [/\b(calendar|planner)\b/i, "Calendars"],
    [/\b(sticker|decal)s?\b/i, "Stickers"],
    [/\b(paper|stationery|notepad|pad)\b/i, "Paper"],
    [/\b(whiteboard|white board|dry erase|chalkboard|corkboard|bulletin board|board)\b/i, "Boards"],
    [/\b(stapler|staples|scissors|tape|ruler|hole punch|clips?|push pins?|thumbtacks?)\b/i, "Desk tools"],
    [/\b(organizer|desk|tray|holder|caddy)\b/i, "Desk accessories"],
    [/\b(paint|brush|craft|crayon|chalk|glue|art)\b/i, "Art supplies"],
    [/\b(gift wrap|wrapping paper|tissue paper|ribbon)\b/i, "Gift wrap"],
  ],
  "Books & journals": [
    [/\b(journal)s?\b/i, "Journals"],
    [/\b(planner)s?\b/i, "Planners"],
    [/\b(diary|diaries)\b/i, "Journals"],
    [/\b(sketch ?book)s?\b/i, "Sketchbooks"],
    [/\b(notepad|note pad|memo)s?\b/i, "Notepads"],
    [/\b(notebook|composition book)s?\b/i, "Notebooks"],
    [/\b(bookend)s?\b/i, "Bookends"],
    [/\b(guest book|address book|cookbook|book)s?\b/i, "Books"],
  ],
  Apparel: [
    [/\b(boot|bootie|chelsea)s?\b/i, "Boots"],
    [/\b(sandal|flip[- ]?flop|slide|thong)s?\b/i, "Sandals"],
    [/\b(sneaker|trainer|running shoe|athletic shoe|tennis shoe)s?\b/i, "Sneakers"],
    [/\b(loafer|moccasin|driving shoe)s?\b/i, "Loafers"],
    [/\b(heel|pump|stiletto|wedge)s?\b/i, "Heels"],
    [/\b(flat|ballet|ballerina)s?\b/i, "Flats"],
    [/\b(slipper|mule|clog)s?\b/i, "Slippers & mules"],
    [/\b(oxford|derby|brogue|dress shoe|monk strap)s?\b/i, "Dress shoes"],
    [/\b(scarf|scarves|bandana|gaiter|shawl|wrap|pashmina)\b/i, "Scarves"],
    [/\b(glove|mitten)s?\b/i, "Gloves"],
    [/\b(sock)s?\b/i, "Socks"],
    [/\b(belt)s?\b/i, "Belts"],
    [/\b(hat|cap|beanie|beret|fedora|visor|headband)s?\b/i, "Hats"],
    [/\b(earmuff|ear muff|ear warmer)s?\b/i, "Cold-weather accessories"],
    [/\b(tie|bow tie|necktie)s?\b/i, "Neckties"],
    [/\b(dress|gown|kurta|salwar|lehenga|saree|sari)\b/i, "Dresses & sets"],
    [/\b(shirts?|tees?|t-shirts?|tops|tank top|crop top|blouses?|tunics?)\b/i, "Tops"],
    [/\b(sweater|cardigan|pullover|hoodie|sweatshirt|fleece)s?\b/i, "Sweaters"],
    [/\b(jacket|coat|parka|vest|blazer)s?\b/i, "Outerwear"],
    [/\b(pant|jean|trouser|legging|short|skirt)s?\b/i, "Bottoms"],
    [/\b(pajama|pyjama|sleepwear|robe|nightgown|loungewear)s?\b/i, "Sleepwear"],
    [/\b(shoe)s?\b/i, "Shoes"],
  ],
  "Jewelry & accessories": [
    [/\b(necklace|pendant|chain|choker|locket)s?\b/i, "Necklaces"],
    [/\b(bracelet|bangle|cuff)s?\b/i, "Bracelets"],
    [/\b(anklet)s?\b/i, "Anklets"],
    [/\b(earring|ear ?stud|hoop|stud)s?\b/i, "Earrings"],
    [/\b(ring|band)s?\b/i, "Rings"],
    [/\b(charm)s?\b/i, "Charms"],
    [/\b(brooch|pin)s?\b/i, "Brooches"],
    [/\b(watch)es?\b/i, "Watches"],
    [/\b(sunglass|sunglasses)\b/i, "Sunglasses"],
    [/\b(eyeglass|reading glass|glasses|frames)\b/i, "Eyewear"],
    [/\b(handbag|purse|satchel|crossbody|shoulder bag|hobo|clutch)s?\b/i, "Handbags"],
    [/\b(wallet|card holder|cardholder|coin purse)s?\b/i, "Wallets"],
    [/\b(backpack|rucksack)s?\b/i, "Backpacks"],
    [/\b(tote)s?\b/i, "Tote bags"],
    [/\b(pouch|cosmetic bag|makeup bag|toiletry)/i, "Pouches"],
    [/\b(hair ?clip|hair ?band|scrunchie|barrette|hair tie|headband|hair accessor)/i, "Hair accessories"],
    [/\b(keychain|key ring|keyring)s?\b/i, "Keychains"],
    [/\b(jewelry box|jewelry organizer|jewelry case|ring dish)/i, "Jewelry boxes"],
    [/\b(scarf|scarves)\b/i, "Scarves"],
    [/\b(bag|duffel|weekender)s?\b/i, "Bags"],
    [/\b(umbrella)s?\b/i, "Umbrellas"],
  ],
  "Bath & body": [
    [/\b(soap|bar soap|hand wash|handwash|body wash|shower gel|cleanser|face wash|facial cleanser)\b/i, "Cleansers & soap"],
    [/\b(lotion|moisturizer|moisturiser|body butter|body cream|hand cream|face cream|balm|salve)\b/i, "Moisturizers"],
    [/\b(shampoo|conditioner|hair mask|hair oil|hair serum|hair spray|dry shampoo|pomade|hair gel|hair care)\b/i, "Hair care"],
    [/\b(bath bomb|bath salt|bath soak|bubble bath|epsom|bath oil)\b/i, "Bath soaks"],
    [/\b(scrub|exfoliat)/i, "Scrubs"],
    [/\b(sunscreen|spf|sun care|after sun)\b/i, "Sun care"],
    [/\b(deodorant|antiperspirant)\b/i, "Deodorant"],
    [/\b(lip balm|chapstick|lip care)\b/i, "Lip care"],
    [/\b(lipstick|lip gloss|lip color|mascara|eyeliner|eye shadow|eyeshadow|foundation|concealer|blush|bronzer|highlighter|primer|makeup|make-up|nail polish|nail lacquer)\b/i, "Makeup"],
    [/\b(serum|toner|face mask|sheet mask|facial|skin care|skincare|eye cream|essence|face oil)\b/i, "Skin care"],
    [/\b(razor|shave|shaving|beard|aftershave)\b/i, "Shaving"],
    [/\b(toothbrush|toothpaste|mouthwash|floss|oral care|teeth)\b/i, "Oral care"],
    [/\b(brush|sponge|applicator|tweezer|nail file|nail clipper|comb)\b/i, "Beauty tools"],
    [/\b(wipe)s?\b/i, "Wipes"],
    [/\b(cotton|swab|pad|round)s?\b/i, "Cotton & pads"],
    [/\b(loofah|bath sponge|bath brush|shower cap|bath accessor|soap dispenser|soap dish|toothbrush holder)/i, "Bath accessories"],
    [/\b(essential oil|massage oil|body oil)\b/i, "Body oils"],
    [/\b(sleep mask|eye mask|relax)/i, "Sleep & relax"],
    [/\b(gift set|bath set|spa set|kit)\b/i, "Gift sets"],
  ],
  "Food & drink": [
    [/\b(coffee|espresso|k-cup|cold brew)\b/i, "Coffee"],
    [/\b(tea|matcha|chai)\b/i, "Tea"],
    [/\b(chocolate|candy|candies|gummies|gummy|licorice|toffee|caramels?|truffles?|mints?)\b/i, "Confectionery"],
    [/\b(cookie|biscuit|wafer|biscotti|shortbread)s?\b/i, "Cookies"],
    [/\b(chips?|crisps?|popcorn|pretzels?|crackers?|nuts?|cashews?|almonds?|pistachios?|walnuts?|pecans?|peanuts?|trail mix|jerky|granola|snack)\b/i, "Snacks"],
    [/\b(sauce|ketchup|mustard|dressing|vinegar|marinade|salsa|hot sauce|mayo|mayonnaise|relish|pickles?|condiment|sriracha)\b/i, "Sauces & condiments"],
    [/\b(honey|syrup|maple|agave|molasses)\b/i, "Honey & syrup"],
    [/\b(jam|jelly|preserves?|marmalade|spread|nut butter|peanut butter|almond butter|tahini)\b/i, "Spreads"],
    [/\b(olive oil|avocado oil|coconut oil|sesame oil|cooking oil|oil)\b/i, "Oils"],
    [/\b(spice|seasoning|salt|peppercorn|cinnamon|turmeric|cumin|paprika|herbs?|oregano|basil|thyme|garlic powder|chili powder|curry powder|vanilla|extract)\b/i, "Spices & herbs"],
    [/\b(pasta|noodles?|rice|quinoa|lentils?|beans?|chickpeas|grains?|couscous|farro|oats?|oatmeal|cereal|broth|stock|soup|canned|tomatoes|coconut milk)\b/i, "Pantry"],
    [/\b(flour|sugar|baking|yeast|cocoa|cake mix|brownie mix|pancake mix|sprinkles)\b/i, "Baking"],
    [/\b(water|soda|sparkling|drink|juice|lemonade|kombucha|tonic|beverage|seltzer|cider|smoothie)\b/i, "Beverages"],
    [/\b(wine|whisky|whiskey|vodka|gin|rum|beer|bourbon|tequila|liqueur|champagne|prosecco)\b/i, "Wine & spirits"],
    [/\b(protein|bar)s?\b/i, "Snacks"],
  ],
  "Kids & baby": [
    [/\b(wipe)s?\b/i, "Baby care"],
    [/\b(diaper|nappy|nappies)\b/i, "Diapers"],
    [/\b(bottle|sippy|feeding|bib|burp cloth|pacifier|teether|teething|formula|baby food)\b/i, "Feeding & soothing"],
    [/\b(lotion|shampoo|wash|bath|balm|cream|powder|sunscreen)\b/i, "Baby care"],
    [/\b(chair|recliner|table|desk|bean bag|stool|bookcase|storage|hamper|rug|lamp|decor|wall|curtain)\b/i, "Kids room"],
    [/\b(blanket|swaddle|crib|nursery|sheet|bedding|duvet|comforter|quilt|pillow|mobile|night light|nightlight)\b/i, "Nursery"],
    [/\b(stuffed|plush|doll|figure|figurine|action figure|toy|toys|playset|play set)\b/i, "Toys"],
    [/\b(puzzle)s?\b/i, "Puzzles"],
    [/\b(block|building|lego|magnetic tiles)\b/i, "Building toys"],
    [/\b(game|dice|cards)\b/i, "Games"],
    [/\b(book|flash ?card|learning|educational|alphabet|counting|stem)\b/i, "Learning"],
    [/\b(craft|art|crayon|paint|coloring|stickers?|slime|play-?doh|clay)\b/i, "Arts & crafts"],
    [/\b(costume|dress[- ]up)\b/i, "Costumes"],
    [/\b(shoe|sneaker|sandal|boot|slipper)s?\b/i, "Kids shoes"],
    [/\b(hat|glove|mitten|scarf|sock|beanie|accessor)/i, "Kids accessories"],
    [/\b(shirt|tee|dress|pant|pajama|onesie|bodysuit|romper|jacket|hoodie|legging|outfit|leotard)s?\b/i, "Kids apparel"],
    [/\b(backpack|lunch|bag|bottle)\b/i, "Kids accessories"],
    [/\b(scooter|bike|ride-?on|wagon|tricycle)\b/i, "Ride-ons"],
    [/\b(carrier|stroller|car seat|monitor|gate)\b/i, "Baby gear"],
  ],
  Pets: [
    [/\b(dog food|cat food|kibble|wet food|dry food|puppy food|kitten food)\b/i, "Pet food"],
    [/\b(waste bag|poop bag|pee pad|training pad|puppy pad)s?\b/i, "Waste & training"],
    [/\b(treat|chew|jerky|biscuit)s?\b/i, "Treats"],
    [/\b(bed|pillow|cushion|mat|blanket|condo|tree|perch|hammock|sofa|couch|lounger|scratch\w*)\b/i, "Pet beds & furniture"],
    [/\b(toy|ball|rope|plush|squeak|tug|teaser|wand|catnip)s?\b/i, "Pet toys"],
    [/\b(leash|collar|harness|lead|tag)s?\b/i, "Collars & leashes"],
    [/\b(bowl|feeder|fountain|water bottle|placemat)s?\b/i, "Bowls & feeders"],
    [/\b(litter|scoop)\b/i, "Litter"],
    [/\b(crate|carrier|kennel|cage|playpen|gate)s?\b/i, "Crates & carriers"],
    [/\b(shampoo|brush|comb|grooming|nail|wipes?|deshedding)\b/i, "Grooming"],
    [/\b(sweater|coat|jacket|apparel|bandana|costume|raincoat|shirt|hoodie)\b/i, "Pet apparel"],
    [/\b(waste bag|poop bag|pee pad|training pad|puppy pad)s?\b/i, "Waste & training"],
    [/\b(supplement|vitamin|dental|flea|tick)\b/i, "Pet health"],
    [/\b(aquarium|fish|tank|reptile|bird|hamster|rabbit|guinea)\b/i, "Small pets & aquatics"],
  ],
  "Garden & outdoor": [
    [/\b(planter|plant pot|flower pot|pot|hanging basket|window box|raised bed)s?\b/i, "Planters"],
    [/\b(bird ?feeder|bird ?bath|birdhouse|bird house|hummingbird)\b/i, "Bird feeders"],
    [/\b(patio umbrella|market umbrella|cantilever|shade sail|umbrella base)\b/i, "Patio umbrellas"],
    [/\b(fire pit|firepit|chiminea|fire bowl|fire table)\b/i, "Fire pits"],
    [/\b(grill|bbq|barbecue|smoker|grilling)\b/i, "Grills & grilling"],
    [/\b(cushion|pillow|seat pad)s?\b/i, "Outdoor cushions"],
    [/\b(chair|sofa|loveseat|table|dining set|conversation set|bench|chaise|lounger|sectional|ottoman|stool|bar set|bistro)\b/i, "Patio furniture"],
    [/\b(hammock|swing|daybed)\b/i, "Hammocks & swings"],
    [/\b(lantern|solar light|string light|torch|path light|outdoor light|landscape light)\b/i, "Outdoor lighting"],
    [/\b(rug|mat|doormat)\b/i, "Outdoor rugs"],
    [/\b(garden tool|trowel|pruner|shears?|rake|shovel|hoe|spade|weeder|gloves?|kneeler|watering can|hose|sprinkler|nozzle)\b/i, "Garden tools"],
    [/\b(seed|bulb|plant|tree|shrub|succulent|herb kit|grow kit|soil|fertilizer|compost|mulch)s?\b/i, "Plants & seeds"],
    [/\b(tent|sleeping bag|camp|hiking|backpacking|cooler|camping)\b/i, "Camping"],
    [/\b(gazebo|canopy|pergola|shelter|awning|shade)\b/i, "Shelters & gazebos"],
    [/\b(fountain|statue|gnome|wind chime|windchime|garden decor|garden stake|yard art|weathervane|plaque)\b/i, "Garden decor"],
    [/\b(trellis|arbor|obelisk|fence|edging|stakes?)\b/i, "Garden structures"],
    [/\b(pool|beach|towel|float|picnic|blanket)\b/i, "Beach & picnic"],
    [/\b(cover|protector)s?\b/i, "Furniture covers"],
  ],
};

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

// Products whose title matches these are dropped regardless of type (utility / off-brand for a gift marketplace).
const HARD_SKIP = /\b(replacement|refill cartridge|battery|batteries|charger|usb|hdmi|bluetooth|wifi|wi-fi|electric|electrical|cordless|corded|voltage|watt|led bulb|light bulb|bulbs?|power strip|extension cord|surge|socket|schuko|plug|phone case|iphone|galaxy|xiaomi|redmi|oneplus|samsung|mobile cover|back cover|screen protector|laptop|tablet|kindle|printer|toner|ink cartridge|adapter|cable|mount|bracket|hardware|screw|bolt|hinge|drawer slide|ladder|toilet|plunger|urinal|trash bag|garbage bag|detergent|bleach|disinfect|sanitizer|cleaner|cleaning|mop|broom|dustpan|vacuum|pest|insect|rodent|mouse trap|medic|pharma|tablets?|capsules?|softgels?|supplement|vitamin|probiotic|prescription|condom|lubricant|pregnancy test|thermometer|blood pressure|glucose|nicotine|cigarette|vape|knife sharpener|lawn mower|chainsaw|generator|automotive|car seat cover|steering|tire|wiper|engine|motor oil|3d printer|filament|prime video|fire tv|echo dot|alexa|subscription|gift card|e-gift|digital code|download|swatch|sample|20(1\d|2[0-4]))\b/i;

// Marketplaces whose en_* titles are genuinely English (JP/DE/etc. rows carry romanized "en_US" titles).
const EN_COUNTRIES = new Set(["US", "GB", "UK", "CA", "AU", "IN", "SG", "AE"]);

function normalizeText(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBrand(raw) {
  let b = normalizeText(raw);
  // "Amazonベーシック(AmazonBasics)" -> "AmazonBasics"; "Happy Belly (ハッピーベリー)" -> "Happy Belly"
  const paren = b.match(/\(([^)]*)\)/);
  if (paren) {
    const inner = paren[1].trim();
    const outer = b.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    b = /^[\x20-\x7e]+$/.test(outer) && outer ? outer : /^[\x20-\x7e]+$/.test(inner) ? inner : outer;
  }
  b = b.replace(/^\s*amazon\s*brand\s*[-–—:]?\s*/i, "");
  b = b.replace(/\s+by\s+amazon(\.com)?\s*$/i, "");
  if (/^amazon\s*basics$/i.test(b)) b = "AmazonBasics";
  if (/^(365|whole foods market)/i.test(b)) b = b.replace(/\bWHOLE FOODS MARKET\b/, "Whole Foods Market");
  const letters = b.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5 && letters === letters.toUpperCase()) b = b.split(" ").map(titleCaseWord).join(" ");
  if (!/^[\x20-\x7e]+$/.test(b)) b = b.replace(/[^\x20-\x7e]+/g, "").trim();
  return b.trim() || "—";
}

// ---------------------------------------------------------------------------
// Text helpers
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

const ACRONYMS = new Set(["USA", "UK", "US", "EU", "LED", "USB", "BPA", "UV", "SPF", "BBQ", "XL", "XXL", "XS", "DIY", "OEKO", "TEX", "GOTS", "FSC", "PU", "PVC", "BCAA", "MCT", "K"]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCaseWord(w) {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
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

const HOUSE_BRANDS = /^\s*(amazon\s*basics|amazonbasics|amazon\s*commercial|amazoncommercial|amazon\s*elements|amazon\s*essentials|amazon\s*kitchen|amazon\s*collection|amazon\s*aware|solimo|pinzon|rivet|stone\s*&\s*beam|strathwood|ravenna\s*home|365\s*everyday\s*value|365\s*by\s*whole\s*foods\s*market|whole\s*foods\s*market|happy\s*belly|mama\s*bear|presto!?|wag|whole\s*paws|wickedly\s*prime|eono|umi|the\s*fix|find\.?|goodthreads|daily\s*ritual|lark\s*&\s*ro|core\s*10|peak\s*velocity|206\s*collective|franklin\s*tailored|the\s*drop|belei|denali|kitzini|movian|alkove|nod|truly\s*free|simple\s*joys\s*by\s*carter's|spotted\s*zebra|buttoned\s*down|jam\s*&\s*honey|moon\s*and\s*back|red\s*wagon|allegro\s*coffee)\b\.?\s*(by\s+amazon(\.com)?)?\s*[-–—:|,]?\s*/i;

function cleanName(raw, brand) {
  let s = normalizeText(raw);
  // parentheticals / brackets first (sizes, SKUs, color codes, "[Find]")
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  // Amazon private-label prefixes (may repeat: "Amazon Brand - Solimo Solimo ...")
  for (let i = 0; i < 3; i++) {
    s = s.replace(/^\s*amazon\s*brand\s*[-–—:]?\s*/i, "");
    s = s.replace(/^\s*by\s+amazon(\.com)?\s*[-–—:|]?\s*/i, "");
    if (brand && brand !== "—") {
      const b = escapeRegex(brand.replace(/[.!]+$/, ""));
      s = s.replace(new RegExp(`^\\s*amazon\\s*[-–—:]?\\s*(?=${b}\\b)`, "i"), "");
      s = s.replace(new RegExp(`^\\s*${b}\\b\\.?\\s*(by\\s+amazon(\\.com)?)?\\s*[-–—:|,]?\\s*`, "i"), "");
      s = s.replace(new RegExp(`\\s+by\\s+${b}\\b\\.?`, "i"), "");
    }
    s = s.replace(HOUSE_BRANDS, "");
  }
  s = s.replace(/\b(amazon\s*exclusive|amazon\s*brand|amazon's\s*choice|amazon\s*basics|amazonbasics)\b\s*[-–—:]?\s*/gi, " ");
  // n-in-1 protection
  s = s.replace(/\b(\d)\s*-?\s*in\s*-?\s*1\b/gi, "$1-in-1");
  // pack counts ("Pack of 6", "6-Pack", "3 x ...", "x 2")
  s = s.replace(/\b(pack|case|box|bag|bundle|carton|lot|multipack)\s+of\s+\d+\b/gi, " ");
  s = s.replace(/\b\d+\s*[-–]?\s*(pack|pk|count|ct|pcs|pc|pairs?)\b\.?/gi, " ");
  s = s.replace(/^\s*\d+\s*[x×]\s+(?=[A-Za-z])/i, "");
  s = s.replace(/\b[x×]\s*\d+\b/gi, " ");
  // fractions ("3/4", "1/2")
  s = s.replace(/\b\d+\s*\/\s*\d*\b/g, " ");
  // dimensions
  s = s.replace(RX.dims, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*(["”″′]|'')\s*([whdl]\b)?/gi, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*[-–]?\s*(inch|inches|in|cm|mm|ft|feet)\s*[-–]?\s*(w|h|d|l|wide|high|deep|long|tall)\b/gi, " ");
  // units / weights / volumes
  s = s.replace(RX.units, " ");
  // clothing / shoe sizes
  s = s.replace(/\b(size\s*)?\d+(\.\d+)?\s*(b|d|m|w|wide|narrow|medium|regular)?\s*(us|uk|eu|eur|au|cn)\b/gi, " ");
  s = s.replace(/\b(us|uk|eu|eur)\s*(size\s*)?\d+(\.\d+)?\b/gi, " ");
  s = s.replace(/\bsize\s*[:\-]?\s*(xs|s|m|l|xl|xxl|xxxl|os|one size|\d+(\.\d+)?)\b/gi, " ");
  s = s.replace(/\b(xs|xxl|xxxl|xl)\b/g, " ");
  s = s.replace(/\bone size\b/gi, " ");
  s = s.replace(/,\s*(small|medium|large|x-large|extra large)\s*$/i, "");
  // SKU-ish tokens: >=3 digits + a letter, length >=5, any case; long digit runs; slash codes; "Model XYZ"
  s = s.replace(/\b(?=[A-Za-z0-9_/-]{5,}\b)(?=[A-Za-z0-9_/-]*\d[A-Za-z0-9_/-]*\d[A-Za-z0-9_/-]*\d)(?=[A-Za-z0-9_/-]*[A-Za-z])[A-Za-z0-9_/-]+\b/g, " ");
  s = s.replace(/\b(?=[A-Z0-9/_-]{6,}\b)(?=[A-Z0-9/_-]*\d)(?=[A-Z0-9/_-]*[A-Z])[A-Z0-9/_-]+\b/g, " ");
  s = s.replace(/\b\d{6,}[\d-]*\b/g, " ");
  s = s.replace(/\b[A-Z0-9]+\/[A-Z0-9/]+\b/g, " ");
  s = s.replace(/\b(model|sku|item|part|style)\s*(no\.?|number|#)?\s*:?\s*[A-Z0-9-]+\b/gi, " ");
  // marketing junk
  s = s.replace(/\b(new arrival|new|hot sale|best ?seller|premium quality|high quality|top quality|100%\s*(pure|natural|genuine|authentic)|free shipping|limited edition|value pack|family pack|bulk|wholesale|exclusive|official|original|genuine|authentic|brand new|great gift|gift idea|perfect gift|for (men|women|kids|boys|girls|him|her)( and (men|women|kids|boys|girls|him|her))?)\b/gi, " ");
  // stray quotes / plus signs / dangling ampersands and single letters after dashes
  s = s.replace(/["”″′]/g, " ");
  s = s.replace(/(?<![A-Za-z])'|'(?![A-Za-z])/g, " ");
  s = s.replace(/(^|[\s,])\+(?=[\s,]|$)/g, "$1");
  s = s.replace(/(^|,)\s*&\s*(?=,|$)/g, "$1");
  s = s.replace(/,\s*&\s+/g, ", ");
  s = s.replace(/\s[-–—]\s*[A-Za-z]\s*$/g, "");
  // separators & whitespace
  s = s.replace(/\s*[-–—]\s*,/g, ",");
  s = s.replace(/,\s*[-–—]\s*/g, ", ");
  s = s.replace(/\s*[,;:|]\s*(?=[,;:|.])/g, "");
  s = s.replace(/[,.;:]{2,}/g, ",");
  s = s.replace(/\s*[-–—]\s*[-–—]\s*/g, " - ");
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/\s+([,;:.!?])/g, "$1");
  s = s.replace(/([,;:])\s*\1+/g, "$1");
  s = s.replace(/(,\s*)+$/g, "");
  s = s.replace(/^[\s,;:.\-–—|&/]+|[\s,;:.\-–—|&/]+$/g, "");
  // trailing stray numbers ("..., 6." / "... 12") but keep "Set of 4"
  s = s.replace(/(?<!\bof)[,\s]+\d+(\.\d+)?\.?$/g, "");
  s = s.replace(/^[\s,;:.\-–—|&/]+|[\s,;:.\-–—|&/]+$/g, "");
  s = s.replace(/\s{2,}/g, " ");
  s = fixCaps(s);
  s = truncateWords(s, 70);
  return s.trim();
}

function pickEnglish(arr) {
  if (!Array.isArray(arr)) return [];
  const pref = ["en_US", "en_GB", "en_CA", "en_AU", "en_IN", "en_SG", "en_AE"];
  const en = arr.filter((x) => x && typeof x.value === "string" && /^en_/.test(x.language_tag || ""));
  en.sort((a, b) => pref.indexOf(a.language_tag) - pref.indexOf(b.language_tag));
  return en.map((x) => x.value);
}

function extractColors(colorField, title) {
  const out = new Set();
  const src = [colorField || "", title || ""].join(" | ").toLowerCase();
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

function deriveSub(category, title, fallback) {
  const rules = SUB[category] || [];
  for (const [rx, label] of rules) if (rx.test(title)) return label;
  return fallback || FALLBACK_SUB[category];
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

function categorize(pt, title, text) {
  const mapped = PT[pt];
  const t = title;
  const overrideOk = OVERRIDE_OK.has(pt);

  // Keyword overrides, most specific first.
  if (overrideOk || mapped) {
    const isFood = mapped && mapped[0] === "Food & drink";
    const isPet = mapped && mapped[0] === "Pets";
    const isKids = mapped && mapped[0] === "Kids & baby";
    if (!isFood && !isPet && overrideOk && RX.pet.test(t) && !RX.petNeg.test(t)) {
      return ["Pets", deriveSub("Pets", t)];
    }
    if (isFood && RX.babyFood.test(t)) return ["Kids & baby", "Baby food"];
    if (!isFood && !isPet && !isKids && RX.kids.test(t)) {
      return ["Kids & baby", deriveSub("Kids & baby", t)];
    }
    if (overrideOk && (pt === "BEAUTY" || pt === "ABIS_BEAUTY" || pt === "HEALTH_PERSONAL_CARE" || pt === "SKIN_MOISTURIZER" || pt === "SKIN_CLEANING_AGENT")) {
      if (RX.candleBeauty.test(t)) return ["Candles & fragrance", deriveSub("Candles & fragrance", t)];
    } else if (overrideOk && !isFood && RX.candleHolder.test(t)) {
      return ["Candles & fragrance", "Candle holders"];
    } else if (overrideOk && !isFood && RX.candle.test(t)) {
      return ["Candles & fragrance", deriveSub("Candles & fragrance", t)];
    }
    if (overrideOk && !isFood && RX.book.test(t) && !RX.bookNeg.test(t)) {
      return ["Books & journals", deriveSub("Books & journals", t)];
    }
    if (overrideOk && !isFood && (pt === "HOME" || pt === "HOME_FURNITURE_AND_DECOR" || pt === "CHAIR" || pt === "TABLE" || pt === "BENCH" || pt === "STOOL_SEATING" || pt === "OTTOMAN" || pt === "RUG" || pt === "PILLOW" || pt === "LIGHT_FIXTURE" || pt === "STRING_LIGHT" || pt === "PLANTER" || pt === "STORAGE_BOX" || pt === "BASKET") && RX.garden.test(t)) {
      return ["Garden & outdoor", deriveSub("Garden & outdoor", t)];
    }
  }

  if (!mapped) return null;
  const [cat, sub] = mapped;

  // Disposables / commercial packs are off-brand for a gift marketplace.
  if (cat === "Kitchen & tabletop" && /\b(disposable|compostable|biodegradable|take ?away|takeout|individually wrapped|plastic (utensils?|cutlery|forks?|spoons?|knives|knife)|paper (plates?|cups?|napkins?)|foam|styrofoam|\d-ply|ply\b|catering|commercial)\b/i.test(t)) return null;

  // Type-specific filters / derivations.
  switch (pt) {
    case "GROCERY":
      if (RX.perishable.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "LEGUME":
    case "COOKIE":
    case "CRACKER":
    case "SNACK_MIX":
      if (/\b(fresh|frozen|refrigerated)\b/i.test(t)) return null;
      return [cat, sub || deriveSub(cat, t)];
    case "HEALTH_PERSONAL_CARE":
      if (!/\b(soap|wash|lotion|shampoo|conditioner|bath|body|hand|sanitizer|cotton|wipes?|razor|toothbrush|floss|deodorant|balm|cream|oil|salt|scrub|towel|sponge|loofah|spa|massage|skin|face|facial|lip|nail|hair|shave|beard|moisturiz|cleanser|toner|serum)\b/i.test(t)) return null;
      if (/\b(storage|container|cleaner|detergent|bags?|foil|paper towels?|toilet paper|tissue|napkins?|batteries|first aid|bandage|gauze|mask|gloves?|thermometer|pill|medicine|tablet|capsule|syringe)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "BEAUTY":
    case "ABIS_BEAUTY":
      if (/\b(device|electric|dryer|straightener|curler|trimmer|epilator|clipper|massager|machine)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "AREA_DEODORIZER":
      if (!/\b(spray|freshener|diffuser|scent|fragrance|odor|odour|aroma|deodoriz)/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "OFFICE_PRODUCTS":
    case "PAPER_PRODUCT":
      if (/\b(tissue|toilet|paper towel|shredder|laminator|printer|toner|ink|calculator|label maker|electronic|shipping|mailer|bubble|packing|box|tape dispenser|chair|desk lamp|monitor|keyboard|mouse)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "STICKER_DECAL":
      if (/\b(wall decal|wall sticker|wall art)\b/i.test(t)) return ["Home decor", "Wall decals"];
      return [cat, "Stickers"];
    case "TEACHING_EQUIPMENT":
      if (/\b(anatomy|skeleton|microscope|lab|projector|electronic)\b/i.test(t)) return null;
      return [cat, sub];
    case "SHOES":
      return [cat, deriveSub(cat, t, "Shoes")];
    case "ACCESSORY":
      if (/\b(phone|laptop|camera|car|bike|cable|charger|electronic)\b/i.test(t)) return null;
      if (/\b(bag|purse|wallet|tote|backpack|clutch|crossbody|cross body|satchel|pouch|necklace|bracelet|earrings?|ring|watch|sunglass\w*|keychain|umbrella|jewelry|jewellery)\b/i.test(t)) {
        return ["Jewelry & accessories", deriveSub("Jewelry & accessories", t, "Accessories")];
      }
      return [cat, deriveSub(cat, t, "Accessories")];
    case "EARMUFF":
      if (/\b(hearing|noise|protect|shooting|db|decibel|safety)\b/i.test(t)) return null;
      return [cat, "Cold-weather accessories"];
    case "HOME":
    case "HOME_FURNITURE_AND_DECOR":
    case "HOME_BED_AND_BATH":
      if (/\b(mattress|box spring|bed frame|foundation|headboard|sofa|sectional|loveseat|dresser|wardrobe|armoire|cabinet|tv stand|entertainment center|bunk|futon|recliner sofa|nightstand)\b/i.test(t) && !/\bmattress (pad|protector|topper)\b/i.test(t)) return null;
      if (/\b(hanger|shower caddy|toilet|plunger|trash|garbage|drying rack|ironing|laundry basket|clothes rack|shoe rack|step stool|hooks?)\b/i.test(t)) return null;
      if (/\bmattress (pad|protector|topper)\b/i.test(t)) return [cat, "Bedding"];
      return [cat, deriveSub(cat, t)];
    case "CHAIR":
    case "TABLE":
      if (/\b(office chair|gaming|desk chair|task chair|executive|swivel|folding|massage|computer)\b/i.test(t)) return null;
      return [cat, sub];
    case "KITCHEN":
    case "ABIS_KITCHEN":
      if (/\b(electric|blender|toaster|microwave|air fryer|pressure cooker|kettle|coffee maker|machine|appliance|mixer|processor|grinder|juicer|dishwasher|refrigerator|freezer|stove|oven|induction|scale|thermometer|timer)\b/i.test(t)) return null;
      if (/\b(food storage|storage container|plastic .*container|lunch box|bento)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "FOOD_SERVICE_SUPPLY":
      if (!/\b(plate|cup|napkin|bowl|tray|straw|platter|cutlery|fork|spoon|knife|tumbler|glass|carafe|pitcher|ramekin)s?\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t, "Serveware")];
    case "DRINKING_CUP":
    case "BOTTLE":
    case "JAR":
      if (/\b(baby|sippy|toddler)\b/i.test(t)) return ["Kids & baby", "Feeding & soothing"];
      return [cat, sub];
    case "FINENECKLACEBRACELETANKLET":
    case "FASHIONNECKLACEBRACELETANKLET":
    case "JEWELRY":
    case "FINEOTHER":
    case "FASHIONOTHER":
      return [cat, deriveSub(cat, t, "Jewelry")];
    case "EYEWEAR":
      if (/\b(safety|goggle|reading|prescription|blue light|computer)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t, "Sunglasses")];
    case "BAG":
      if (/\b(laptop|camera|golf|gym|duffel|luggage|trash|garbage|storage|ziplock|vacuum)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t, "Bags")];
    case "BABY_PRODUCT":
      if (/\b(monitor|electric|breast pump|sterilizer|car seat|stroller|gate|humidifier|thermometer)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "PET_SUPPLIES":
      if (/\b(flea|tick|dewormer|medication|supplement|vitamin|litter|waste bag|poop bag|pee pad|training pad|aquarium filter|pump|heater|electric|automatic|gps|tracker|clipper|trimmer)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "OUTDOOR_LIVING":
    case "ABIS_LAWN_AND_GARDEN":
      if (/\b(cover|mower|trimmer|blower|chainsaw|pressure washer|hose reel|sprinkler timer|electric|propane tank|heater|pesticide|herbicide|weed killer|fertilizer spreader|generator)\b/i.test(t)) return null;
      return [cat, deriveSub(cat, t)];
    case "UMBRELLA":
      if (/\b(patio|garden|market|beach|cantilever|offset|outdoor|table)\b/i.test(t)) return [cat, "Patio umbrellas"];
      return ["Jewelry & accessories", "Umbrellas"];
    default:
      return [cat, sub || deriveSub(cat, t)];
  }
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

async function ensureFile(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);
  return dest;
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

async function readGzipLines(file, onLine) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) if (line.trim()) onLine(line);
}

// ---------------------------------------------------------------------------
// Image pipeline (macOS sips)
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
// Price / rating synthesis
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
  // log-normal jitter, sigma 0.4
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log(`Dataset: Amazon Berkeley Objects (ABO) — license CC BY 4.0`);
  console.log(`Cache dir: ${CACHE}`);
  await fsp.mkdir(CACHE, { recursive: true });

  // 1. Fetch metadata shards.
  const shards = "0123456789abcdef".split("").map((h) => `listings_${h}.json.gz`);
  await pool(shards, 4, async (name) => {
    const dest = path.join(CACHE, name);
    if (!fs.existsSync(dest)) console.log(`  downloading ${name}`);
    await ensureFile(`${S3}/listings/metadata/${name}`, dest);
  });
  const imagesCsv = path.join(CACHE, "images.csv.gz");
  await ensureFile(`${S3}/images/metadata/images.csv.gz`, imagesCsv);

  // 2. Image index: image_id -> {path, w, h}
  const imageIndex = new Map();
  await readGzipLines(imagesCsv, (line) => {
    if (line.startsWith("image_id,")) return;
    const [id, h, w, p] = line.split(",");
    imageIndex.set(id, { path: p, w: Number(w), h: Number(h) });
  });
  console.log(`Image index: ${imageIndex.size} images`);

  // 3. Parse listings -> candidates.
  const candidates = [];
  const stats = { rows: 0, english: 0, typed: 0, categorized: 0, noImage: 0, smallImage: 0, hardSkip: 0 };
  const seenImage = new Set();
  const seenKey = new Set();
  const typeCounts = {};
  for (const name of shards) {
    await readGzipLines(path.join(CACHE, name), (line) => {
      stats.rows++;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        return;
      }
      if (!EN_COUNTRIES.has(r.country)) return;
      const names = pickEnglish(r.item_name);
      if (!names.length) return;
      stats.english++;
      const pt = (r.product_type && r.product_type[0] && r.product_type[0].value) || "";
      if (!pt) return;
      stats.typed++;
      const rawTitle = normalizeText(names[0]);
      if (HARD_SKIP.test(rawTitle)) {
        stats.hardSkip++;
        return;
      }
      const brandRaw = pickEnglish(r.brand)[0] || (r.brand && r.brand[0] && r.brand[0].value) || "";
      const bullets = normalizeText(pickEnglish(r.bullet_point).join(" "));
      const keywords = normalizeText(pickEnglish(r.item_keywords).join(" "));
      const materialField = normalizeText(pickEnglish(r.material).join(" "));
      const colorField = normalizeText(pickEnglish(r.color)[0] || "");
      const text = [rawTitle, bullets, keywords, materialField].join(" ");
      const cat = categorize(pt, rawTitle, text);
      if (!cat) return;
      const [category, subcategory] = cat;
      if (!CATEGORIES.includes(category)) return;
      stats.categorized++;
      typeCounts[pt] = (typeCounts[pt] || 0) + 1;

      const imgId = r.main_image_id;
      const img = imgId && imageIndex.get(imgId);
      if (!img) {
        stats.noImage++;
        return;
      }
      if (Math.max(img.w, img.h) < 200) {
        stats.smallImage++;
        return;
      }
      if (seenImage.has(imgId)) return;

      const brand = normalizeBrand(brandRaw);
      const name = cleanName(rawTitle, brand);
      if (name.length < 8 || !/[a-z]/i.test(name)) return;
      // Romanized / non-English residue: too many long vowel-run tokens or non-ASCII.
      if (!/^[\x20-\x7e]+$/.test(name)) return;
      const consumable = category === "Food & drink" || category === "Bath & body";
      const materials = consumable
        ? extractMaterials(text).filter((m) => ["glass", "cotton", "bamboo", "wood", "paper", "silicone", "stainless-steel"].includes(m) && category !== "Food & drink")
        : extractMaterials(text);
      const colors = consumable ? extractColors(colorField, "") : extractColors(colorField, rawTitle);
      const key =
        category +
        "|" +
        name
          .toLowerCase()
          .replace(/[^a-z\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w && !COLOR_CANON.includes(w) && !["the", "and", "with", "for", "of", "in", "a", "an"].includes(w))
          .slice(0, 5)
          .join(" ");
      if (seenKey.has(key)) return;
      seenImage.add(imgId);
      seenKey.add(key);

      candidates.push({
        sourceId: r.item_id,
        domain: r.domain_name || "amazon.com",
        pt,
        rawTitle,
        name,
        brand,
        category,
        subcategory,
        imageId: imgId,
        imagePath: img.path,
        imgW: img.w,
        imgH: img.h,
        materials,
        colors,
      });
    });
  }
  console.log(`Parsed ${stats.rows} listings; english ${stats.english}; categorized ${stats.categorized}; unique candidates ${candidates.length}`);
  console.log(`  skipped: hard-skip ${stats.hardSkip}, no image ${stats.noImage}, tiny image ${stats.smallImage}`);

  // 4. Balanced selection: per category, round-robin across subcategories.
  const byCat = new Map(CATEGORIES.map((c) => [c, new Map()]));
  for (const c of candidates) {
    const m = byCat.get(c.category);
    if (!m.has(c.subcategory)) m.set(c.subcategory, []);
    m.get(c.subcategory).push(c);
  }
  const selected = [];
  const poolCounts = {};
  for (const cat of CATEGORIES) {
    const buckets = [...byCat.get(cat).entries()].map(([sub, arr]) => [sub, shuffle(arr, rngFor("bucket|" + cat + "|" + sub))]);
    poolCounts[cat] = buckets.reduce((a, [, arr]) => a + arr.length, 0);
    // Bucket order shuffled too, so small buckets are not always first.
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
  console.log("Candidate pool per category:", JSON.stringify(poolCounts));
  console.log(`Selected ${selected.length} candidates for image fetch (cap ${CAP} × ${OVERSELECT})`);

  // 5. Images.
  await fsp.mkdir(OUT_IMG_DIR, { recursive: true });
  const originalsDir = path.join(CACHE, "originals");
  await fsp.mkdir(originalsDir, { recursive: true });
  const tmpDir = path.join(CACHE, "tmp");
  await fsp.mkdir(tmpDir, { recursive: true });

  let done = 0;
  const imgResults = DRY
    ? selected.map(() => ({ ok: true, dry: true }))
    : await pool(selected, CONCURRENCY, async (c) => {
        const src = path.join(originalsDir, c.imageId + ".jpg");
        try {
          await ensureFile(`${S3}/images/original/${c.imagePath}`, src);
          if (fs.statSync(src).size < 3000) throw new Error("tiny file");
          const tmp = path.join(tmpDir, c.imageId + ".jpg");
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

  // 6. Keep first CAP successes per category, assign ids, move images into place.
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
  final.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));

  // Clear previous output images so count == products.
  for (const f of await fsp.readdir(OUT_IMG_DIR)) if (f.endsWith(".jpg")) await fsp.unlink(path.join(OUT_IMG_DIR, f));

  const products = [];
  let n = 0;
  for (const c of final) {
    n++;
    const id = `pub-${String(n).padStart(4, "0")}`;
    if (!DRY) await fsp.copyFile(c.img.tmp, path.join(OUT_IMG_DIR, id + ".jpg"));
    // minOrder is brand-level (consistent per brand); isNewBrand is per-item seeded (~25%) because ABO's
    // brand set is tiny (a handful of Amazon house brands), so a brand-level flag cannot hit 25%.
    const brandRng = rngFor("brand|" + c.brand.toLowerCase());
    const minOrder = [50, 75, 100, 150, 200, 250][Math.floor(brandRng() * 6)];
    const rng = rngFor("item|" + c.sourceId);
    const isNewBrand = rng() < 0.25;
    const rating = Math.round((4.2 + 0.8 * (1 - Math.pow(rng(), 2))) * 10) / 10;
    let reviewCount = Math.round(Math.exp(Math.log(3) + rng() * (Math.log(1500) - Math.log(3))));
    if (isNewBrand) reviewCount = Math.max(2, Math.round(reviewCount * 0.15));
    const leadTimeDays = 3 + Math.floor(rng() * 12);
    const { msrp, wholesale } = synthPrice(c.category, c.subcategory, c.rawTitle, c.sourceId);
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
      image: `/catalog-public/${id}.jpg`,
      source: "amazon-berkeley-objects",
      sourceId: c.sourceId,
      sourceUrl: `https://www.${c.domain}/dp/${c.sourceId}`,
      sourceImageId: c.imageId,
      sourceProductType: c.pt,
    });
  }

  // 7. priceTier tertiles within category; bestseller top ~15% by rating*log(reviews).
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

  // 8. Write.
  await fsp.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fsp.writeFile(OUT_JSON, JSON.stringify(products, null, 2) + "\n");

  // 9. Report.
  const counts = {};
  for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;
  let totalBytes = 0;
  let imgCount = 0;
  if (!DRY) {
    for (const f of await fsp.readdir(OUT_IMG_DIR)) {
      if (!f.endsWith(".jpg")) continue;
      imgCount++;
      totalBytes += fs.statSync(path.join(OUT_IMG_DIR, f)).size;
    }
  }
  const failed = imgResults.filter((r) => !r || !r.ok).length;
  console.log("\n==== SUMMARY ====");
  console.log(`Dataset: ${DATASET_ID}`);
  console.log(`Products: ${products.length}${DRY ? " (dry run, no images)" : ""}`);
  for (const cat of CATEGORIES) console.log(`  ${cat.padEnd(24)} ${String(counts[cat] || 0).padStart(4)}   (pool ${poolCounts[cat]})`);
  if (!DRY) {
    console.log(`Images: ${imgCount} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total, avg ${(totalBytes / Math.max(1, imgCount) / 1024).toFixed(1)} KB`);
    console.log(`Image fetch/convert failures among selected: ${failed}`);
    if (imgCount !== products.length) console.log(`WARNING: image count ${imgCount} != product count ${products.length}`);
  }
  console.log(`Bestsellers: ${products.filter((p) => p.isBestseller).length}; new-brand: ${products.filter((p) => p.isNewBrand).length}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}; elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("Caveats: prices, ratings, review counts, minOrder, lead times, new-brand flags are synthetic (ABO has none); madeIn is Unknown; ABO is dominated by Amazon private-label brands and its apparel is mostly footwear.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
