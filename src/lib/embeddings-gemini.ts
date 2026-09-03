/**
 * Hosted alternative to the local SigLIP towers: Google Gemini Embedding 2 through
 * OpenRouter's embeddings endpoint. Text and images land in one 768-d space (dimensions
 * requested), so frames, prompts and products are comparable. Server-only.
 */
if (typeof window !== "undefined") throw new Error("embeddings-gemini.ts is server-only");

export const GEMINI_EMBEDDING_MODEL = "google/gemini-embedding-2";
export const GEMINI_DIM = 768;
const BATCH = 8;

function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

async function call(inputs: unknown[]): Promise<Float32Array[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Gemini embeddings need OPENROUTER_API_KEY.");
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEMINI_EMBEDDING_MODEL, dimensions: GEMINI_DIM, input: inputs }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const j = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      const rows = [...j.data].sort((a, b) => a.index - b.index).map((d) => normalize(Float32Array.from(d.embedding)));
      if (rows.length !== inputs.length) throw new Error(`Gemini embeddings returned ${rows.length} vectors for ${inputs.length} inputs.`);
      return rows;
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2500 * (attempt + 1);
      console.warn(`[gemini-embed] ${res.status}, retrying in ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Gemini embeddings failed (${res.status}): ${text.slice(0, 200)}`);
  }
  throw new Error("Gemini embeddings: the provider kept rate-limiting the request.");
}

/** Images as data URLs (JPEG). Batches run in parallel pairs to keep latency low without tripping rate limits. */
export async function embedImagesGemini(dataUrls: string[]): Promise<Float32Array[]> {
  const batches: string[][] = [];
  for (let i = 0; i < dataUrls.length; i += BATCH) batches.push(dataUrls.slice(i, i + BATCH));
  const out: Float32Array[][] = [];
  for (let i = 0; i < batches.length; i += 2) {
    const part = await Promise.all(batches.slice(i, i + 2).map((b) => call(b.map((url) => ({ content: [{ type: "image_url", image_url: { url } }] })))));
    out.push(...part);
  }
  return out.flat();
}

export async function embedTextsGemini(texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 16) out.push(...(await call(texts.slice(i, i + 16))));
  return out;
}
