import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // src/lib/embeddings.ts runs CLIP through onnxruntime-node + sharp (native
  // addons). Keep them out of the server bundle and load them with Node's own
  // require. Next.js already externalizes these by default; listing them makes
  // the dependency explicit and survives future changes to the default list.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
