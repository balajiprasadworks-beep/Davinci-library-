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

  /* Shown under the Pay button on the cart page. Payment itself runs
     through Razorpay (api/_lib/razorpay.js) — see the README for the
     one-time account setup. */
  checkoutNote:
    "Secure payment via Razorpay — UPI, cards, netbanking and wallets. " +
    "Your notes unlock on this page and land in your inbox the instant payment is confirmed.",
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
