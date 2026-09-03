// Tidy seller-written titles so the feed reads like a curated marketplace.
// Usage: node scripts/clean-titles.mjs data/catalog-shopify.json
import fs from "node:fs";

const file = process.argv[2] || "data/catalog-shopify.json";
const cat = JSON.parse(fs.readFileSync(file, "utf8"));

function titleCase(s) {
  return s.replace(/\b([a-z])(\w*)/g, (m, a, b) => a.toUpperCase() + b);
}

function clean(raw) {
  let t = String(raw || "").replace(/\s+/g, " ").trim();
  // Drop leading quantity noise like "1, " or "1x " and trailing " - descriptor" tails.
  t = t.replace(/^\d+\s*[,xX]\s*/, "");
  t = t.replace(/\s+[-–|]\s+.*$/, "");
  // Collapse duplicated comma-separated segments ("Foo,Foo" or "Foo, foo").
  const parts = t.split(/\s*,\s*/);
  const seen = new Set();
  const kept = parts.filter((p) => {
    const k = p.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  t = kept.join(", ");
  // Strip parenthetical marketing and repeated punctuation.
  t = t.replace(/\s*\((?:[^)]*)\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  t = t.replace(/[\s*·•~]+$/g, "").replace(/^[\s*·•~]+/g, "");
  if (t === t.toUpperCase() && t.length > 6) t = titleCase(t.toLowerCase());
  if (t.length > 60) {
    const cut = t.slice(0, 60);
    t = cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 60).replace(/[,\s-]+$/, "");
  }
  return t;
}

let changed = 0;
for (const p of cat) {
  const next = clean(p.name);
  if (next && next !== p.name) {
    p.name = next;
    changed++;
  }
}
fs.writeFileSync(file, JSON.stringify(cat));
console.log(`cleaned ${changed} of ${cat.length} titles in ${file}`);
