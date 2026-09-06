"""
Turn a UPI QR screenshot into assets/img/payment-qr.png.

    pip install pillow numpy opencv-python-headless
    python3 tools/prep-qr.py ~/Downloads/gpay-qr.png

A screenshot straight from GPay/PhonePe carries the app's own background,
your name, an avatar and a caption. Pasting that into the checkout frame
looks wrong and wastes most of the space. This finds the symbol itself,
crops to it, and rebuilds the quiet zone on white.

Two things it will not let you get wrong:

  * The quiet zone is synthesised rather than taken from the screenshot.
    Cropping "the QR plus some margin" reads in whatever sits underneath —
    on the original source here the caption began only 68px below the
    symbol, so a 90px margin clipped a line of text into the image.

  * It decodes the result and refuses to write a file whose payload does
    not match the original byte for byte. A QR that no longer scans is
    worse than no QR at all, and you would not notice by looking at it.
"""

import os
import sys

import cv2
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "img", "payment-qr.png")
SIZE = 760          # rendered at 216px in the checkout frame; 760 covers retina
QUIET_ZONE = 0.11   # ~5 modules on a typical 45-module UPI symbol


def main(src: str) -> int:
    img = Image.open(src).convert("RGB")
    payload, pts, _ = cv2.QRCodeDetector().detectAndDecode(np.array(img))
    if not payload:
        print(f"No QR code found in {src}", file=sys.stderr)
        return 1

    print("decoded:", payload)
    if not payload.startswith("upi://"):
        print("warning: this does not look like a UPI QR", file=sys.stderr)

    x0, y0 = pts[0].min(axis=0)
    x1, y1 = pts[0].max(axis=0)

    bleed = 6
    tight = img.crop((int(x0) - bleed, int(y0) - bleed, int(x1) + bleed, int(y1) + bleed))

    side = max(tight.size)
    quiet = int(side * QUIET_ZONE)
    canvas = Image.new("RGB", (side + quiet * 2, side + quiet * 2), "white")
    canvas.paste(tight, (quiet, quiet))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)

    out = os.path.normpath(OUT)
    canvas.save(out, optimize=True)

    check, _, _ = cv2.QRCodeDetector().detectAndDecode(np.array(Image.open(out)))
    if check != payload:
        os.remove(out)
        print("Crop changed what the QR decodes to — refusing to write it.", file=sys.stderr)
        return 1

    print(f"wrote {out}: {SIZE}x{SIZE}, {os.path.getsize(out) / 1024:.0f} KB")
    print("Now set PAYMENT.upiId and PAYMENT.accountName in js/config.js to match.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
