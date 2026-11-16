"""The castle's King: an original NPC (not a Claude Code agent). 32x32 frames.

Rows: idle (4), walk (6), sit (4), whip (4). Faces right; feet at (16, 30).
A gaunt spectral monarch: iron crown with a soul-flame, long teal mantle with a
gold hem, pale skull-like face, a whip of green mist.
"""
from __future__ import annotations

from PIL import Image

FW = FH = 32
ROWS = [("idle", 4), ("walk", 6), ("sit", 4), ("whip", 4)]


def rgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


MANTLE, MANTLE_D, MANTLE_L = rgb("#1d4a47"), rgb("#12302f"), rgb("#2a6a62")
ROBE, ROBE_D = rgb("#2a2338"), rgb("#1c1727")
GOLD, GOLD_D = rgb("#d7b45a"), rgb("#9a7a34")
BONE, BONE_D = rgb("#d9e0d6"), rgb("#9aa69c")
IRON = rgb("#3a4448")
GLOW, GLOW_L = rgb("#7cf2c2"), rgb("#e9fff6")
OUT = rgb("#07090c")


class F:
    def __init__(self):
        self.img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < FW and 0 <= y < FH:
            self.img.putpixel((x, y), c)

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n
            self.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)

    def outline(self):
        src = self.img.copy()
        for y in range(FH):
            for x in range(FW):
                if src.getpixel((x, y))[3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < FW and 0 <= ny < FH and src.getpixel((nx, ny))[3] == 255:
                        self.img.putpixel((x, y), OUT)
                        break


def head(f, x, y, flame):
    """Skull-pale face under an iron crown; (x, y) is the top-left of the face."""
    f.rect(x, y, 7, 6, BONE)
    f.rect(x, y + 5, 7, 1, BONE_D)
    f.rect(x + 1, y + 6, 5, 1, BONE_D)  # jaw
    f.px(x + 3, y + 2, GLOW)  # eyes (facing right)
    f.px(x + 5, y + 2, GLOW)
    f.px(x + 4, y + 4, ROBE_D)
    # Crown: iron band, three spikes, a soul-flame in the middle one.
    f.rect(x - 1, y - 2, 9, 2, IRON)
    f.rect(x - 1, y - 2, 9, 1, GOLD_D)
    for sx in (x - 1, x + 3, x + 7):
        f.rect(sx, y - 4, 1, 2, GOLD)
    f.px(x + 3, y - 5 - flame, GLOW)
    f.px(x + 3, y - 6 - flame, GLOW_L if flame else GLOW)


def body(f, bob=0, sway=0, legs=0, arm=0):
    """Standing/walking body. arm: 0 rest, 1..3 whip phases."""
    y0 = 9 + bob
    # Mantle behind (trails to the left).
    for i in range(18):
        w = 5 + i // 3 + (sway if i > 9 else 0)
        f.rect(12 - w // 2 - (i // 5), y0 + 2 + i, w, 1, MANTLE_D if i % 5 == 4 else MANTLE)
    # Robe.
    for i in range(17):
        w = 7 + i // 4
        f.rect(13 - (i // 8), y0 + 3 + i, w, 1, ROBE if i % 6 else ROBE_D)
    f.rect(13, y0 + 3, 8, 2, MANTLE_L)  # shoulders
    f.rect(13, y0 + 5, 8, 1, GOLD)  # collar chain
    f.rect(16, y0 + 6, 1, 12, GOLD_D)  # robe seam
    # Hem and feet.
    hem = y0 + 20
    f.rect(11, hem, 12, 1, GOLD)
    fy = 29
    if legs == 0:
        f.rect(13, fy, 3, 1, IRON)
        f.rect(18, fy, 3, 1, IRON)
    elif legs == 1:
        f.rect(12, fy, 3, 1, IRON)
        f.rect(20, fy - 1, 3, 1, IRON)
    else:
        f.rect(15, fy - 1, 3, 1, IRON)
        f.rect(18, fy, 3, 1, IRON)
    head(f, 14, y0 - 4, flame=(bob + legs) % 2)
    # Arm and whip.
    sx, sy = 21, y0 + 6
    if arm == 0:
        f.rect(sx, sy, 2, 6, MANTLE_L)
        f.px(sx + 1, sy + 6, BONE)
        f.line(sx + 1, sy + 7, sx + 2, sy + 12, GLOW)  # coiled whip
    elif arm == 1:  # wind up, whip behind
        f.line(sx, sy, sx - 2, sy - 6, MANTLE_L)
        f.px(sx - 2, sy - 7, BONE)
        f.line(sx - 2, sy - 8, 6, sy - 10, GLOW)
        f.line(6, sy - 10, 3, sy - 6, GLOW)
    elif arm == 2:  # crack: whip forward
        f.line(sx, sy, sx + 4, sy - 2, MANTLE_L)
        f.px(sx + 5, sy - 2, BONE)
        f.line(sx + 5, sy - 3, 30, sy - 8, GLOW)
        f.line(30, sy - 8, 31, sy - 2, GLOW_L)
        f.px(31, sy - 1, GLOW_L)
    else:  # follow through
        f.line(sx, sy, sx + 4, sy + 2, MANTLE_L)
        f.px(sx + 5, sy + 2, BONE)
        f.line(sx + 5, sy + 3, 29, sy + 8, GLOW)
        f.px(30, sy + 9, GLOW_L)


def sitting(f, k):
    """Seen from the front, seated; base of the mantle at y=30."""
    y0 = 12
    for i in range(17):
        w = 14 + i // 3
        f.rect(16 - w // 2, y0 + 2 + i, w, 1, MANTLE if i % 5 else MANTLE_D)
    f.rect(11, y0 + 2, 10, 9, ROBE)
    f.rect(10, y0 + 2, 12, 2, MANTLE_L)
    f.rect(11, y0 + 4, 10, 1, GOLD)
    f.rect(10, y0 + 10, 12, 4, ROBE_D)  # lap
    f.rect(10, y0 + 13, 12, 1, GOLD)
    f.rect(11, y0 + 14, 3, 4, ROBE)
    f.rect(18, y0 + 14, 3, 4, ROBE)
    f.rect(11, 29, 3, 1, IRON)
    f.rect(18, 29, 3, 1, IRON)
    # Hands on the armrests, one drumming.
    f.px(9, y0 + 9 - (1 if k == 2 else 0), BONE)
    f.px(22, y0 + 9, BONE)
    # Face to the front.
    x, y = 13, y0 - 5
    f.rect(x, y, 7, 6, BONE)
    f.rect(x + 1, y + 6, 5, 1, BONE_D)
    if k != 3:
        f.px(x + 1, y + 2, GLOW)
        f.px(x + 5, y + 2, GLOW)
    else:
        f.rect(x + 1, y + 2, 2, 1, BONE_D)  # blink
        f.rect(x + 4, y + 2, 2, 1, BONE_D)
    f.px(x + 3, y + 4, ROBE_D)
    f.rect(x - 1, y - 2, 9, 2, IRON)
    f.rect(x - 1, y - 2, 9, 1, GOLD_D)
    for sx in (x - 1, x + 3, x + 7):
        f.rect(sx, y - 4, 1, 2, GOLD)
    f.px(x + 3, y - 5 - (k % 2), GLOW)
    f.px(x + 3, y - 6 - (k % 2), GLOW_L)


def frame(anim, k):
    f = F()
    if anim == "idle":
        body(f, bob=1 if k in (1, 2) else 0, sway=1 if k >= 2 else 0)
    elif anim == "walk":
        body(f, bob=1 if k % 3 == 1 else 0, sway=k % 2, legs=(1, 0, 2, 1, 0, 2)[k])
    elif anim == "sit":
        sitting(f, k)
    else:
        body(f, arm=(1, 2, 3, 0)[k], bob=1 if k == 2 else 0)
    f.outline()
    return f.img


def build(out_path, manifest):
    cols = max(n for _, n in ROWS)
    sheet = Image.new("RGBA", (cols * FW, len(ROWS) * FH), (0, 0, 0, 0))
    anims = {}
    for r, (name, n) in enumerate(ROWS):
        for k in range(n):
            sheet.paste(frame(name, k), (k * FW, r * FH))
        anims[name] = {"row": r, "frames": n}
    sheet.save(out_path)
    manifest["environments"]["king"] = {"image": "characters/king.png", "width": sheet.width, "height": sheet.height, "frameWidth": FW, "frameHeight": FH, "anchorX": 16, "anchorY": 30, "animations": anims}
