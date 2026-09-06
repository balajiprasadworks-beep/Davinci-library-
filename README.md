# DaVinci's Medical Library

A 3D interactive storefront for medical notes — MBBS year-wise, internship
practical guides, and preparation for exams abroad.

Static site. No build step, no framework, no backend. Open it, edit it, push it.

---

## Run it locally

ES modules need to be served over HTTP — opening `index.html` from the file
system will not work.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Pages

| File | What it is |
| --- | --- |
| `index.html` | 3D homepage — rotatable anatomy figure with region hotspots |
| `mbbs.html` | MBBS Level — 1st to 4th year |
| `internship.html` | Internship practical guides |
| `abroad.html` | NEET PG, USMLE, AMC, PLAB, DHA, MCAT |
| `cart.html` | Cart and QR checkout |
| `dashboard.html` | Orders, stats, quick links |
| `profile.html` | Buyer details, stored locally |

Every page carries the same two-tier header: **Dashboard** and **Go to Cart** on
the top row, **View Cart** (with a live count) and **Profile** below it.

---

## The three things you will actually edit

### 1. Your payment QR — `js/config.js` + `assets/img/`

Save your QR image as **`assets/img/payment-qr.png`**, then fill in:

```js
export const PAYMENT = {
  upiId: "yourname@okhdfcbank",
  accountName: "Your Name",
  ...
};
```

Until that image exists, checkout shows a clear placeholder instead of a broken
image — so the site is safe to publish before the QR is ready.

### 2. Your contact routing — `js/config.js`

```js
export const SITE = {
  contactEmail: "you@example.com",
  whatsapp: "919876543210",   // optional; "" hides the WhatsApp button
};
```

### 3. Adding a note — `js/catalog.js`

Drop the PDF into `notes/`, then add one object:

```js
{
  id: "mbbs-y1-anatomy",       // unique, never reuse — the cart keys off it
  cat: "mbbs",                 // mbbs | internship | abroad
  sub: "year-1",               // a sub-id from CATEGORIES
  title: "General & Systemic Anatomy",
  desc: "One or two lines of selling copy.",
  price: 399,
  was: 599,                    // optional strike-through
  meta: ["PDF", "Diagram-led"],
  region: "limbs",             // anatomy hotspot: head chest abdomen pelvis limbs systemic
  file: "notes/anatomy.pdf",
}
```

That's the whole workflow. The card, the filters, the cart and the anatomy
hotspot all pick it up automatically.

---

## How the money flows

There is no payment gateway. The flow is deliberately manual, which is what
works for a solo seller:

1. Buyer adds notes to the cart.
2. Checkout shows your QR and the exact total.
3. Buyer pays with any UPI app.
4. Buyer enters their email and the transaction ID.
5. The site records the order, gives them a reference (`DV…`), and opens a
   prefilled email or WhatsApp message addressed to you.
6. You verify the payment and send the PDFs.

Orders are stored in the buyer's own browser so they can see their history on
the dashboard. **You** are the system of record — check your bank, then deliver.

### If you later want automatic delivery

Add a payment gateway (Razorpay or Stripe) and a small serverless function that
verifies the webhook and emails a signed download link. Nothing in this codebase
blocks that; `cart.placeOrder()` is the single point you would swap.

---

## The 3D figure

`js/anatomy.js` builds the body procedurally from Three.js primitives — a lathed
torso, capsule limbs, glowing organs and a Fresnel shell. Nothing is downloaded,
so it stays fast on an iPad.

Six hotspots are pinned to anatomical regions. Tapping one opens a glass card
and filters the grid below to the notes anchored there.

To swap in a real scanned model later, replace `buildBody()` with a
`GLTFLoader` call and keep `HOTSPOTS` as it is.

---

## Publishing

The site is static, so anything works. GitHub Pages is the shortest path:

**Settings → Pages → Source: Deploy from a branch → `main` / root.**

Your site lands at `https://balajiprasadworks-beep.github.io/davinci-library-/`.

---

## Notes on privacy

Cart, orders and profile live in the buyer's `localStorage` and never leave
their browser until they choose to send the order email. No analytics, no
trackers, no third-party scripts beyond the Three.js and GSAP CDNs.
