"""Generate Android launcher icons from MRP brand logo-mark."""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = r"d:\Projects\MRP New\MRP"
LOGO = os.path.join(ROOT, r"src\assets\brand\logo-mark.png")
RES = os.path.join(ROOT, r"android\app\src\main\res")
BG = (255, 255, 255, 255)  # brand white app icon
# Legacy density sizes (px)
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# Adaptive foreground: 108dp @ density
FG_SIZES = {
    "drawable-mdpi": 108,
    "drawable-hdpi": 162,
    "drawable-xhdpi": 216,
    "drawable-xxhdpi": 324,
    "drawable-xxxhdpi": 432,
}


def fit_logo(logo: Image.Image, canvas: int, scale: float = 0.72) -> Image.Image:
    """Center logo on transparent square canvas."""
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    max_w = int(canvas * scale)
    max_h = int(canvas * scale)
    lw, lh = logo.size
    ratio = min(max_w / lw, max_h / lh)
    nw, nh = max(1, int(lw * ratio)), max(1, int(lh * ratio))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (canvas - nw) // 2
    y = (canvas - nh) // 2
    out.paste(resized, (x, y), resized)
    return out


def with_bg(fg: Image.Image, bg=BG) -> Image.Image:
    base = Image.new("RGBA", fg.size, bg)
    base.alpha_composite(fg)
    return base


def make_round(sq: Image.Image) -> Image.Image:
    size = sq.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = sq.copy()
    out.putalpha(mask)
    return out


def main() -> None:
    logo = Image.open(LOGO).convert("RGBA")
    # Trim near-transparent margins so the mark fills the icon better
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)

    for folder, size in SIZES.items():
        d = os.path.join(RES, folder)
        os.makedirs(d, exist_ok=True)
        fg = fit_logo(logo, size, scale=0.78)
        sq = with_bg(fg)
        sq.convert("RGBA").save(os.path.join(d, "ic_launcher.png"), optimize=True)
        make_round(sq).save(os.path.join(d, "ic_launcher_round.png"), optimize=True)
        print("wrote", folder, size)

    # Adaptive icon layers
    for folder, size in FG_SIZES.items():
        d = os.path.join(RES, folder)
        os.makedirs(d, exist_ok=True)
        # Safe zone ~66%: keep logo within ~0.66 of canvas
        fg = fit_logo(logo, size, scale=0.62)
        fg.save(os.path.join(d, "ic_launcher_foreground.png"), optimize=True)
        print("wrote fg", folder, size)

    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
"""
    with open(os.path.join(anydpi, "ic_launcher.xml"), "w", encoding="utf-8") as f:
        f.write(adaptive)
    with open(os.path.join(anydpi, "ic_launcher_round.xml"), "w", encoding="utf-8") as f:
        f.write(adaptive)

    values = os.path.join(RES, "values")
    os.makedirs(values, exist_ok=True)
    colors_path = os.path.join(values, "ic_launcher_colors.xml")
    with open(colors_path, "w", encoding="utf-8") as f:
        f.write(
            """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
"""
        )
    print("wrote adaptive + background color")


if __name__ == "__main__":
    main()
