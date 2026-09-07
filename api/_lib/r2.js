/* ============================================================
   FILE STORAGE — Cloudflare R2 (S3-compatible), PRIVATE bucket.

   Holds the actual note PDFs so a webhook-confirmed payment can be
   turned into a working download link automatically, with nobody
   attaching anything by hand.

   R2 speaks the S3 API, so this uses the standard AWS SDK v3
   pointed at R2's endpoint rather than a Cloudflare-specific
   client. The bucket is private (R2's default — there is no public
   URL at all), so every download is a presigned GET generated
   fresh at delivery time; see presignDownload below.

   Set in Vercel (Settings -> Environment Variables):
     R2_ACCOUNT_ID          Cloudflare dashboard -> R2 -> Overview (right rail)
     R2_ACCESS_KEY_ID       R2 -> Manage API Tokens -> create a token
     R2_SECRET_ACCESS_KEY   shown once, when that token is created
     R2_BUCKET              the bucket name you created for note PDFs

   With any of these unset, isConfigured() is false and nothing here
   is called; catalog entries simply have no r2Key, and delivery
   falls back to "sending separately" rather than throwing.
   ============================================================ */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const env = () => ({
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
});

export const isConfigured = () => {
  const e = env();
  return Boolean(e.accountId && e.accessKeyId && e.secretAccessKey && e.bucket);
};

/* Read the environment per call, not at import — a cold start must
   not freeze a still-empty process.env into a module-level client. */
function client() {
  const { accountId, accessKeyId, secretAccessKey } = env();
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Upload one file to the private bucket. Used only by
 * tools/upload-note.mjs — never by a request handler, since buyers
 * never upload anything. Returns the object key, which is what
 * presignDownload() needs later.
 */
export async function upload(key, data, contentType) {
  await client().send(new PutObjectCommand({
    Bucket: env().bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  return key;
}

/** How long a delivery link stays valid before it needs re-issuing.
 *  Also SigV4's own hard ceiling for a presigned URL (X-Amz-Expires
 *  tops out at 7 days) — this can be lowered but never raised. */
export const LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a working, expiring download link for a private object.
 * Called fresh at delivery time rather than once at upload time, so
 * a link handed to a buyer is never older than it needs to be.
 *
 * Unlike Vercel Blob's presign step, SigV4 signing is pure local
 * computation — no network call, so no timeout to race against here.
 * A bad key or bad credentials still throws (caught by the caller,
 * which must fall back to "sending separately" rather than let one
 * broken link fail the whole delivery).
 */
export async function presignDownload(key, { validForMs = LINK_LIFETIME_MS, filename } = {}) {
  const command = new GetObjectCommand({
    Bucket: env().bucket,
    Key: key,
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"` } : {}),
  });
  return getSignedUrl(client(), command, { expiresIn: Math.floor(validForMs / 1000) });
}
