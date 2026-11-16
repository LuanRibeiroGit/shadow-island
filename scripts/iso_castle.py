"""Isometric castle art (original, procedural). Imported by generate-assets.py.

Every sprite lives in a CELL_W x CELL_H cell; the anchor (AX, AY) is the centre
of the tile's floor diamond, so the renderer places any sprite with the same
anchor and sorts by depth. Floor diamonds are 32x16 (2:1 isometric).
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw

CELL_W, CELL_H = 96, 136
AX, AY = 48, 68
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

    fns = {"path": path, "earth": earth, "plaza": plaza, "rune": rune, "dais": dais, "floor_stone": stone, "floor_check": check, "floor_wood": wood, "runner": runner, "carpet": runner, "rug": rug}
    return Iso().floor(fns[name]).img


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
        c.shadow(0.7)
        c.box(1, 0.8, 5, rgb("#3a3350"))
        c.box(1, 0.8, 1, rgb("#a88a44"), z=5, outline=False)
        c.box(0.9, 0.25, 52, rgb("#1f2a2e"), rgb("#2a3a3c"), rgb("#18201f"), z=6, oy=-0.3)
        # Spiked crown on the backrest with a glowing soul gem.
        for gx in (-0.35, 0.0, 0.35):
            c.box(0.12, 0.12, 12 if gx == 0 else 8, rgb("#2a3a3c"), z=58, ox=gx, oy=-0.3)
        x, y = P(0, -0.15, 46)
        c.ellipse(x, y, 9, 8, (124, 242, 194, 50))
        c.ellipse(x, y, 2.6, 3.2, GLOW)
        c.px(x, y - 1, rgb("#e9fff6"))
        c.box(0.8, 0.55, 14, rgb("#2e5a54"), z=6, oy=0.1)
        c.box(0.15, 0.6, 22, rgb("#a88a44"), z=6, ox=-0.42, oy=0.05)
        c.box(0.15, 0.6, 22, rgb("#a88a44"), z=6, ox=0.42, oy=0.05)
        for gx in (-0.42, 0.42):
            x, y = P(gx, 0.05, 30)
            c.ellipse(x, y, 2, 2, GLOW)
    elif name.startswith("brazier"):
        f = name.endswith("1")
        c.shadow(0.3)
        c.box(0.14, 0.14, 14, rgb("#2b3135"))
        x, y = P(0, 0, 14)
        c.ellipse(x, y, 7, 3, rgb("#3a4448"))
        c.ellipse(x, y - 1, 6, 2.2, rgb("#1a2224"))
        c.ellipse(x, y - 6, 12, 11, (124, 242, 194, 40))
        c.ellipse(x, y - 4 - f, 4, 5, rgb("#3fbf8a"))
        c.ellipse(x + (1 if f else -1), y - 6 - f, 2.4, 4, GLOW)
        c.ellipse(x, y - 3, 1.4, 2, rgb("#e9fff6"))
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
        # Hooded statue holding a lantern, rising from the pool.
        c.box(0.5, 0.5, 10, rgb("#5f6b67"), z=6)
        c.ellipse(x, y - 34, 6, 16, rgb("#6f7d79"))
        c.ellipse(x + 2, y - 34, 3.5, 15, rgb("#5a6764"))
        c.ellipse(x, y - 52, 4.6, 4.2, rgb("#7d8b87"))
        c.px(x - 1, y - 52, GLOW)
        c.px(x + 1, y - 52, GLOW)
        c.rect(x + 6, y - 46, 1, 8, rgb("#5a6764"))
        c.ellipse(x + 6, y - 37, 9, 9, (124, 242, 194, 55))
        c.ellipse(x + 6, y - 37, 2.4, 3, GLOW)
        # Spectral water streaming down.
        for k in range(10):
            c.px(x - 4 + (k % 2), y - 26 + k * 2, (124, 242, 194, 160))
            c.px(x + 4 - (k % 2), y - 26 + k * 2, (124, 242, 194, 160))
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


FLOORS = ["floor_stone", "floor_wood", "floor_check", "runner", "carpet", "rug", "path", "earth", "plaza", "rune", "dais"]
CLIFFS = ["cliff", "cliff_fall_L", "cliff_fall_R"]
WALLS = ["wall_tall", "wall_low", "wall_broken"] + [f"wall_tall_{s}_{d}" for s in ("L", "R") for d in ("torch0", "torch1", "banner", "window")]
PROPS = [
    "bookshelf", "table_l", "table_m", "table_r", "table_book", "table_candle", "table_map", "table_flask",
    "chair_n", "chair_s", "bench", "plant", "pillar", "statue", "throne", "candles", "crystal", "chest", "gold",
    "barrel", "telescope", "map_table", "forge0", "forge1", "anvil", "cauldron0", "cauldron1", "rack", "bed",
    "sleeper", "zz", "bookshelf_side", "throne_big", "brazier0", "brazier1", "banner_stand", "orb", "potion_tank",
    "fountain0", "fountain1", "lantern0", "lantern1", "tree_dead", "grave", "broken_pillar",
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
