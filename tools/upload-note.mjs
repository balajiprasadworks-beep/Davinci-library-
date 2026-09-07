/**
 * Upload a note PDF to Vercel Blob storage and print the URL to paste
 * into js/catalog.js as that title's `fileUrl`.
 *
 *   BLOB_READ_WRITE_TOKEN=... node tools/upload-note.mjs <path-to-pdf> [product-id]
 *
 * Requires Vercel Blob storage to be connected to the project first:
 * dashboard -> Storage -> Create Database -> Blob -> Connect. That step
 * adds BLOB_READ_WRITE_TOKEN to your Vercel environment variables
 * automatically; copy the same value into your shell to run this locally
 * (dashboard -> Storage -> your store -> .env.local tab has it ready to
 * copy).
 *
 * This never touches git and never touches the deployed site directly —
 * it talks to Vercel's Blob API and hands back a URL. You paste that URL
 * into the catalogue yourself, so nothing is wired to a title without
 * you choosing to.
 *
 * The upload is public in the sense that anyone holding the exact URL
 * can open it — there is no login wall. What makes that acceptable is
 * that the URL is only ever handed out by the "mark delivered" email,
 * which only fires after you have checked a payment landed. It is not
 * linked from anywhere on the site and is not guessable: Blob appends a
 * long random suffix to the filename.
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

console.log(`Uploading ${pathname} (${(bytes.length / 1e6).toFixed(2)} MB)...`);

const { url } = await put(pathname, bytes, {
  access: "public",
  contentType: "application/pdf",
  addRandomSuffix: true,
  token: process.env.BLOB_READ_WRITE_TOKEN,
});

console.log(`\nUploaded: ${url}\n`);
console.log(
  productId
    ? `Paste this into js/catalog.js as the fileUrl for "${productId}":\n\n    fileUrl: "${url}",\n`
    : `Paste this into js/catalog.js as that title's fileUrl:\n\n    fileUrl: "${url}",\n`
);
