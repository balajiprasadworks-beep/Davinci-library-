/* ============================================================
   FILE STORAGE — Vercel Blob.

   Holds the actual note PDFs so the "mark delivered" email can
   link straight to the file, with nobody attaching anything by
   hand. This is deliberately NOT Google Drive: the backend has no
   Google credentials, and wiring OAuth just to fetch a file is a
   real project on its own. Blob needs one token, already scoped to
   this Vercel project.

   It is also deliberately NOT the git repo. The repo is public and
   this site serves every file in it — a PDF committed anywhere
   under it is a free download to anyone who looks, paid or not.
   Blob URLs carry an unguessable random suffix instead: only
   someone who was actually sent the link (i.e. a buyer, after you
   verified their payment) can reach the file.

   Setup (one time, in the Vercel dashboard):
     Project -> Storage -> Create Database -> Blob -> Connect.
     Vercel adds BLOB_READ_WRITE_TOKEN to your environment variables
     itself — nothing to copy by hand.

   With no token set, isConfigured() is false and nothing here is
   called; catalog entries simply have no fileUrl, and delivery
   emails fall back to the original "we'll send it separately" text.
   ============================================================ */

export const isConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Upload one file and return its public (unguessable-URL) address.
 * Used only by tools/upload-note.mjs — never by a request handler,
 * since buyers never upload anything.
 */
export async function upload(pathname, data, contentType) {
  const { put } = await import("@vercel/blob");
  const { url } = await put(pathname, data, {
    access: "public",
    contentType,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return url;
}
