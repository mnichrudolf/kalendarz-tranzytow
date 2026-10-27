#!/usr/bin/env python3
"""Buduje docs/index.html: wkleja data.json i podzbiór czcionki z symbolami astrologicznymi."""
import base64, io, json, os, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_LOCAL = os.path.join(HERE, "AstroGlyphs-DejaVu.ttf")  # kopia w repozytorium (licencja Bitstream Vera/DejaVu)

def glyph_font():
    src = FONT_LOCAL if os.path.exists(FONT_LOCAL) else FONT
    uni = [0x2609, 0x263D, 0x263F, 0x2640, 0x2642, 0x2643, 0x2644, 0x2645, 0x2646, 0x2647, 0x260A,
           0x260C, 0x260D, 0x25A1, 0x25B3, 0x2736, 0x2192, 0xFE0E] + list(range(0x2648, 0x2654))
    opts = subset.Options()
    try:
        import brotli  # noqa
        opts.flavor = "woff2"; mime, fmt = "font/woff2", "woff2"
    except Exception:
        opts.flavor = "woff"; mime, fmt = "font/woff", "woff"
    opts.layout_features = []; opts.name_IDs = [1, 2]; opts.notdef_outline = False
    font = TTFont(src)
    sub = subset.Subsetter(opts); sub.populate(unicodes=uni); sub.subset(font)
    buf = io.BytesIO(); font.flavor = opts.flavor; font.save(buf)
    return base64.b64encode(buf.getvalue()).decode(), mime, fmt

def main():
    data = open(os.path.join(HERE, "data.json"), encoding="utf-8").read()
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    b64, mime, fmt = glyph_font()
    html = (tpl.replace("/*__DATA__*/null", data)
               .replace("__GLYPHFONT__", b64).replace("__FONTMIME__", mime).replace("__FONTFMT__", fmt))
    os.makedirs(os.path.join(HERE, "docs"), exist_ok=True)
    with open(os.path.join(HERE, "docs", "index.html"), "w", encoding="utf-8") as fh:
        fh.write(html)
    # wersja fragmentu (bez doctype/html/head/body) do publikacji jako artefakt
    head = re.search(r"<head>(.*)</head>", html, re.S).group(1)
    head = re.sub(r'<meta charset="utf-8">\s*', "", head)
    head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    with open(os.path.join(HERE, "artifact.html"), "w", encoding="utf-8") as fh:
        fh.write(head.strip() + "\n" + body.strip() + "\n")
    print("docs/index.html", len(html) // 1024, "KB;", "font", fmt, len(b64) // 1024, "KB")

if __name__ == "__main__":
    main()
