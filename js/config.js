/* ============================================================
   SITE CONFIG — edit this file, nothing else, to change
   branding, payment details and contact routing.
   ============================================================ */

export const SITE = {
  name: "DaVinci's Medical Library",
  tagline: "Notes drawn with an anatomist's precision",
  // Shown in the footer + used for order confirmations.
  contactEmail: "balajiprasadworks@gmail.com",
  // Optional. Leave "" to hide the WhatsApp order button.
  // Format: full international number, digits only, e.g. "919876543210"
  whatsapp: "",
};

export const PAYMENT = {
  currency: "INR",
  symbol: "₹",

  /* --- QR PAYMENT -------------------------------------------
     Save your payment QR image as: assets/img/payment-qr.png
     Until it exists the checkout shows a clear placeholder instead
     of a broken image.

     upiId / accountName are kept here as a record of what the QR
     encodes, not shown on the page — checkout deliberately displays
     only the QR itself, no name or ID typed out beside it.
     --------------------------------------------------------- */
  qrImage: "assets/img/payment-qr.png",
  upiId: "balajiprasadworks-1@oksbi",
  accountName: "Balaji Prasad",

  /* How buyers get their notes after paying. */
  deliveryNote:
    "After payment, send your transaction ID and email using the button below. " +
    "Your notes are delivered to your inbox within 12 hours.",
};

export const ANATOMY = {
  /* The 3D figure on the homepage.
     Set to "" to fall back to the built-in procedural figure.
     Any standing human .glb/.gltf works — it is auto-scaled to the
     right height and stood on the floor, so the region hotspots
     keep lining up. */
  modelUrl: "assets/model/male.glb",
};

/** Format a number as a price string. */
export function money(n) {
  return PAYMENT.symbol + n.toLocaleString("en-IN");
}
