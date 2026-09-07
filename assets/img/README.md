# Images

`og.png` — social share preview image (see `tools/make-og.mjs`).

`payment-qr.png` is no longer used by checkout — payment now runs
through Razorpay (see `api/_lib/razorpay.js` and the README). It is
left in place rather than deleted since it isn't this codebase's to
remove, but nothing references it any more.
