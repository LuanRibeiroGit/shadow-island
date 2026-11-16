"""Isometric castle art (original, procedural). Imported by generate-assets.py.

Every sprite lives in a CELL_W x CELL_H cell; the anchor (AX, AY) is the centre
of the tile's floor diamond, so the renderer places any sprite with the same
anchor and sorts by depth. Floor diamonds are 32x16 (2:1 isometric).
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw

CELL_W, CELL_H = 32, 80
AX, AY = 16, 68
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
        return (t * HW, AY + t * HH - z)

    def on_right(self, t, z):
        return (HW + t * HW, AY + HH - t * HH - z)


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

    fns = {"floor_stone": stone, "floor_check": check, "floor_wood": wood, "runner": runner, "carpet": runner, "rug": rug}
    return Iso().floor(fns[name]).img


def wall(name):
    c = Iso()
    tall = name.startswith("wall_tall")
    h = WALL_TALL if tall else WALL_LOW
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
        elif deco == "window":
            for i in range(-2, 3):
                x, y = at(0.5 + i / 16, 30)
                for k in range(12):
                    c.px(x, y + k, rgb("#e8a24a") if abs(i) < 2 else rgb("#ffd28a"))
                c.px(x, y - 1, rgb("#1c2628"))
            x, y = at(0.5, 24)
            c.ellipse(x, y, 7, 6, (255, 190, 110, 35))
    return c.img


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
        c.shadow(0.35)
        c.box(0.3, 0.3, 8, rgb("#2b3135"))
        c.box(0.7, 0.32, 5, rgb("#5a656a"), z=8)
        c.box(0.2, 0.2, 3, rgb("#5a656a"), z=9, ox=0.4)
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


FLOORS = ["floor_stone", "floor_wood", "floor_check", "runner", "carpet", "rug"]
WALLS = ["wall_tall", "wall_low"] + [f"wall_tall_{s}_{d}" for s in ("L", "R") for d in ("torch0", "torch1", "banner", "window")]
PROPS = [
    "bookshelf", "table_l", "table_m", "table_r", "table_book", "table_candle", "table_map", "table_flask",
    "chair_n", "chair_s", "bench", "plant", "pillar", "statue", "throne", "candles", "crystal", "chest", "gold",
    "barrel", "telescope", "map_table", "forge0", "forge1", "anvil", "cauldron0", "cauldron1", "rack", "bed",
    "sleeper", "zz",
]


def build(out_path, manifest):
    names = FLOORS + WALLS + PROPS
    cols = 16
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGBA", (cols * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    index = {}
    for i, n in enumerate(names):
        img = floor_tile(n) if n in FLOORS else wall(n) if n in WALLS else prop(n)
        sheet.paste(img, ((i % cols) * CELL_W, (i // cols) * CELL_H))
        index[n] = i
    sheet.save(out_path)
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
