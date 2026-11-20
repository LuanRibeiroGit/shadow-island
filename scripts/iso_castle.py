"""Isometric castle art (original, procedural). Imported by generate-assets.py.

Every sprite lives in a CELL_W x CELL_H cell; the anchor (AX, AY) is the centre
of the tile's floor diamond, so the renderer places any sprite with the same
anchor and sorts by depth. Floor diamonds are 32x16 (2:1 isometric).
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw

CELL_W, CELL_H = 96, 168
AX, AY = 48, 100
HW, HH = 16, 8  # half width / half height of a tile diamond


def rgb(h: str, a: int = 255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def sh(c, k):
    return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))), max(0, min(255, int(c[2] * k))), c[3])


def P(gx, gy, z=0.0):
    """Grid offset (tiles, from the tile centre) + height (px) -> cell pixel."""
    return (AX + (gx - gy) * HW, AY + (gx + gy) * HH - z)


class Iso:
    def __init__(self):
        self.img = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def poly(self, pts, c):
        self.d.polygon([(round(x - 0.01), round(y - 0.01)) for x, y in pts], fill=c)

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < CELL_W and 0 <= y < CELL_H:
            if c[3] == 255:
                self.img.putpixel((x, y), c)
            else:
                b = self.img.getpixel((x, y))
                t = c[3] / 255
                self.img.putpixel((x, y), (int(b[0] + (c[0] - b[0]) * t), int(b[1] + (c[1] - b[1]) * t), int(b[2] + (c[2] - b[2]) * t), max(b[3], c[3])))

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2 <= 1:
                    self.px(x, y, c)

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def box(self, a, b, h, top, left=None, right=None, z=0.0, ox=0.0, oy=0.0, outline=True):
        """Box with footprint a (along x) by b (along y) tiles, centred at (ox, oy)."""
        left = left or sh(top, 0.72)
        right = right or sh(top, 0.55)
        N = (ox - a / 2, oy - b / 2)
        E = (ox + a / 2, oy - b / 2)
        S = (ox + a / 2, oy + b / 2)
        W = (ox - a / 2, oy + b / 2)
        self.poly([P(*W, z), P(*S, z), P(*S, z + h), P(*W, z + h)], left)
        self.poly([P(*S, z), P(*E, z), P(*E, z + h), P(*S, z + h)], right)
        self.poly([P(*N, z + h), P(*E, z + h), P(*S, z + h), P(*W, z + h)], top)
        if outline:
            # Light rim on the top edges reads as volume at small sizes.
            for p0, p1 in ((W, S), (S, E)):
                x0, y0 = P(*p0, z + h)
                x1, y1 = P(*p1, z + h)
                n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
                for i in range(n + 1):
                    t = i / n
                    self.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, sh(top, 1.18))
        return self

    def shadow(self, r=0.45):
        cx, cy = P(0, 0)
        self.ellipse(cx, cy, r * 26, r * 13, (0, 0, 0, 70))

    def floor(self, fn):
        """Per-pixel floor: fn(u, v) -> colour, u/v in [0,1) across the diamond.

        Uses the classic 2:1 pixel diamond (rows widen by 4 px) so neighbouring
        tiles interlock without gaps or overlaps.
        """
        top = AY - HH
        for r in range(2 * HH):
            hw = 2 * (r + 1) if r < HH else 2 * (2 * HH - r)
            for x in range(AX - hw, AX + hw):
                dx = (x + 0.5 - AX) / HW
                dy = (r + 0.5 - HH) / HH
                u = min(max((dy + dx) / 2 + 0.5, 0), 0.999)
                v = min(max((dy - dx) / 2 + 0.5, 0), 0.999)
                self.img.putpixel((x, top + r), fn(u, v))
        return self

    def on_left(self, t, z):
        """Point on the +y face (lower-left) of a full tile: t along it, z height."""
        return (AX - HW + t * HW, AY + t * HH - z)

    def on_right(self, t, z):
        return (AX + t * HW, AY + HH - t * HH - z)


GOLD = rgb("#d7b45a")
GLOW = rgb("#7cf2c2")
STONE = rgb("#3a4a4c")
WOOD = rgb("#6a4a30")
RED = rgb("#9a2f2f")

WALL_TALL = 40
WALL_LOW = 10


def floor_tile(name):
    rnd = random.Random(name)
    noise = {(rnd.randrange(32), rnd.randrange(16)) for _ in range(10)}

    def stone(u, v):
        cu, cv = int(u * 2), int(v * 2)
        base = rgb("#2c3a3c") if (cu + cv) % 2 == 0 else rgb("#283436")
        if u * 2 % 1 < 0.08 or v * 2 % 1 < 0.08:
            return rgb("#1c2628")
        return sh(base, 1.12) if (int(u * 32), int(v * 16)) in noise else base

    def check(u, v):
        cu, cv = int(u * 2), int(v * 2)
        base = rgb("#4a5654") if (cu + cv) % 2 == 0 else rgb("#3c4746")
        if u * 2 % 1 < 0.05 or v * 2 % 1 < 0.05:
            return sh(base, 0.88)
        return base

    def wood(u, v):
        plank = int(v * 4)
        base = rgb("#5a3d27") if plank % 2 == 0 else rgb("#634430")
        if v * 4 % 1 < 0.12:
            return rgb("#3a271a")
        if (u + plank * 0.37) % 1 < 0.04:
            return rgb("#3f2b1d")
        return base

    def runner(u, v):
        base = rgb("#8a2c2a")
        k = (int(u * 32) * 7 + int(v * 16) * 13) % 11
        if k == 0:
            return rgb("#9a3430")
        if k == 5:
            return rgb("#7a2624")
        return base

    def rug(u, v):
        e = min(u, v, 1 - u, 1 - v)
        if e < 0.08:
            return rgb("#c9a45a")
        if e < 0.2:
            return rgb("#1f4f4a")
        return rgb("#2a6a60") if abs(u - 0.5) + abs(v - 0.5) > 0.2 else GOLD

    def path(u, v):
        # Irregular cobbles.
        cu, cv = int(u * 3 + (int(v * 3) % 2) * 0.5), int(v * 3)
        h = (cu * 31 + cv * 17) % 5
        base = [rgb("#3e4644"), rgb("#454e4b"), rgb("#384140"), rgb("#4a5350"), rgb("#414a48")][h]
        fu = (u * 3 + (int(v * 3) % 2) * 0.5) % 1
        if fu < 0.1 or (v * 3) % 1 < 0.12:
            return rgb("#262d2c")
        return base

    def earth(u, v):
        k = (int(u * 32) * 7 + int(v * 16) * 11 + (int(u * 32) * int(v * 16)) % 7) % 17
        if k == 0:
            return rgb("#28503f")
        if k in (3, 9):
            return rgb("#223a34")
        if k == 6:
            return rgb("#1b2724")
        return rgb("#1f302c")

    def plaza(u, v):
        cu, cv = int(u * 2), int(v * 2)
        base = rgb("#4f5a57") if (cu + cv) % 2 == 0 else rgb("#48524f")
        if u * 2 % 1 < 0.06 or v * 2 % 1 < 0.06:
            return rgb("#2e3634")
        return base

    def rune(u, v):
        # The ring around the fountain: plaza stone with a faint spectral seam.
        base = plaza(u, v)
        if abs(u - 0.5) < 0.05 or abs(v - 0.5) < 0.05:
            return rgb("#3f7a68")
        return base

    def dais(u, v):
        if min(u, v, 1 - u, 1 - v) < 0.07:
            return rgb("#a88a44")
        cu, cv = int(u * 2), int(v * 2)
        return rgb("#3e3550") if (cu + cv) % 2 == 0 else rgb("#463c5a")

    def dark(u, v):
        # Dark slate slabs of the King's Hall.
        if min(u % 0.5, v % 0.5) < 0.07:
            return rgb("#171c1f")
        q = (int(u * 2) + int(v * 2) * 2) % 4
        base = rgb(("#2a3134", "#30383b", "#262c2f", "#2d3437")[q])
        n = (int(u * 16) * 7 + int(v * 16) * 13) % 11
        return sh(base, 1.12) if n == 0 else sh(base, 0.9) if n == 5 else base

    if name.startswith("stair"):
        return stair(name)
    fns = {"floor_dark": dark, "path": path, "earth": earth, "plaza": plaza, "rune": rune, "dais": dais, "floor_stone": stone, "floor_check": check, "floor_wood": wood, "runner": runner, "carpet": runner, "rug": rug}
    return Iso().floor(fns[name]).img


def stair(name):
    """Raised floor of the throne dais: `stair{h}_{skin}`, h px tall.

    Skins: stone, or the royal carpet (cl / cm / cr = left edge, middle, right edge).
    """
    h = int(name[5:name.index("_")])
    skin = name.split("_")[1]
    carpet = skin != "stone"

    def top(u, v):
        if carpet:
            if (skin == "cl" and u < 0.14) or (skin == "cr" and u > 0.86):
                return rgb("#c9a24a") if int(v * 16) % 4 else rgb("#8a6a2a")
            if (skin == "cl" and 0.2 < u < 0.27) or (skin == "cr" and 0.73 < u < 0.8):
                return rgb("#8a6a2a")
            return rgb("#6e1b24") if (int(u * 16) + int(v * 16)) % 5 else rgb("#7d222c")
        if min(u, v) < 0.07:
            return rgb("#15191b")
        n = (int(u * 16) * 5 + int(v * 16) * 3) % 9
        return rgb("#3a4246") if n == 0 else rgb("#2f363a")

    c = Iso()
    if h > 0:
        left = rgb("#5a151d") if carpet else rgb("#3b4347")
        c.box(1, 1, h, rgb("#2f363a"), left, rgb("#22282b"), outline=False)
        # Course line and a lit lip on the front faces.
        for t in [i / 16 for i in range(17)]:
            c.px(*c.on_left(t, h), rgb("#c9a24a") if carpet and skin == "cm" else rgb("#8a2a34") if carpet else rgb("#5d696e"))
            c.px(*c.on_right(t, h), rgb("#3c4549"))
            if h >= 8:
                c.px(*c.on_left(t, h // 2), rgb("#4a1118") if carpet else rgb("#2c3336"))
                c.px(*c.on_right(t, h // 2), rgb("#1a1f21"))
    flat = Iso().floor(top).img
    c.img.alpha_composite(flat.crop((0, h, CELL_W, CELL_H)), (0, 0))
    return c.img


def wall(name):
    c = Iso()
    tall = name.startswith("wall_tall")
    h = WALL_TALL if tall else 4 if name == "wall_broken" else WALL_LOW
    top = rgb("#2b3638")
    c.box(1, 1, h, top, rgb("#4a5b5a"), rgb("#3a4848"), outline=False)
    # Brick courses on both faces.
    for z in range(6, h, 6):
        for t in [i / 16 for i in range(17)]:
            c.px(*c.on_left(t, z), rgb("#3a4847"))
            c.px(*c.on_right(t, z), rgb("#2c3838"))
        off = 0.25 if (z // 6) % 2 else 0.0
        for t0 in (0.125 + off, 0.625 + off):
            if t0 < 1:
                for zz in range(z - 5, z):
                    c.px(*c.on_left(t0, zz), rgb("#3a4847"))
                    c.px(*c.on_right(t0, zz), rgb("#2c3838"))
    # Mossy top rim.
    for t in [i / 16 for i in range(17)]:
        c.px(*c.on_left(t, h), rgb("#5f7472"))
        c.px(*c.on_right(t, h), rgb("#4b5d5c"))
    if tall:
        # Battlements along the top.
        for t0 in (0.0, 0.5):
            c.box(0.22, 0.22, 7, rgb("#33403f"), rgb("#4f605f"), rgb("#3e4c4c"), z=h, ox=-0.5 + 0.11 + t0 * 0.0 + (0.5 if t0 else 0), oy=0.39)
            c.box(0.22, 0.22, 7, rgb("#33403f"), rgb("#4f605f"), rgb("#3e4c4c"), z=h, ox=0.39, oy=-0.5 + 0.11 + (0.5 if t0 else 0))
        # Moss and ivy dripping down.
        rnd = random.Random(name)
        for _ in range(5):
            t = rnd.random()
            at = c.on_left if rnd.random() < 0.5 else c.on_right
            for k in range(rnd.randrange(3, 12)):
                x, y = at(t, h - k)
                c.px(x, y, rgb("#2f6b4f") if k % 3 else rgb("#4f9a72"))
    parts = name.split("_")
    if len(parts) >= 4:
        side, deco = parts[2], "_".join(parts[3:])
        at = c.on_left if side == "L" else c.on_right
        if deco.startswith("torch"):
            f = 1 if deco.endswith("1") else 0
            x, y = at(0.5, 22)
            c.rect(x - 1, y, 2, 5, WOOD)
            c.ellipse(x, y - 2 - f * 0.6, 7, 6, (124, 242, 194, 40))
            c.ellipse(x, y - 2 - f * 0.5, 1.6, 2.6, GLOW)
            c.px(x, y - 1, rgb("#e9fff6"))
        elif deco == "banner":
            for i in range(-3, 4):
                x, y = at(0.5 + i / 16, 34)
                for k in range(16 - abs(i) // 3 * 0):
                    c.px(x, y + k, RED if i > -3 else rgb("#b84040"))
                c.px(x, y - 1, GOLD)
            x, y = at(0.5, 26)
            c.rect(x - 1, y, 2, 3, GLOW)
        elif deco == "gwindow":
            # Gothic lancet window with ghost fire behind the glass.
            x, y = at(0.5, 20)
            c.ellipse(x, y, 10, 14, (124, 242, 194, 30))
            for i in range(-4, 5):
                hgt = 26 - abs(i) * 2
                x, y = at(0.5 + i / 16, 6)
                for k in range(hgt):
                    edge = abs(i) == 4 or k == hgt - 1 or k == 0
                    if edge:
                        col = rgb("#12181a")
                    else:
                        t = k / hgt
                        col = rgb("#1f7a5e") if t < 0.3 else rgb("#2fae84") if t < 0.6 else rgb("#6fe6bb")
                        if (i * 3 + k) % 7 == 0:
                            col = rgb("#bff7e2")
                        if i == 0 or k == 12:
                            col = rgb("#16302c")
                    c.px(x, y - k, col)
        elif deco == "crown":
            # Blood-red royal banner with a gold crown.
            for i in range(-4, 5):
                x, y = at(0.5 + i / 16, 37)
                length = 24 - abs(i)
                for k in range(length):
                    c.px(x, y + k, rgb("#7d1f28") if abs(i) < 4 else rgb("#5a151d"))
                c.px(x, y - 1, GOLD)
                c.px(x, y + length, rgb("#c9a24a"))
            for i, ks in ((-2, (8, 9, 10, 11)), (-1, (10, 11)), (0, (7, 8, 9, 10, 11)), (1, (10, 11)), (2, (8, 9, 10, 11))):
                x, y = at(0.5 + i / 16, 37)
                for k in ks:
                    c.px(x, y + k, GOLD)
        elif deco in ("tapestry", "tapestryc"):
            # Great spectral tapestry behind the throne (tiles side by side).
            for i in range(0, 17):
                x, y = at(i / 16, 39)
                for k in range(35):
                    col = rgb("#0f3a35") if (i + k // 5) % 4 else rgb("#16504a")
                    if k > 26 and (i * 5 + k) % 3 == 0:
                        col = rgb("#2fae84")
                    c.px(x, y + k, col)
                c.px(x, y - 1, GOLD)
            if deco == "tapestryc":
                for i, ks in ((-5, range(6, 14)), (-4, range(9, 14)), (-3, range(10, 14)), (-2, range(8, 14)), (-1, range(10, 14)), (0, range(4, 14)), (1, range(10, 14)), (2, range(8, 14)), (3, range(10, 14)), (4, range(9, 14)), (5, range(6, 14))):
                    x, y = at(0.5 + i / 16, 39)
                    for k in ks:
                        c.px(x, y + k, rgb("#6fe6bb") if k < 13 else rgb("#2fae84"))
        elif deco == "window":
            for i in range(-2, 3):
                x, y = at(0.5 + i / 16, 30)
                for k in range(12):
                    c.px(x, y + k, rgb("#e8a24a") if abs(i) < 2 else rgb("#ffd28a"))
                c.px(x, y - 1, rgb("#1c2628"))
            x, y = at(0.5, 24)
            c.ellipse(x, y, 7, 6, (255, 190, 110, 35))
    return c.img


def king_statue(scale=2):
    """The King's own sprite (first idle frame) carved in weathered stone, `scale` times life size."""
    import king_sprite  # same folder

    if king_sprite.CUSTOM.exists():
        src = Image.open(king_sprite.CUSTOM).convert("RGBA").crop((0, 0, king_sprite.FW, king_sprite.FH))
    else:
        src = king_sprite.frame("idle", 0)
    lum = lambda p: (0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]) / 255
    solid = [src.getpixel((x, y)) for y in range(src.height) for x in range(src.width) if src.getpixel((x, y))[3] >= 128]
    lo, hi = min(map(lum, solid)), max(map(lum, solid))
    # Verdigris bronze, so the statue stands out from the grey plaza around it.
    ramp = [rgb(h) for h in ("#1d3531", "#2c5049", "#3f7265", "#5d9a88", "#9fd6c4")]
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    for y in range(src.height):
        for x in range(src.width):
            p = src.getpixel((x, y))
            if p[3] < 128:
                continue
            # Stretch the sprite's (dark) tones over the ramp, in flat steps.
            t = ((lum(p) - lo) / max(hi - lo, 0.01)) ** 0.75
            out.putpixel((x, y), ramp[min(len(ramp) - 1, int(t * len(ramp)))])
    big = out.resize((src.width * scale, src.height * scale), Image.Resampling.NEAREST)
    # A dark rim keeps the silhouette readable.
    rim = big.copy()
    for y in range(big.height):
        for x in range(big.width):
            if big.getpixel((x, y))[3]:
                continue
            if any(0 <= x + dx < big.width and 0 <= y + dy < big.height and big.getpixel((x + dx, y + dy))[3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                rim.putpixel((x, y), rgb("#0c1513"))
    return rim


def prop(name):
    c = Iso()
    rnd = random.Random("iso-" + name)
    if name == "bookshelf":
        c.box(1, 0.4, 30, rgb("#4a3424"), rgb("#3a281c"), rgb("#2e2016"), oy=-0.3)
        # Books on the front (+y) face.
        for shelf in range(3):
            z0 = 3 + shelf * 9
            t = 0.06
            while t < 0.94:
                w = rnd.choice((0.05, 0.07))
                col = rgb(rnd.choice(["#8a3b3b", "#3b5a8a", "#5a8a3b", "#8a7a3b", "#6a3b8a", "#3b8a7e"]))
                for zz in range(z0, z0 + rnd.choice((6, 7))):
                    for k in range(2):
                        x, y = P(-0.5 + t + k * 0.03, -0.1, zz)
                        c.px(x, y, col)
                t += w
            for k in range(17):
                x, y = P(-0.5 + k / 16, -0.1, z0 - 1)
                c.px(x, y, rgb("#5a4030"))
    elif name.startswith("table"):
        c.shadow(0.5)
        a, ox = 1.0, 0.0
        if name == "table_l":
            a, ox = 0.9, 0.05
        if name == "table_r":
            a, ox = 0.9, -0.05
        c.box(a, 0.7, 11, rgb("#8a5a36"), ox=ox)
        c.box(a, 0.42, 0.5, rgb("#e9e4d4"), z=11, ox=ox, outline=False)
        if name == "table_book":
            c.box(0.35, 0.25, 2, rgb("#f2ecd8"), z=11.5, ox=-0.1)
            c.box(0.2, 0.2, 4, rgb("#7a3b3b"), z=11.5, ox=0.25, oy=-0.1)
        elif name == "table_candle":
            x, y = P(0, 0, 12)
            c.rect(x - 1, y - 7, 2, 7, rgb("#e8e2cf"))
            c.ellipse(x, y - 9, 5, 5, (255, 210, 140, 45))
            c.px(x, y - 8, rgb("#ffd28a"))
            c.px(x, y - 9, rgb("#fff0b8"))
            for gx in (-0.3, 0.3):
                x2, y2 = P(gx, 0.1, 12)
                c.ellipse(x2, y2, 2, 1, GOLD)
        elif name == "table_map":
            c.box(0.7, 0.45, 0.5, rgb("#e6d9b0"), z=11.5, outline=False)
            x, y = P(0.1, 0, 12)
            c.px(x, y, rgb("#c23b3b"))
            c.px(x - 3, y + 1, rgb("#8a4b3b"))
        elif name == "table_flask":
            for gx, col in ((-0.3, "#6fdc8c"), (0.0, "#7cc8f2"), (0.3, "#d07ce8")):
                x, y = P(gx, 0, 12)
                c.rect(x - 1, y - 6, 2, 3, rgb("#c8d8d8"))
                c.ellipse(x, y - 2, 2, 2, rgb(col))
                c.px(x - 1, y - 3, rgb("#ffffff"))
    elif name in ("chair_n", "chair_s"):
        c.shadow(0.25)
        back = -0.18 if name == "chair_n" else 0.18
        if name == "chair_s":
            c.box(0.45, 0.45, 7, RED)
            c.box(0.45, 0.1, 16, rgb("#6a1f22"), oy=back)
        else:
            c.box(0.45, 0.1, 16, rgb("#6a1f22"), oy=back)
            c.box(0.45, 0.45, 7, RED)
    elif name == "bench":
        c.shadow(0.45)
        c.box(0.9, 0.12, 15, rgb("#6a1f22"), oy=-0.2)
        c.box(0.9, 0.42, 7, RED, oy=0.05)
    elif name == "plant":
        c.shadow(0.25)
        c.box(0.36, 0.36, 9, rgb("#8a5230"))
        x, y = P(0, 0, 9)
        for (dx, dy, r) in ((0, -6, 5), (-4, -3, 4), (4, -3, 4), (0, -10, 3.5), (-2, -8, 3)):
            c.ellipse(x + dx, y + dy, r, r * 0.85, rgb("#2f6b3a"))
        for _ in range(8):
            c.px(x - 5 + rnd.randrange(11), y - 12 + rnd.randrange(10), rgb("#4f9a52"))
        c.px(x - 2, y - 9, rgb("#d77ad8"))
        c.px(x + 3, y - 6, GLOW)
    elif name == "pillar":
        c.shadow(0.4)
        c.box(0.7, 0.7, 5, rgb("#6e7d7a"))
        c.box(0.48, 0.48, 46, rgb("#8a9a96"), rgb("#7b8b88"), rgb("#5f6d6a"), z=5)
        c.box(0.66, 0.66, 4, rgb("#8a9a96"), z=51)
    elif name == "statue":
        c.shadow(0.4)
        c.box(0.6, 0.6, 9, rgb("#5a6866"))
        x, y = P(0, 0, 9)
        c.ellipse(x, y - 9, 5, 9, rgb("#7b8b88"))
        c.ellipse(x + 1, y - 9, 3, 8, rgb("#6a7a77"))
        c.ellipse(x, y - 19, 3.6, 3.4, rgb("#8fa09c"))
        c.px(x - 1, y - 19, GLOW)
        c.px(x + 1, y - 19, GLOW)
    elif name == "throne":
        c.shadow(0.5)
        c.box(0.8, 0.7, 4, rgb("#4f3a24"))
        c.box(0.8, 0.2, 34, rgb("#4a3466"), z=0, oy=-0.28)
        c.box(0.8, 0.55, 12, rgb("#6a4c8a"), z=4, oy=0.08)
        c.box(0.12, 0.6, 18, GOLD, z=4, ox=-0.36, oy=0.05)
        c.box(0.12, 0.6, 18, GOLD, z=4, ox=0.36, oy=0.05)
        x, y = P(0, -0.38, 30)
        c.px(x, y, GLOW)
        c.px(x, y - 1, GLOW)
    elif name == "candles":
        c.shadow(0.2)
        c.box(0.15, 0.15, 18, GOLD)
        x, y = P(0, 0, 18)
        for dx in (-4, 0, 4):
            c.rect(x + dx - 1, y - 6, 2, 5, rgb("#e8e2cf"))
            c.px(x + dx, y - 7, rgb("#ffd28a"))
        c.rect(x - 4, y - 1, 9, 1, GOLD)
        c.ellipse(x, y - 7, 9, 6, (255, 210, 140, 40))
    elif name == "crystal":
        c.shadow(0.35)
        for (gx, gy, h) in ((-0.15, 0.05, 18), (0.12, -0.1, 24), (0.18, 0.18, 12)):
            c.box(0.14, 0.14, h, GLOW, rgb("#4fc89a"), rgb("#2f8a6a"), ox=gx, oy=gy)
        x, y = P(0, 0, 14)
        c.ellipse(x, y, 11, 10, (124, 242, 194, 35))
    elif name == "chest":
        c.shadow(0.4)
        c.box(0.7, 0.5, 10, rgb("#6a4c34"))
        c.box(0.7, 0.5, 3, rgb("#7a5a3e"), z=10)
        c.box(0.72, 0.08, 13, GOLD, outline=False)
    elif name == "gold":
        x, y = P(0, 0)
        for _ in range(26):
            dx, dy = rnd.uniform(-9, 9), rnd.uniform(-4, 3)
            h = (1 - abs(dx) / 10) * 5
            c.ellipse(x + dx, y + dy - h, 1.6, 1, GOLD)
            c.px(x + dx, y + dy - h - 1, rgb("#fff0b8"))
    elif name == "barrel":
        c.shadow(0.3)
        x, y = P(0, 0)
        for z in range(0, 16):
            w = 6 + (1.2 if 4 < z < 12 else 0)
            c.rect(x - w, y - z - 1, 2 * w, 1, rgb("#6a4a30") if z % 5 else rgb("#2b3135"))
            c.px(x - w, y - z - 1, rgb("#4a3424"))
        c.ellipse(x, y - 17, 6, 3, rgb("#8a6040"))
    elif name == "telescope":
        c.shadow(0.3)
        x, y = P(0, 0)
        for dx in (-5, 5, 0):
            for k in range(14):
                c.px(x + dx * (1 - k / 14), y - k + (2 if dx == 0 else 0), rgb("#4a3424"))
        for k in range(14):
            c.rect(x - 2 + k * 0.8, y - 15 - k * 0.6, 3, 3, rgb("#8a6b3a"))
        c.rect(x + 9, y - 25, 3, 4, GOLD)
    elif name == "map_table":
        c.shadow(0.45)
        x, y = P(0, 0)
        c.rect(x - 1, y - 10, 3, 10, rgb("#4a3424"))
        c.ellipse(x, y - 11, 11, 5.5, rgb("#5a3d27"))
        c.ellipse(x, y - 12, 10, 5, rgb("#8a5a36"))
        c.ellipse(x, y - 12, 6, 3, rgb("#e6d9b0"))
        c.px(x + 2, y - 13, rgb("#c23b3b"))
    elif name.startswith("forge"):
        f = name.endswith("1")
        c.box(1, 0.8, 22, rgb("#4a5654"), rgb("#3e4a48"), rgb("#2e3836"), oy=-0.1)
        c.box(0.5, 0.4, 14, rgb("#3a4644"), z=22, oy=-0.2)
        x, y = c.on_left(0.5, 0)
        x, y = P(0, 0.3, 0)
        c.rect(x - 7, y - 12, 9, 8, rgb("#1a0d08"))
        c.ellipse(x - 3, y - 7 - f, 4, 3, rgb("#e8742a"))
        c.ellipse(x - 3, y - 6, 2.4, 1.6 + f * 0.6, rgb("#ffd28a"))
        c.ellipse(x - 3, y - 8, 12, 10, (255, 140, 60, 35))
    elif name == "anvil":
        # On an oak stump, with a glowing ingot waiting for the hammer.
        c.shadow(0.4)
        c.box(0.52, 0.52, 6, rgb("#5a3d27"))
        c.box(0.3, 0.3, 5, rgb("#2b3135"), z=6)
        c.box(0.78, 0.36, 5, rgb("#5a656a"), z=11)
        c.box(0.22, 0.2, 3, rgb("#5a656a"), z=12, ox=0.46)
        x, y = P(-0.08, 0, 16)
        c.ellipse(x, y - 1, 7, 4, (255, 150, 60, 45))
        c.rect(x - 3, y - 1, 6, 2, rgb("#ff9a3a"))
        c.rect(x - 2, y - 1, 3, 1, rgb("#ffe0a0"))
    elif name == "trough":
        # Quenching trough: spectral water, a wisp of steam.
        c.shadow(0.45)
        c.box(0.9, 0.5, 8, WOOD)
        c.box(0.78, 0.38, 0.5, rgb("#2a8a6a"), z=8, outline=False)
        x, y = P(0, 0, 8.5)
        c.ellipse(x, y, 7, 2.2, rgb("#4fdcae"))
        c.px(x - 3, y, rgb("#d6fff0"))
        c.px(x + 4, y - 1, rgb("#d6fff0"))
        for k in range(7):
            c.px(x + 2 + (k % 3) - 1, y - 4 - k * 2, (214, 255, 240, 150 - k * 18))
        for gx in (-0.3, 0.3):
            bx, by = P(gx, 0.25, 4)
            c.rect(bx, by - 4, 1, 8, rgb("#2b3135"))
    elif name == "grindstone":
        c.shadow(0.35)
        c.box(0.55, 0.3, 7, WOOD)
        x, y = P(0, 0, 13)
        c.ellipse(x, y, 8, 8, rgb("#8a9a96"))
        c.ellipse(x - 1, y - 1, 6, 6, rgb("#a3b2ae"))
        c.ellipse(x, y, 5, 5, rgb("#6e7d7a"))
        c.ellipse(x, y, 1.6, 1.6, GOLD)
        for dx, dy in ((7, -3), (9, -5), (10, -2), (8, 0)):
            c.px(x + dx, y + dy, rgb("#ffd28a"))
    elif name == "coal":
        # A heap of coal with live embers in it.
        x, y = P(0, 0)
        c.ellipse(x, y, 13, 6, (0, 0, 0, 70))
        for _ in range(30):
            dx, dy = rnd.uniform(-10, 10), rnd.uniform(-4, 4)
            h = (1 - abs(dx) / 11) * 9
            c.ellipse(x + dx, y + dy - h, 2.4, 1.8, rgb(rnd.choice(["#15191b", "#1d2225", "#262c2f"])))
        for _ in range(7):
            dx = rnd.uniform(-7, 7)
            c.px(x + dx, y - rnd.uniform(2, 8), rgb(rnd.choice(["#e8742a", "#ffb347"])))
        c.ellipse(x, y - 5, 10, 7, (255, 120, 50, 28))
    elif name == "workbench":
        # Smith's bench: a hammer, tongs and a stack of ingots.
        c.shadow(0.5)
        c.box(1, 0.6, 11, rgb("#6a4a30"))
        c.box(0.26, 0.2, 2, rgb("#8d9aa0"), z=11, ox=0.28, oy=0.05)
        c.box(0.26, 0.2, 2, rgb("#8d9aa0"), z=13, ox=0.3, oy=0.02)
        c.box(0.2, 0.16, 2, rgb("#c9a24a"), z=11, ox=0.02, oy=-0.12)
        x, y = P(-0.28, 0.05, 11.5)
        c.rect(x - 4, y, 9, 1, rgb("#4a3424"))
        c.rect(x + 4, y - 2, 3, 4, rgb("#5a656a"))
        x, y = P(-0.05, 0.18, 11.5)
        for k in range(6):
            c.px(x + k, y - k // 2, rgb("#2b3135"))
            c.px(x + k, y + 1 - k // 3, rgb("#2b3135"))
    elif name.startswith("cauldron"):
        f = name.endswith("1")
        c.shadow(0.4)
        x, y = P(0, 0)
        c.ellipse(x, y - 6, 10, 7, rgb("#1c2224"))
        c.ellipse(x, y - 11, 9, 4, rgb("#2f3a3c"))
        c.ellipse(x, y - 11, 7.5, 3, rgb("#6fdc8c"))
        c.px(x - 3 + f * 4, y - 12, rgb("#d6ffe0"))
        c.px(x + 2 - f * 5, y - 11, rgb("#d6ffe0"))
        c.ellipse(x, y - 14, 12, 9, (124, 242, 140, 30))
        c.ellipse(x, y + 1, 5, 2, (232, 116, 42, 160))
    elif name == "rack":
        c.shadow(0.35)
        c.box(0.8, 0.12, 4, WOOD, z=2)
        c.box(0.8, 0.12, 3, WOOD, z=18)
        for gx in (-0.25, 0.0, 0.25):
            x, y = P(gx, 0)
            for k in range(26):
                c.px(x, y - k, rgb("#b8c4c8"))
            c.px(x, y - 26, GOLD)
            c.px(x - 1, y - 25, rgb("#b8c4c8"))
            c.px(x + 1, y - 25, rgb("#b8c4c8"))
    elif name == "bookshelf_side":
        c.box(0.4, 1, 30, rgb("#4a3424"), rgb("#2e2016"), rgb("#3a281c"), ox=-0.3)
        for shelf in range(3):
            z0 = 3 + shelf * 9
            t = 0.06
            while t < 0.94:
                col = rgb(rnd.choice(["#8a3b3b", "#3b5a8a", "#5a8a3b", "#8a7a3b", "#6a3b8a", "#3b8a7e"]))
                for zz in range(z0, z0 + rnd.choice((6, 7))):
                    for k in range(2):
                        x, y = P(-0.1, -0.5 + t + k * 0.03, zz)
                        c.px(x, y, col)
                t += rnd.choice((0.05, 0.07))
    elif name == "throne_big":
        # A giant throne of dark iron with dozens of swords fanned behind it.
        c.shadow(1.1)
        c.box(1.8, 1.5, 3, rgb("#1d2225"))
        c.box(1.6, 1.3, 3, rgb("#262c2f"), z=3)

        def sword(cx, cy, ang, ln, steel, edge, hilt_up):
            a = math.radians(ang)
            sx, sy = math.sin(a), -math.cos(a)
            for k in range(ln):
                x, y = cx + sx * k, cy + sy * k
                if hilt_up and k >= ln - 6:
                    c.px(x, y, rgb("#5a4420") if k < ln - 1 else rgb("#e6c66a"))
                    continue
                c.px(x, y, steel if k < ln - 2 or hilt_up else rgb("#c3ced2"))
                c.px(x + 1, y, edge)
                if k % 2:
                    c.px(x - 1, y, sh(steel, 0.6))
            if hilt_up:
                gx, gy = cx + sx * (ln - 7), cy + sy * (ln - 7)
                for t in (-3, -2, -1, 0, 1, 2, 3):
                    c.px(gx - sy * t, gy + sx * t, rgb("#b08a3a"))

        # Far row (long, dim), middle row, near row (short, bright). Some hilt-up.
        cx, cy = P(0, -0.55, 34)
        for n, ang in enumerate(range(-84, 85, 8)):
            sword(cx, cy, ang, int(56 - abs(ang) * 0.17 + (n * 7) % 8), rgb("#3f494e"), rgb("#15191b"), n % 4 == 1)
        cx, cy = P(0, -0.5, 30)
        for n, ang in enumerate(range(-76, 77, 9)):
            sword(cx + n % 2, cy, ang + 3, int(46 - abs(ang) * 0.15 + (n * 5) % 7), rgb("#5d696e"), rgb("#1c2124"), n % 3 == 0)
        cx, cy = P(0, -0.45, 26)
        for n, ang in enumerate(range(-66, 67, 12)):
            sword(cx, cy, ang - 2, int(34 - abs(ang) * 0.1 + (n * 3) % 5), rgb("#8d9aa0"), rgb("#2a3135"), n % 3 == 2)
        # Backrest, with a soul gem set at its crest.
        c.box(1.2, 0.3, 54, rgb("#30383c"), rgb("#262d30"), rgb("#161a1c"), z=6, oy=-0.5)
        for gx in (-0.5, -0.25, 0.0, 0.25, 0.5):
            c.box(0.1, 0.1, 9 if gx == 0 else 6, rgb("#59656a"), z=60, ox=gx, oy=-0.5)
        x, y = P(0, -0.34, 52)
        c.ellipse(x, y, 8, 7, (124, 242, 194, 45))
        c.ellipse(x, y, 2.4, 3, GLOW)
        c.px(x, y - 1, rgb("#e9fff6"))
        # Blades jutting from the sides.
        for side in (-1, 1):
            bx, by = P(0.66 * side, -0.1, 18)
            for ang, ln in ((58, 18), (74, 15), (44, 21), (88, 12)):
                sword(bx, by, ang * side, ln, rgb("#66737a"), rgb("#1c2124"), False)
        # Seat, cushion and armrests.
        c.box(1.1, 0.85, 14, rgb("#2a3034"), z=6, oy=0.08)
        c.box(0.9, 0.7, 2, rgb("#5a151d"), z=20, oy=0.1, outline=False)
        for gx in (-0.62, 0.62):
            c.box(0.2, 0.95, 26, rgb("#3a4347"), z=6, ox=gx, oy=0.05)
            x, y = P(gx, 0.5, 33)
            c.ellipse(x, y, 1.8, 1.8, GLOW)
    elif name == "knight_statue":
        c.shadow(0.45)
        c.box(0.74, 0.74, 3, rgb("#2b3235"))
        c.box(0.6, 0.6, 9, rgb("#3a4246"), z=3)
        x, y = P(0, 0, 12)
        iron, lit, dk = rgb("#4a5458"), rgb("#7c8a90"), rgb("#2a3033")
        c.rect(x - 3, y - 9, 3, 9, iron)
        c.rect(x + 1, y - 9, 3, 9, dk)
        c.rect(x - 4, y - 19, 9, 11, iron)
        c.rect(x + 2, y - 19, 3, 11, dk)
        c.rect(x - 4, y - 13, 9, 1, dk)
        c.ellipse(x - 5, y - 18, 2.4, 2.4, lit)
        c.ellipse(x + 5, y - 18, 2.4, 2.4, iron)
        c.rect(x - 6, y - 16, 2, 7, iron)
        c.rect(x + 5, y - 16, 2, 7, dk)
        c.ellipse(x, y - 23, 3.2, 3.6, iron)
        c.rect(x - 2, y - 24, 5, 1, rgb("#0d1011"))
        c.px(x - 1, y - 24, GLOW)
        c.px(x + 1, y - 24, GLOW)
        c.rect(x, y - 29, 1, 3, rgb("#7d1f28"))
        # Greatsword resting point-down in front.
        c.rect(x, y - 15, 1, 16, lit)
        c.rect(x - 2, y - 15, 5, 1, rgb("#c9a24a"))
        c.rect(x, y - 18, 1, 3, rgb("#5a4420"))
    elif name.startswith("candelabra"):
        f = 1 if name.endswith("1") else 0
        c.shadow(0.22)
        x, y = P(0, 0)
        brass, dkb = rgb("#b08a3a"), rgb("#6a5020")
        c.rect(x - 3, y, 7, 1, dkb)
        c.rect(x - 1, y - 1, 3, 1, brass)
        c.rect(x, y - 30, 1, 29, brass)
        c.px(x, y - 15, rgb("#e6c66a"))
        c.rect(x - 5, y - 29, 11, 1, brass)
        c.px(x - 5, y - 30, dkb)
        c.px(x + 5, y - 30, dkb)
        for k, dx in enumerate((-5, 0, 5)):
            top = y - 36 - (3 if dx == 0 else 0)
            c.ellipse(x + dx, top - 2, 5, 5, (255, 180, 90, 34))
            c.rect(x + dx, top, 1, 6, rgb("#e8dcc0"))
            fl = (f + k) % 2
            c.px(x + dx, top - 1, rgb("#ffb347"))
            c.px(x + dx, top - 2 - fl, rgb("#fff2c0"))
            if fl:
                c.px(x + dx, top - 2, rgb("#ffd27a"))
    elif name.startswith("brazier"):
        f = name.endswith("1")
        c.shadow(0.4)
        c.box(0.56, 0.56, 3, rgb("#2b3235"))
        c.box(0.4, 0.4, 9, rgb("#3a4246"), z=3)
        x, y = P(0, 0, 13)
        c.ellipse(x, y - 1, 8, 4, rgb("#1d2225"))
        c.ellipse(x, y - 2, 8, 3, rgb("#4a5458"))
        c.ellipse(x, y - 2, 6.5, 2.2, rgb("#123a30"))
        c.ellipse(x, y - 9, 13, 13, (124, 242, 194, 38))
        c.ellipse(x, y - 6 - f, 4.5, 6, rgb("#2fae84"))
        c.ellipse(x + (1 if f else -1), y - 9 - f, 2.8, 5.5, GLOW)
        c.ellipse(x - (1 if f else -1), y - 13 - f * 2, 1.2, 3, GLOW)
        c.ellipse(x, y - 5, 1.6, 2.4, rgb("#e9fff6"))
    elif name == "banner_stand":
        c.shadow(0.2)
        x, y = P(0, 0)
        c.rect(x, y - 44, 1, 44, rgb("#2b3135"))
        c.rect(x - 6, y - 44, 13, 1, rgb("#a88a44"))
        for k in range(30):
            w = 6 - (k // 26) * 3
            c.rect(x - w, y - 43 + k, 2 * w, 1, rgb("#1f4f4a") if k % 9 else rgb("#2a6a60"))
        c.ellipse(x, y - 30, 2.5, 3, GLOW)
    elif name == "orb":
        c.shadow(0.35)
        c.box(0.4, 0.4, 14, rgb("#4a3a5a"))
        x, y = P(0, 0, 14)
        c.ellipse(x, y - 7, 14, 13, (90, 160, 255, 35))
        c.ellipse(x, y - 7, 6, 6, rgb("#3a7ad8"))
        c.ellipse(x - 1, y - 8, 3.5, 3.5, rgb("#7ab8ff"))
        c.px(x - 2, y - 10, rgb("#ffffff"))
    elif name == "potion_tank":
        c.shadow(0.35)
        c.box(0.5, 0.5, 5, rgb("#2b3135"))
        x, y = P(0, 0, 5)
        c.ellipse(x, y - 14, 12, 16, (124, 242, 140, 35))
        for k in range(26):
            c.rect(x - 6, y - k, 12, 1, rgb("#4fdc8c") if k < 20 else rgb("#9af0bc"))
            c.px(x - 6, y - k, rgb("#2f8a5a"))
            c.px(x + 5, y - k, rgb("#d6ffe0"))
        for k in (5, 11, 16):
            c.px(x - 2 + k % 4, y - k, rgb("#e9fff6"))
        c.box(0.5, 0.5, 4, rgb("#2b3135"), z=31)
    elif name.startswith("fountain"):
        f = name.endswith("1")
        x, y = P(0, 0)
        c.ellipse(x, y, 30, 15, (0, 0, 0, 70))
        c.ellipse(x, y - 4, 28, 13, rgb("#4f5a57"))
        c.ellipse(x, y - 6, 26, 11.5, rgb("#5f6b67"))
        c.ellipse(x, y - 6, 23, 9.5, rgb("#2a8a6a"))
        c.ellipse(x, y - 6, 20, 8, rgb("#4fdcae"))
        for k in range(6):
            c.px(x - 16 + k * 6 + (2 if f else 0), y - 6 + (k % 2), rgb("#d6fff0"))
        # A stone statue of the King, larger than life, rising from the pool.
        c.box(0.62, 0.62, 10, rgb("#5f6b67"), z=6)
        c.box(0.5, 0.5, 3, rgb("#6f7d79"), z=16)
        statue = king_statue()
        sx, sy = P(0, 0, 19)
        c.img.alpha_composite(statue, (int(sx - statue.width / 2), int(sy - statue.height + 2)))
        # Spectral water spilling from the plinth.
        for k in range(7):
            c.px(x - 9 + (k % 2), y - 14 + k * 2, (124, 242, 194, 160))
            c.px(x + 9 - (k % 2), y - 14 + k * 2, (124, 242, 194, 160))
    elif name.startswith("lantern"):
        f = name.endswith("1")
        c.shadow(0.2)
        x, y = P(0, 0)
        c.rect(x, y - 30, 1, 30, rgb("#2b3135"))
        c.rect(x, y - 31, 5, 1, rgb("#2b3135"))
        c.ellipse(x + 4, y - 25, 10, 10, (124, 242, 194, 45 + (10 if f else 0)))
        c.rect(x + 2, y - 29, 5, 7, rgb("#1a2224"))
        c.rect(x + 3, y - 28, 3, 5, GLOW if not f else rgb("#9af7d6"))
        c.px(x + 4, y - 26, rgb("#e9fff6"))
    elif name == "tree_dead":
        c.shadow(0.4)
        x, y = P(0, 0)
        bark, bark_d = rgb("#2b2a2e"), rgb("#1c1b1f")
        for k in range(30):
            w = 3 - k // 12
            c.rect(x - w + (k // 10) * (1 if k % 2 else 0), y - k, 2 * w, 1, bark if k % 4 else bark_d)
        def branch(x0, y0, dx, dy, n, w):
            for i in range(n):
                c.rect(x0 + dx * i, y0 + dy * i, w, 1, bark)
            return x0 + dx * n, y0 + dy * n
        bx, by = branch(x, y - 22, -1, -1, 8, 2)
        branch(bx, by, -1, 0.3, 4, 1)
        branch(bx, by, 0.3, -1, 5, 1)
        bx, by = branch(x + 1, y - 26, 1, -1, 7, 2)
        branch(bx, by, 1, 0.4, 4, 1)
        branch(bx, by, -0.2, -1, 6, 1)
        branch(x, y - 30, 0.2, -1, 8, 1)
        for _ in range(4):
            c.px(x - 10 + rnd.randrange(20), y - 30 - rnd.randrange(10), GLOW)
    elif name == "grave":
        c.shadow(0.25)
        c.box(0.35, 0.14, 13, rgb("#5a6562"), oy=-0.1)
        x, y = P(0, -0.03, 13)
        c.ellipse(x - 1, y - 1, 4, 2.5, rgb("#6a7572"))
        c.rect(x - 2, y + 3, 3, 1, rgb("#3a4442"))
        c.rect(x - 1, y + 2, 1, 3, rgb("#3a4442"))
        c.ellipse(x, y + 14, 6, 2, rgb("#2f6b4f"))
    elif name == "broken_pillar":
        c.shadow(0.35)
        c.box(0.6, 0.6, 4, rgb("#5a6866"))
        c.box(0.42, 0.42, 18, rgb("#7b8b88"), z=4)
        c.box(0.2, 0.25, 6, rgb("#7b8b88"), z=22, ox=-0.1)
        x, y = P(0.5, 0.3)
        c.box(0.4, 0.2, 5, rgb("#6e7d7a"), ox=0.25, oy=0.4)
    elif name == "toilet":
        # Porcelain throne of the island's bathroom: cistern at the back, bowl in front.
        c.shadow(0.3)
        white = rgb("#e4ebe8")
        c.box(0.5, 0.22, 17, white, oy=-0.28)
        c.box(0.42, 0.46, 8, white, oy=0.1)
        x, y = P(0, 0.1, 8)
        c.ellipse(x, y, 5, 2.4, rgb("#9aa8a4"))
        c.ellipse(x, y, 4, 1.8, rgb("#2a8a6a"))
        c.ellipse(x, y, 2.6, 1, rgb("#4fdcae"))
        x, y = P(0.16, -0.17, 13)
        c.rect(x, y, 2, 1, GOLD)
    elif name == "sink":
        c.shadow(0.3)
        c.box(0.2, 0.2, 9, rgb("#8a9a96"))
        c.box(0.6, 0.45, 4, rgb("#e4ebe8"), z=9)
        x, y = P(0, 0.02, 13)
        c.ellipse(x, y, 5, 2.2, rgb("#9aa8a4"))
        c.ellipse(x, y, 4, 1.6, rgb("#4fdcae"))
        x, y = P(0, -0.16, 13)
        c.rect(x, y - 4, 1, 4, rgb("#b8c4c8"))
        c.rect(x, y - 4, 2, 1, rgb("#b8c4c8"))
    elif name == "bed":
        c.shadow(0.5)
        c.box(0.7, 0.95, 7, rgb("#5a3d27"))
        c.box(0.62, 0.86, 3, rgb("#2e5a54"), z=7, oy=0.04)
        c.box(0.55, 0.22, 4, rgb("#e6e2d4"), z=7, oy=-0.3)
        c.box(0.7, 0.1, 14, rgb("#5a3d27"), oy=-0.45)
    elif name == "sleeper":
        # Greyscale blanket + hooded head on the pillow; tinted with the cloak colour.
        c.box(0.6, 0.6, 5, rgb("#d8d8d8"), rgb("#bdbdbd"), rgb("#a0a0a0"), z=8, oy=0.12)
        x, y = P(0, -0.3, 11)
        c.ellipse(x, y - 2, 4, 3.4, rgb("#20262a"))
        c.px(x - 1, y - 2, GLOW)
        c.px(x + 1, y - 2, GLOW)
    elif name == "zz":
        x, y = P(0, 0, 26)
        for i, (dx, dy) in enumerate(((-4, 6), (0, 0), (5, -7))):
            s = 2 + i
            col = (220, 245, 238, 230)
            c.rect(x + dx, y + dy, s, 1, col)
            for k in range(s):
                c.px(x + dx + s - 1 - k, y + dy + k, col)
            c.rect(x + dx, y + dy + s - 1, s, 1, col)
    return c.img


def cliff(name):
    """Rock under the island's edge, going down into the mist."""
    c = Iso()
    rnd = random.Random(name)
    depth = 64
    c.box(1, 1, depth, rgb("#20292a"), rgb("#2a3536"), rgb("#1c2526"), z=-depth, outline=False)
    for z in range(-depth + 4, 0, 5):
        for t in [i / 16 for i in range(17)]:
            if rnd.random() < 0.55:
                c.px(*c.on_left(t, z + rnd.choice((0, 1))), rgb("#1e2828"))
                c.px(*c.on_right(t, z + rnd.choice((0, 1))), rgb("#161e1f"))
    # Moss on the rim, glowing drips.
    for t in [i / 16 for i in range(17)]:
        for k in range(rnd.randrange(1, 5)):
            c.px(*c.on_left(t, -k), rgb("#2f6b4f"))
            c.px(*c.on_right(t, -k), rgb("#24513f"))
    for _ in range(3):
        at = c.on_left if rnd.random() < 0.5 else c.on_right
        t = rnd.random()
        for k in range(rnd.randrange(6, 20)):
            c.px(*at(t, -k), (124, 242, 194, 120))
    if name.startswith("cliff_fall"):
        at = c.on_left if name.endswith("L") else c.on_right
        for k in range(depth):
            for dt in (-2, -1, 0, 1, 2):
                col = rgb("#7cf2c2") if abs(dt) < 2 and (k + dt) % 5 else rgb("#3fbf8a")
                c.px(*at(0.5 + dt / 16, -k), (*col[:3], 220 - k * 2))
    # Fade into the mist at the bottom.
    for y in range(CELL_H):
        for x in range(CELL_W):
            px_ = c.img.getpixel((x, y))
            if px_[3] and y > AY + 30:
                k = min(1, (y - AY - 30) / 34)
                c.img.putpixel((x, y), (px_[0], px_[1], px_[2], int(px_[3] * (1 - k))))
    return c.img


STAIRS = [f"stair{h}_{k}" for h in (0, 4, 8, 12) for k in ("stone", "cl", "cm", "cr")]
FLOORS = STAIRS + ["floor_dark", "floor_stone", "floor_wood", "floor_check", "runner", "carpet", "rug", "path", "earth", "plaza", "rune", "dais"]
CLIFFS = ["cliff", "cliff_fall_L", "cliff_fall_R"]
WALLS = ["wall_tall", "wall_low", "wall_broken"] + [f"wall_tall_{s}_{d}" for s in ("L", "R") for d in ("torch0", "torch1", "banner", "window", "gwindow", "crown", "tapestry", "tapestryc")]
PROPS = [
    "bookshelf", "table_l", "table_m", "table_r", "table_book", "table_candle", "table_map", "table_flask",
    "chair_n", "chair_s", "bench", "plant", "pillar", "statue", "throne", "candles", "crystal", "chest", "gold",
    "barrel", "telescope", "map_table", "forge0", "forge1", "anvil", "cauldron0", "cauldron1", "rack", "bed",
    "sleeper", "zz", "bookshelf_side", "throne_big", "brazier0", "brazier1", "banner_stand", "orb", "potion_tank",
    "knight_statue", "candelabra0", "candelabra1", "fountain0", "fountain1", "lantern0", "lantern1", "tree_dead", "grave", "broken_pillar",
    "toilet", "sink", "trough", "grindstone", "coal", "workbench",
]


def backdrop(path):
    """Misty sky with distant ruined spires (screen-space background)."""
    W, H = 960, 540
    img = Image.new("RGBA", (W, H))
    px = img.load()
    rnd = random.Random("backdrop")
    top, mid, bot = rgb("#04090a"), rgb("#081715"), rgb("#050d0d")
    for y in range(H):
        t = y / H
        a, b, k = (top, mid, t / 0.55) if t < 0.55 else (mid, bot, (t - 0.55) / 0.45)
        col = tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)) + (255,)
        for x in range(W):
            px[x, y] = col
    d = ImageDraw.Draw(img)
    # Distant spires and broken towers (two layers).
    for layer, (col, base, hmax) in enumerate(((rgb("#081312"), 330, 190), (rgb("#060e0d"), 380, 140))):
        x = -20
        while x < W:
            w = rnd.randrange(18, 46)
            h = rnd.randrange(40, hmax)
            d.rectangle([x, base - h, x + w, H], fill=col)
            if rnd.random() < 0.6:
                d.polygon([(x - 2, base - h), (x + w // 2, base - h - rnd.randrange(16, 50)), (x + w + 2, base - h)], fill=col)
            if rnd.random() < 0.5:
                for k in range(3):
                    wx = x + 4 + rnd.randrange(max(1, w - 8))
                    wy = base - h + 10 + rnd.randrange(max(1, h - 20))
                    d.rectangle([wx, wy, wx + 2, wy + 4], fill=rgb("#3fbf8a", 60 if layer else 35))
            x += w + rnd.randrange(10, 60)
    # Fog bands.
    fog = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fog)
    for _ in range(26):
        cx, cy = rnd.randrange(W), rnd.randrange(220, H)
        rx, ry = rnd.randrange(80, 260), rnd.randrange(10, 30)
        fd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(90, 150, 138, rnd.randrange(5, 13)))
    img = Image.alpha_composite(img, fog)
    # Faint stars.
    for _ in range(60):
        x, y = rnd.randrange(W), rnd.randrange(160)
        img.putpixel((x, y), (200, 240, 230, rnd.randrange(30, 90)))
    img.save(path)


def build(out_path, manifest):
    names = FLOORS + CLIFFS + WALLS + PROPS
    cols = 16
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGBA", (cols * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    index = {}
    for i, n in enumerate(names):
        img = floor_tile(n) if n in FLOORS else cliff(n) if n in CLIFFS else wall(n) if n in WALLS else prop(n)
        sheet.paste(img, ((i % cols) * CELL_W, (i // cols) * CELL_H))
        index[n] = i
    sheet.save(out_path)
    backdrop(out_path.parent / "castle-backdrop.png")
    manifest["environments"]["castle-backdrop"] = {"image": "environments/castle-backdrop.png", "width": 960, "height": 540}
    manifest["environments"]["castle-iso"] = {
        "image": "environments/castle-iso.png",
        "width": sheet.width,
        "height": sheet.height,
        "cellWidth": CELL_W,
        "cellHeight": CELL_H,
        "anchorX": AX,
        "anchorY": AY,
        "columns": cols,
        "tiles": index,
    }
