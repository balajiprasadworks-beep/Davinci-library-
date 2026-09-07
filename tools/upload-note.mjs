/**
 * Upload a note PDF to the private Cloudflare R2 bucket and print the
 * object key to paste into js/catalog.js as that title's `r2Key`.
 *
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
 *     node tools/upload-note.mjs <path-to-pdf> [product-id]
 *
 * Requires an R2 bucket and an API token first: Cloudflare dashboard
 * -> R2 -> create a bucket -> Manage API Tokens -> create a token
 * scoped to that bucket. Copy the four values above into your shell
 * to run this locally, and into Vercel's environment variables
 * (Settings -> Environment Variables) so the deployed site can
 * presign downloads for the same objects.
 *
 * Why private, not public: a public bucket's URL works for anyone
 * forever once they have it. A private bucket has no usable bare URL
 * at all — every download needs a signed, expiring link, generated
 * fresh by the backend the moment Razorpay's webhook confirms a
 * payment (see api/_lib/deliver.js). That fits paid content better:
 * a leaked link stops working on its own, and a fresh one can always
 * be re-issued without re-uploading the file.
 *
 * This never touches git and never touches the deployed site
 * directly — it talks to R2's API and hands back an object key. You
 * paste that into the catalogue yourself, so nothing is wired to a
 * title without you choosing to.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as r2 from "../api/_lib/r2.js";

const [, , filePath, productId] = process.argv;

if (!filePath) {
  console.error(
    "Usage: R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... " +
    "node tools/upload-note.mjs <path-to-pdf> [product-id]"
  );
  process.exit(2);
}
if (!r2.isConfigured()) {
  console.error(
    "R2 credentials are not fully set (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,\n" +
    "R2_SECRET_ACCESS_KEY, R2_BUCKET).\n" +
    "Get them from the Cloudflare dashboard: R2 -> Overview (account id) and\n" +
    "R2 -> Manage API Tokens (access key id / secret, created once)."
  );
  process.exit(2);
}
if (!fs.existsSync(filePath)) {
  console.error(`No such file: ${filePath}`);
  process.exit(2);
}

const bytes = fs.readFileSync(filePath);
const base = path.basename(filePath);
// A random prefix avoids collisions between two files that happen to
// share a name. The buyer-visible download filename is set
// separately, at presign time, from the catalogue's `title` — it
// does not need to match this key.
const key = `notes/${crypto.randomBytes(8).toString("hex")}-${base}`;

console.log(`Uploading ${base} (${(bytes.length / 1e6).toFixed(2)} MB) to the private R2 bucket...`);

await r2.upload(key, bytes, "application/pdf");

console.log(`\nUploaded. Object key: ${key}\n`);
console.log(
  productId
    ? `Paste this into js/catalog.js as the r2Key for "${productId}":\n\n    r2Key: "${key}",\n`
    : `Paste this into js/catalog.js as that title's r2Key:\n\n    r2Key: "${key}",\n`
);
console.log(
  "Note: this key is not a working link by itself — the site generates a\n" +
  "fresh signed, expiring download link from it automatically the moment\n" +
  "Razorpay's webhook confirms payment for an order containing this title."
);
