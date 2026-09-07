/* ============================================================
   FILE STORAGE — Vercel Blob, PRIVATE store.

   Holds the actual note PDFs so the "mark delivered" email can
   link straight to the file, with nobody attaching anything by
   hand.

   The store is private, not public: a bare blob URL on a private
   store requires an `Authorization: Bearer` header, which a
   buyer's browser cannot supply. So a link handed to a buyer has
   to be a PRESIGNED URL — one that carries its own signature and
   an expiry, generated fresh for each delivery. That is a better
   fit for paid content than a permanent public link would have
   been: it expires, and a fresh one can always be re-issued
   without touching the stored file.

   This is deliberately NOT Google Drive: the backend has no Google
   credentials, and wiring OAuth just to fetch a file is a real
   project on its own. It is also deliberately NOT the git repo —
   see "Never commit a paid PDF" in the README; a public repo has
   no private folder.

   Setup (one time, in the Vercel dashboard):
     Project -> Storage -> Create Database -> Blob -> Connect,
     choosing a PRIVATE store. Vercel adds BLOB_READ_WRITE_TOKEN to
     your environment variables itself — nothing to copy by hand.

   With no token set, isConfigured() is false and nothing here is
   called; catalog entries simply have no blobPath, and delivery
   emails fall back to the original "we'll send it separately" text.

   Package note: presigned URLs (issueSignedToken / presignUrl) are
   a newer addition to @vercel/blob. package.json pins "latest"
   rather than an exact version for this reason — pinning to an
   older version could silently drop this feature.
   ============================================================ */

export const isConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** How long a delivery link stays valid before it needs re-issuing. */
export const LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Upload one file to the private store. Used only by
 * tools/upload-note.mjs — never by a request handler, since buyers
 * never upload anything. Returns the blob's pathname, which is what
 * presignDownload() needs later — not a URL, since a private blob's
 * bare URL is not directly usable.
 */
export async function upload(pathname, data, contentType) {
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, data, {
    access: "private",
    contentType,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.pathname;
}

/** How long to wait on Vercel's Blob API before giving up on one link. */
const PRESIGN_TIMEOUT_MS = 8000;

/**
 * Generate a working, expiring download link for a private blob.
 * Called fresh at delivery time rather than once at upload time, so
 * a link handed to a buyer is never older than it needs to be.
 *
 * Throws on failure (bad pathname, API error, token trouble, or a
 * timeout — issueSignedToken is a real network call and a hung one
 * would otherwise stall the whole "mark delivered" request) — the
 * caller must catch this and fall back to "sending separately"
 * rather than let one broken link fail the whole delivery.
 */
export async function presignDownload(pathname, { validForMs = LINK_LIFETIME_MS } = {}) {
  const { issueSignedToken, presignUrl } = await import("@vercel/blob");

  // issueSignedToken's own abortSignal option is passed through, but a
  // slow DNS lookup or a proxy that never answers can still out-wait it
  // in practice — so this is raced against a plain timer as well. Belt
  // and braces: either one firing must still leave a "delivered" order
  // that emails the buyer, just without a link for this title.
  let timer;
  const timeout = (ms) =>
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`blob presign timed out after ${ms}ms`)), ms); });

  let token;
  try {
    token = await Promise.race([
      issueSignedToken({
        pathname,
        operations: ["get"],
        validUntil: Date.now() + validForMs,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        abortSignal: AbortSignal.timeout(PRESIGN_TIMEOUT_MS),
      }),
      timeout(PRESIGN_TIMEOUT_MS),
    ]);
  } finally {
    clearTimeout(timer);
  }

  // Purely local/cryptographic — no network call, no timeout needed.
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname,
    access: "private",
    validUntil: Date.now() + validForMs,
  });

  return presignedUrl;
}
