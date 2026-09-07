/**
 * Upload a note PDF to Vercel Blob's private store and print the pathname
 * to paste into js/catalog.js as that title's `blobPath`.
 *
 *   BLOB_READ_WRITE_TOKEN=... node tools/upload-note.mjs <path-to-pdf> [product-id]
 *
 * Requires a PRIVATE Vercel Blob store connected to the project first:
 * dashboard -> Storage -> Create Database -> Blob -> Connect. That step
 * adds BLOB_READ_WRITE_TOKEN to your Vercel environment variables
 * automatically; copy the same value into your shell to run this locally
 * (dashboard -> Storage -> your store -> .env.local tab has it ready to
 * copy).
 *
 * Why private, not public: a public blob's URL works for anyone forever
 * once they have it. A private blob has no usable bare URL at all — every
 * download needs a signed, expiring link, generated fresh by the backend
 * at "mark delivered" time (see api/_lib/blob.js). That fits paid content
 * better: a leaked link stops working on its own, and a fresh one can
 * always be re-issued without re-uploading the file.
 *
 * This never touches git and never touches the deployed site directly —
 * it talks to Vercel's Blob API and hands back a pathname. You paste that
 * into the catalogue yourself, so nothing is wired to a title without you
 * choosing to.
 */

import fs from "node:fs";
import path from "node:path";

const [, , filePath, productId] = process.argv;

if (!filePath) {
  console.error(
    "Usage: BLOB_READ_WRITE_TOKEN=... node tools/upload-note.mjs <path-to-pdf> [product-id]"
  );
  process.exit(2);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN is not set.\n" +
    "Get it from the Vercel dashboard: Storage -> your Blob store -> .env.local tab."
  );
  process.exit(2);
}
if (!fs.existsSync(filePath)) {
  console.error(`No such file: ${filePath}`);
  process.exit(2);
}

const { put } = await import("@vercel/blob");

const bytes = fs.readFileSync(filePath);
const pathname = path.basename(filePath);

console.log(`Uploading ${pathname} (${(bytes.length / 1e6).toFixed(2)} MB) to the private store...`);

const blob = await put(pathname, bytes, {
  access: "private",
  contentType: "application/pdf",
  addRandomSuffix: true,
  token: process.env.BLOB_READ_WRITE_TOKEN,
});

console.log(`\nUploaded. Stored pathname: ${blob.pathname}\n`);
console.log(
  productId
    ? `Paste this into js/catalog.js as the blobPath for "${productId}":\n\n    blobPath: "${blob.pathname}",\n`
    : `Paste this into js/catalog.js as that title's blobPath:\n\n    blobPath: "${blob.pathname}",\n`
);
console.log(
  "Note: this pathname is not a working link by itself — the site generates\n" +
  "a fresh signed, expiring download link from it automatically each time\n" +
  "you mark an order for this title delivered."
);
