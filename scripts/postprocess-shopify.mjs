// Runs after build-shopify-catalog.mjs: drops listings that do not belong in a
// wholesale gift/home storefront and tidies titles. Idempotent.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const file = "data/catalog-shopify.json";
const cat = JSON.parse(fs.readFileSync(file, "utf8"));

const BLOCK = [
  /\bseeds?\b/i, /seed starter/i, /\bseedling/i, /\bfertili[sz]er/i, /\bpesticide|insecticide|herbicide\b/i, /\bpest control\b/i,
  /\blive plant\b|\bplant\b.*\b(pot|seedling|cutting)s?\b|\bcutting\b/i, /\bpyrrosia|philodendron|monstera|succulent\b.*\bplant\b/i,
  /\b(herbs?|licorice|slices)\b.*\b(bulk|kg|lb|pound)\b/i, /\bbulk\b/i, /\bwholesale lot\b/i,
  /\bsupplement|vitamin|capsule|tablet\b/i, /\bmedical|medicine|prescription\b/i, /\bvape|tobacco|cigarette\b/i, /\bknife sharpener|blade\b/i,
  /\bbutcher paper\b/i, /\bgermination\b/i, /\bfeeder dome\b/i,
];

const before = cat.length;
const kept = cat.filter((p) => !BLOCK.some((re) => re.test(`${p.name} ${p.subcategory ?? ""}`)));
fs.writeFileSync(file, JSON.stringify(kept));
console.log(`postprocess: kept ${kept.length} of ${before} products`);
execFileSync("node", ["scripts/clean-titles.mjs", file], { stdio: "inherit" });
