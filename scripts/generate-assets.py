#!/usr/bin/env python3
"""Generates the original pixel-art assets of Ilha das Sombras.

All art is drawn procedurally here (no external images), so it is original and
reproducible. Output goes to assets/ together with assets/manifest.json, which is
the only thing the game code reads. Replace any PNG (keeping the manifest layout)
to reskin the game without touching code.

Usage: python3 scripts/generate-assets.py
"""
from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# ---------------------------------------------------------------- helpers


def hexrgb(h: str, a: int = 255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, k: float):
    r, g, b, a = c
    return (max(0, min(255, int(r * k))), max(0, min(255, int(g * k))), max(0, min(255, int(b * k))), a)


def mix(c1, c2, t: float):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4))


class Canvas:
    def __init__(self, w: int, h: int):
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.w, self.h = w, h

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h and c[3] > 0:
            if c[3] == 255:
                self.img.putpixel((x, y), c)
            else:
                base = self.img.getpixel((x, y))
                if base[3] == 0:
                    self.img.putpixel((x, y), c)
                else:
                    self.img.putpixel((x, y), mix(base, (c[0], c[1], c[2], 255), c[3] / 255))

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for yy in range(int(cy - ry - 1), int(cy + ry + 2)):
            for xx in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((xx - cx) / max(rx, 0.5)) ** 2 + ((yy - cy) / max(ry, 0.5)) ** 2 <= 1.0:
                    self.px(xx, yy, c)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(n, 1)
            self.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)

    def outline(self, color):
        """Add a 1px outline around opaque pixels (classic sprite look)."""
        src = self.img.copy()
        for y in range(self.h):
            for x in range(self.w):
                if src.getpixel((x, y))[3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < self.w and 0 <= ny < self.h and src.getpixel((nx, ny))[3] > 160:
                            self.img.putpixel((x, y), color)
                            break


OUTLINE = hexrgb("#0a1214")
VOID = hexrgb("#05090a")

# ------------------------------------------------------------ characters

FW, FH = 24, 24
ANIMS = [
    ("idle", 4, 4, True),
    ("move", 6, 10, True),
    ("work", 4, 8, True),
    ("read", 4, 4, True),
    ("cast", 4, 7, True),
    ("attack", 4, 9, True),
    ("wait", 4, 3, True),
    ("cheer", 4, 8, True),
    ("hurt", 3, 8, False),
]

CLASSES = {
    # id: (cloak, trim, glow, item, hood)
    "lantern_keeper": ("#2c4a52", "#d7b45a", "#7cf2c2", "lantern", "crown"),
    "wraith_scholar": ("#3a3f6b", "#a9b4ff", "#9fe7ff", "book", "hood"),
    "spectral_smith": ("#5a3b2e", "#f0a35c", "#ffd28a", "hammer", "cap"),
    "mist_alchemist": ("#2f5a3a", "#9be37a", "#c8ff8f", "flask", "hood"),
    "bone_sentinel": ("#4b4b55", "#e9e3d1", "#f5f0dc", "shield", "helm"),
    "hollow_hunter": ("#5a2a3a", "#ff7a8a", "#ff9fb0", "dagger", "hood"),
    "ink_scribe": ("#33405a", "#c9d6ff", "#e2e9ff", "quill", "hat"),
    "tide_architect": ("#1f4f63", "#7fd3e6", "#b5f1ff", "staff", "crown"),
    "wisp": ("#2b3f45", "#8fb9b1", "#b8fff0", None, "wisp"),
}


def draw_item(c: Canvas, item, x, y, pal, t, pose):
    trim, glow = pal["trim"], pal["glow"]
    metal = hexrgb("#b8c4c8")
    wood = hexrgb("#6b4a2e")
    if item == "lantern":
        c.line(x, y - 3, x, y - 1, metal)
        c.rect(x - 2, y - 1, 5, 5, trim)
        c.rect(x - 1, y, 3, 3, glow if t % 2 == 0 else shade(glow, 0.8))
        if pose == "cast":
            c.ellipse(x, y + 1, 4, 4, (*glow[:3], 60))
    elif item == "book":
        c.rect(x - 3, y - 1, 7, 5, trim)
        c.rect(x - 2, y, 2, 3, hexrgb("#f2ecd8"))
        c.rect(x + 1, y, 2, 3, hexrgb("#f2ecd8"))
        if pose == "read" and t % 2 == 1:
            c.px(x + 1, y, hexrgb("#c8c0a8"))
    elif item == "hammer":
        c.line(x, y - 4, x, y + 3, wood)
        c.rect(x - 2, y - 6, 5, 3, metal)
        c.px(x + 2, y - 6, shade(metal, 0.7))
    elif item == "flask":
        c.rect(x - 1, y - 3, 3, 2, metal)
        c.ellipse(x, y + 1, 2.5, 2.5, glow)
        c.px(x - 1, y, (255, 255, 255, 200))
    elif item == "shield":
        c.rect(x - 3, y - 3, 6, 7, trim)
        c.rect(x - 2, y - 2, 4, 5, shade(trim, 0.75))
        c.px(x - 1, y, glow)
    elif item == "dagger":
        c.line(x, y - 5, x, y, metal)
        c.rect(x - 1, y, 3, 1, trim)
        c.px(x, y + 1, wood)
    elif item == "quill":
        c.line(x - 1, y + 2, x + 2, y - 4, hexrgb("#f2ecd8"))
        c.px(x + 2, y - 5, glow)
    elif item == "staff":
        c.line(x, y - 8, x, y + 5, wood)
        c.ellipse(x, y - 9, 1.6, 1.6, glow)


def draw_character(cls_id: str, anim: str, f: int, frames: int):
    cloak_hex, trim_hex, glow_hex, item, hood = CLASSES[cls_id]
    pal = {"cloak": hexrgb(cloak_hex), "trim": hexrgb(trim_hex), "glow": hexrgb(glow_hex)}
    cloak, trim, glow = pal["cloak"], pal["trim"], pal["glow"]
    dark = shade(cloak, 0.65)
    light = shade(cloak, 1.25)
    c = Canvas(FW, FH)
    ph = f / frames * math.tau

    bob = {"idle": round(math.sin(ph)), "wait": round(math.sin(ph) * 0.6), "move": round(math.sin(ph * 2) * 0.8),
           "cheer": -abs(round(math.sin(ph) * 3)), "hurt": 0}.get(anim, round(math.sin(ph) * 0.6))
    lean = {"move": 1, "attack": 1 if f in (1, 2) else 0, "hurt": -1}.get(anim, 0)
    cx = 12 + lean
    top = 5 + bob

    if hood == "wisp":
        # A floating will-o'-the-wisp: flame body, no cloak.
        r = 4 + (1 if f % 2 == 0 and anim in ("cheer", "cast") else 0)
        c.ellipse(cx, 13 + bob, r + 2, r + 2, (*glow[:3], 50))
        c.ellipse(cx, 13 + bob, r, r + 1, trim)
        c.ellipse(cx, 12 + bob, r - 1.5, r - 1, glow)
        for i in range(3):
            c.px(cx - 1 + i, 7 + bob - (i % 2) - (f % 2), glow)
        c.px(cx - 2, 13 + bob, VOID)
        c.px(cx + 1, 13 + bob, VOID)
        tail_y = 18 + bob
        c.line(cx, tail_y, cx - 2 + int(math.sin(ph) * 2), 22, (*trim[:3], 160))
    else:
        # Wispy tail (floating ghost body).
        tail_wave = math.sin(ph + 1.0) * (2 if anim == "move" else 1)
        for i in range(6):
            yy = 16 + i + bob
            w = 7 - i
            off = tail_wave * (i / 5) - lean * i * 0.6
            c.rect(cx - w / 2 + off, yy, w, 1, mix(dark, (0, 0, 0, 0), i / 7))
        # Cloak body.
        c.ellipse(cx, 13 + bob, 5, 5, cloak)
        c.rect(cx - 5, 12 + bob, 11, 5, cloak)
        c.rect(cx - 4, 15 + bob, 2, 2, dark)
        c.rect(cx + 3, 15 + bob, 2, 2, dark)
        c.line(cx, 11 + bob, cx, 16 + bob, trim)  # clasp line
        # Hood / head.
        c.ellipse(cx, top + 3, 4, 4, cloak)
        c.ellipse(cx - 1, top + 2, 2, 2, light)
        c.ellipse(cx, top + 4, 2.5, 2.2, VOID)  # face void
        eye = glow if not (anim == "hurt" and f % 2 == 1) else hexrgb("#ff5a5a")
        blink = anim in ("idle", "wait") and f == frames - 1
        if not blink:
            c.px(cx - 1, top + 4, eye)
            c.px(cx + 1, top + 4, eye)
        else:
            c.px(cx - 1, top + 4, shade(eye, 0.5))
            c.px(cx + 1, top + 4, shade(eye, 0.5))
        # Headgear.
        if hood == "crown":
            for i, dx in enumerate((-2, 0, 2)):
                c.px(cx + dx, top - 1 - (i == 1), trim)
            c.rect(cx - 2, top, 5, 1, trim)
        elif hood == "cap":
            c.rect(cx - 4, top + 1, 9, 2, shade(trim, 0.7))
        elif hood == "helm":
            c.rect(cx - 3, top, 7, 2, trim)
            c.px(cx, top - 1, trim)
        elif hood == "hat":
            c.rect(cx - 5, top + 1, 11, 1, dark)
            c.rect(cx - 2, top - 3, 5, 4, dark)
            c.px(cx + 2, top - 3, trim)
        else:  # hood tip
            c.px(cx, top - 1, cloak)
            c.px(cx + 1 - lean, top - 2, dark)

        # Arms + item by pose.
        arm_y = 13 + bob
        hand = shade(glow, 0.9)
        if anim == "work":
            up = f % 2 == 0
            hx, hy = cx + 5, (arm_y - 4 if up else arm_y + 1)
            c.line(cx + 3, arm_y, hx, hy, cloak)
            c.px(hx, hy, hand)
            draw_item(c, item, hx + 1, hy - 1, pal, f, anim)
            if not up:
                c.px(hx + 3, hy + 2, hexrgb("#ffd28a"))
                c.px(hx + 4, hy + 1, hexrgb("#fff2c0"))
        elif anim == "read":
            c.line(cx - 3, arm_y, cx - 1, arm_y + 1, cloak)
            c.line(cx + 3, arm_y, cx + 1, arm_y + 1, cloak)
            draw_item(c, "book" if item not in ("book",) else item, cx, arm_y + 2, pal, f, anim)
        elif anim == "cast":
            c.line(cx + 3, arm_y, cx + 6, arm_y - 4, cloak)
            c.px(cx + 6, arm_y - 4, hand)
            draw_item(c, item or "flask", cx + 7, arm_y - 6, pal, f, anim)
            for i in range(3):
                a = ph + i * 2.1
                c.px(cx + 7 + math.cos(a) * 4, arm_y - 7 + math.sin(a) * 3, (*glow[:3], 220))
        elif anim == "attack":
            swing = [(-6, -5), (2, -6), (7, 0), (3, 2)][f % 4]
            hx, hy = cx + 3 + swing[0] // 2, arm_y + swing[1] // 2
            c.line(cx + 3, arm_y, hx, hy, cloak)
            draw_item(c, item or "dagger", hx + 1, hy, pal, f, anim)
            if f == 2:
                for i in range(5):
                    c.px(cx + 8 + i // 2, arm_y - 4 + i * 2, (255, 255, 255, 200))
        elif anim == "cheer":
            c.line(cx - 3, arm_y, cx - 6, arm_y - 6, cloak)
            c.line(cx + 3, arm_y, cx + 6, arm_y - 6, cloak)
            c.px(cx - 6, arm_y - 6, hand)
            c.px(cx + 6, arm_y - 6, hand)
            for i in range(4):
                a = ph + i * 1.6
                c.px(cx + math.cos(a) * 9, 6 + math.sin(a) * 4 + bob, hexrgb("#fff2c0") if i % 2 else glow)
        elif anim == "hurt":
            c.line(cx - 3, arm_y, cx - 6, arm_y + 2, cloak)
            c.line(cx + 3, arm_y, cx + 6, arm_y + 2, cloak)
        elif anim == "wait":
            c.rect(cx - 1, arm_y + 1, 3, 2, cloak)
            if item:
                draw_item(c, item, cx + 5, arm_y + 1, pal, 0, anim)
            if f >= 1:
                for i in range(min(f, 3)):
                    c.px(cx + 4 + i * 2, top - 2, glow)
        else:  # idle / move
            sway = round(math.sin(ph)) if anim == "move" else 0
            c.line(cx - 3, arm_y, cx - 5, arm_y + 2 + sway, cloak)
            c.line(cx + 3, arm_y, cx + 5, arm_y + 2 - sway, cloak)
            if item:
                draw_item(c, item, cx + 6, arm_y + 2 - sway, pal, f, anim)
            if anim == "move":
                for i in range(3):
                    c.px(cx - 8 - i * 2, 18 + bob + (i + f) % 2, (*glow[:3], 90 - i * 25))

    c.outline(OUTLINE)
    if anim == "hurt" and f == 0:
        # white flash frame
        px = c.img.load()
        for y in range(FH):
            for x in range(FW):
                r, g, b, a = px[x, y]
                if a:
                    px[x, y] = (min(255, r + 120), min(255, g + 90), min(255, b + 90), a)
    return c.img, pal


def build_characters(manifest):
    out = ASSETS / "characters"
    out.mkdir(parents=True, exist_ok=True)
    cols = max(n for _, n, _, _ in ANIMS)
    for cls_id, spec in CLASSES.items():
        sheet = Image.new("RGBA", (FW * cols, FH * len(ANIMS)), (0, 0, 0, 0))
        animations = {}
        pal = None
        for row, (name, frames, fps, loop) in enumerate(ANIMS):
            for f in range(frames):
                img, pal = draw_character(cls_id, name, f, frames)
                sheet.paste(img, (f * FW, row * FH))
            animations[name] = {"row": row, "frames": frames, "fps": fps, "loop": loop}
        sheet.save(out / f"{cls_id}.png")
        manifest["characters"][cls_id] = {
            "image": f"characters/{cls_id}.png",
            "frameWidth": FW,
            "frameHeight": FH,
            "anchorY": 22,
            "animations": animations,
            "palette": {"cloak": spec[0], "trim": spec[1], "glow": spec[2]},
        }


# --------------------------------------------------------------- monsters

MONSTERS = {
    "bug_monster": "#6fbf5a",
    "error_goblin": "#b5523b",
    "dependency_dragon": "#7b5bc4",
    "test_phantom": "#9fd8e8",
    "conflict_skeleton": "#e6e0cc",
    "security_beast": "#d9a33a",
}
M_ANIMS = [("idle", 4, 5, True), ("attack", 4, 8, True), ("vanish", 4, 6, False)]


def draw_monster(kind: str, anim: str, f: int, frames: int):
    col = hexrgb(MONSTERS[kind])
    dark, light = shade(col, 0.6), shade(col, 1.3)
    eye = hexrgb("#ff4d4d") if kind != "test_phantom" else hexrgb("#203040")
    c = Canvas(FW, FH)
    ph = f / frames * math.tau
    bob = round(math.sin(ph))
    lunge = -2 if anim == "attack" and f in (1, 2) else 0
    cx = 12 + lunge
    if kind == "bug_monster":
        c.ellipse(cx, 15 + bob, 6, 4, col)
        c.ellipse(cx, 14 + bob, 4, 2, light)
        c.line(cx, 11 + bob, cx, 19 + bob, dark)
        for i in (-4, 0, 4):
            c.line(cx + i, 18 + bob, cx + i - 1, 21, dark)
        c.line(cx - 3, 11 + bob, cx - 5, 7 + bob, dark)
        c.line(cx + 3, 11 + bob, cx + 5, 7 + bob, dark)
        c.px(cx - 2, 13 + bob, eye)
        c.px(cx + 2, 13 + bob, eye)
    elif kind == "error_goblin":
        c.ellipse(cx, 16 + bob, 4, 4, col)
        c.ellipse(cx, 9 + bob, 4, 3.5, col)
        c.line(cx - 4, 8 + bob, cx - 7, 6 + bob, col)
        c.line(cx + 4, 8 + bob, cx + 7, 6 + bob, col)
        c.px(cx - 2, 9 + bob, eye)
        c.px(cx + 1, 9 + bob, eye)
        c.rect(cx - 1, 11 + bob, 3, 1, VOID)
        c.line(cx + 4, 15 + bob, cx + 7, 12 + bob - (2 if anim == "attack" else 0), hexrgb("#6b4a2e"))
        c.rect(cx - 3, 20, 2, 2, dark)
        c.rect(cx + 2, 20, 2, 2, dark)
    elif kind == "dependency_dragon":
        c.ellipse(cx + 1, 15 + bob, 6, 4, col)
        c.ellipse(cx - 5, 10 + bob, 3, 2.5, col)
        c.line(cx - 2, 13 + bob, cx - 4, 11 + bob, col)
        c.px(cx - 6, 9 + bob, eye)
        wing = -2 if f % 2 else 0
        c.line(cx, 12 + bob, cx + 4, 6 + bob + wing, dark)
        c.line(cx + 4, 6 + bob + wing, cx + 7, 11 + bob, dark)
        c.line(cx + 6, 16 + bob, cx + 10, 19, col)
        for i in range(3):  # chain links (dependencies)
            c.px(cx - 2 + i * 3, 19 + bob, hexrgb("#c0c0c8"))
        if anim == "attack" and f in (1, 2):
            for i in range(4):
                c.px(cx - 9 - i, 10 + bob + (i % 2), hexrgb("#ffb347"))
    elif kind == "test_phantom":
        c.ellipse(cx, 11 + bob, 5, 5, (*col[:3], 200))
        for i in range(5):
            c.rect(cx - 5 + i * 2, 15 + bob, 1, 3 + (i + f) % 2, (*col[:3], 170))
        c.ellipse(cx - 2, 10 + bob, 1, 1.5, eye)
        c.ellipse(cx + 2, 10 + bob, 1, 1.5, eye)
        c.px(cx - 1, 13 + bob, VOID)
        c.px(cx, 14 + bob, VOID)
        c.px(cx + 1, 13 + bob, VOID)
        c.px(cx + 6, 7 + bob, hexrgb("#ff5a5a"))  # red "x"
        c.px(cx + 8, 9 + bob, hexrgb("#ff5a5a"))
        c.px(cx + 7, 8 + bob, hexrgb("#ff5a5a"))
        c.px(cx + 6, 9 + bob, hexrgb("#ff5a5a"))
        c.px(cx + 8, 7 + bob, hexrgb("#ff5a5a"))
    elif kind == "conflict_skeleton":
        c.ellipse(cx, 7 + bob, 3, 3, col)
        c.px(cx - 1, 7 + bob, VOID)
        c.px(cx + 1, 7 + bob, VOID)
        c.line(cx, 10 + bob, cx, 17 + bob, col)
        for i in range(3):
            c.line(cx - 3, 11 + i * 2 + bob, cx + 3, 11 + i * 2 + bob, col)
        c.line(cx, 17 + bob, cx - 3, 22, col)
        c.line(cx, 17 + bob, cx + 3, 22, col)
        c.line(cx - 3, 11 + bob, cx - 6, 14 + bob, col)
        c.line(cx + 3, 11 + bob, cx + 6, 8 + bob - (2 if anim == "attack" else 0), col)
        c.rect(cx + 5, 4 + bob, 2, 5, hexrgb("#9aa4a8"))  # two crossed swords = conflict
        c.line(cx + 3, 5 + bob, cx + 8, 8 + bob, hexrgb("#9aa4a8"))
    elif kind == "security_beast":
        c.ellipse(cx, 15 + bob, 6, 5, col)
        c.ellipse(cx - 4, 10 + bob, 4, 3.5, col)
        c.rect(cx - 7, 6 + bob, 2, 2, dark)
        c.rect(cx - 2, 6 + bob, 2, 2, dark)
        c.px(cx - 5, 10 + bob, eye)
        c.px(cx - 3, 10 + bob, eye)
        c.rect(cx - 6, 12 + bob, 4, 1, VOID)
        c.rect(cx - 1, 19, 2, 3, dark)
        c.rect(cx + 3, 19, 2, 3, dark)
        c.rect(cx + 2, 12 + bob, 3, 3, hexrgb("#c0c0c8"))  # padlock
        c.px(cx + 3, 13 + bob, VOID)
    c.outline(OUTLINE)
    if anim == "vanish":
        px = c.img.load()
        rnd = random.Random(kind)
        keep = 1 - (f + 1) / frames
        for y in range(FH):
            for x in range(FW):
                r, g, b, a = px[x, y]
                if a and rnd.random() > keep:
                    px[x, y] = (255, 255, 255, int(a * keep * 0.6)) if rnd.random() < 0.3 else (0, 0, 0, 0)
    return c.img


def build_monsters(manifest):
    out = ASSETS / "monsters"
    out.mkdir(parents=True, exist_ok=True)
    for kind in MONSTERS:
        sheet = Image.new("RGBA", (FW * 4, FH * len(M_ANIMS)), (0, 0, 0, 0))
        anims = {}
        for row, (name, frames, fps, loop) in enumerate(M_ANIMS):
            for f in range(frames):
                sheet.paste(draw_monster(kind, name, f, frames), (f * FW, row * FH))
            anims[name] = {"row": row, "frames": frames, "fps": fps, "loop": loop}
        sheet.save(out / f"{kind}.png")
        manifest["monsters"][kind] = {"image": f"monsters/{kind}.png", "frameWidth": FW, "frameHeight": FH, "anchorY": 22, "animations": anims}


# ---------------------------------------------------------------- effects


def build_effects(manifest):
    out = ASSETS / "effects"
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (16 * 6, 16 * 2), (0, 0, 0, 0))
    # row 0: sparkle burst (success / reward), row 1: mist puff (spawn / despawn)
    for f in range(6):
        c = Canvas(16, 16)
        r = 1 + f * 1.2
        for i in range(8):
            a = i / 8 * math.tau
            col = hexrgb("#fff2c0") if i % 2 else hexrgb("#7cf2c2")
            c.px(8 + math.cos(a) * r, 8 + math.sin(a) * r, (*col[:3], max(40, 255 - f * 40)))
        sheet.paste(c.img, (f * 16, 0))
        m = Canvas(16, 16)
        m.ellipse(8, 9, 2 + f, 1 + f * 0.6, (180, 230, 220, max(20, 170 - f * 28)))
        sheet.paste(m.img, (f * 16, 16))
    sheet.save(out / "effects.png")
    manifest["effects"]["sparkle"] = {"image": "effects/effects.png", "frameWidth": 16, "frameHeight": 16, "anchorY": 8, "animations": {"play": {"row": 0, "frames": 6, "fps": 12, "loop": False}}}
    manifest["effects"]["mist"] = {"image": "effects/effects.png", "frameWidth": 16, "frameHeight": 16, "anchorY": 12, "animations": {"play": {"row": 1, "frames": 6, "fps": 10, "loop": False}}}


# ----------------------------------------------------------- environments

TILE = 16
TILES = [
    "wall", "wall_dark", "floor_stone", "floor_wood", "window", "banner", "torch0", "torch1",
    "bookshelf", "desk", "anvil", "forge0", "forge1", "cauldron0", "cauldron1", "throne",
    "telescope", "chest", "gold", "bunk", "candle", "rug", "barrel", "map_table",
    "crystal", "rack", "door", "pillar",
]


def tile(name: str) -> Image.Image:
    c = Canvas(TILE, TILE)
    stone, stone_d, stone_l = hexrgb("#2a3a3d"), hexrgb("#1c2729"), hexrgb("#38504f")
    wood, wood_d = hexrgb("#4a3424"), hexrgb("#33241a")
    gold = hexrgb("#d7b45a")
    glow = hexrgb("#7cf2c2")
    rnd = random.Random(name)

    def bricks(base, dark, light):
        c.rect(0, 0, 16, 16, base)
        for row in range(4):
            y = row * 4
            c.rect(0, y + 3, 16, 1, dark)
            off = 0 if row % 2 == 0 else 4
            for x in range(off, 16, 8):
                c.rect(x, y, 1, 3, dark)
            c.rect(off + 1, y, 3, 1, light)

    if name in ("wall", "wall_dark", "window", "banner", "torch0", "torch1", "door", "pillar"):
        bricks(stone if name != "wall_dark" else stone_d, stone_d if name != "wall_dark" else hexrgb("#141c1d"), stone_l if name != "wall_dark" else stone)
    if name == "floor_stone":
        c.rect(0, 0, 16, 16, hexrgb("#222e30"))
        for i in range(0, 16, 8):
            c.rect(i, 0, 1, 16, hexrgb("#1a2425"))
            c.rect(0, i, 16, 1, hexrgb("#1a2425"))
        for _ in range(6):
            c.px(rnd.randrange(16), rnd.randrange(16), hexrgb("#2c3a3c"))
    elif name == "floor_wood":
        c.rect(0, 0, 16, 16, wood)
        for y in range(0, 16, 4):
            c.rect(0, y, 16, 1, wood_d)
        c.px(5, 2, wood_d)
        c.px(12, 9, wood_d)
    elif name == "window":
        c.rect(4, 2, 8, 11, hexrgb("#0b1a26"))
        c.ellipse(9, 5, 1.6, 1.6, hexrgb("#e8f4f0"))
        c.rect(7, 2, 1, 11, stone_d)
        c.rect(4, 7, 8, 1, stone_d)
        c.rect(3, 13, 10, 1, stone_l)
    elif name == "banner":
        c.rect(5, 1, 6, 11, hexrgb("#1f4f4a"))
        c.rect(5, 12, 2, 2, hexrgb("#1f4f4a"))
        c.rect(9, 12, 2, 2, hexrgb("#1f4f4a"))
        c.rect(7, 4, 2, 4, gold)
        c.rect(4, 1, 8, 1, gold)
    elif name in ("torch0", "torch1"):
        c.rect(7, 7, 2, 5, wood)
        f = 0 if name == "torch0" else 1
        c.ellipse(8, 5 - f * 0.5, 2, 3, glow)
        c.ellipse(8, 6, 1, 1.5, hexrgb("#e9fff6"))
        c.ellipse(8, 6, 6, 6, (*glow[:3], 35))
    elif name == "door":
        c.rect(3, 3, 10, 13, wood_d)
        c.rect(4, 4, 8, 12, wood)
        c.rect(7, 4, 1, 12, wood_d)
        c.px(10, 10, gold)
    elif name == "pillar":
        c.rect(5, 0, 6, 16, stone_l)
        c.rect(6, 0, 1, 16, hexrgb("#4a6463"))
        c.rect(10, 0, 1, 16, stone_d)
    elif name == "bookshelf":
        c.rect(1, 0, 14, 16, wood_d)
        for shelf in range(3):
            y = 1 + shelf * 5
            x = 2
            while x < 14:
                w = rnd.choice((1, 2))
                col = rnd.choice(["#7a3b3b", "#3b5a7a", "#5a7a3b", "#7a6a3b", "#5a3b7a", "#3b7a6e"])
                c.rect(x, y + rnd.choice((0, 1)), w, 4 - (y % 2 == 0), hexrgb(col))
                x += w + (1 if rnd.random() < 0.2 else 0)
            c.rect(1, y + 4, 14, 1, wood)
    elif name == "desk":
        c.rect(1, 8, 14, 2, wood)
        c.rect(2, 10, 1, 6, wood_d)
        c.rect(13, 10, 1, 6, wood_d)
        c.rect(4, 6, 5, 2, hexrgb("#f2ecd8"))
        c.rect(10, 5, 2, 3, hexrgb("#2b2b38"))
        c.px(11, 4, glow)
    elif name == "anvil":
        c.rect(3, 7, 10, 3, hexrgb("#5d676b"))
        c.rect(1, 7, 3, 2, hexrgb("#5d676b"))
        c.rect(6, 10, 4, 3, hexrgb("#4a5356"))
        c.rect(4, 13, 8, 3, hexrgb("#3c4446"))
        c.rect(4, 7, 8, 1, hexrgb("#8d999d"))
    elif name in ("forge0", "forge1"):
        c.rect(1, 4, 14, 12, stone_d)
        c.rect(3, 6, 10, 7, hexrgb("#120c0a"))
        f = 0 if name == "forge0" else 1
        for i in range(5):
            c.ellipse(4 + i * 2, 11 - ((i + f) % 2), 1.3, 2, hexrgb("#ff8a3a"))
        c.rect(4, 12, 8, 1, hexrgb("#ffd28a"))
    elif name in ("cauldron0", "cauldron1"):
        c.ellipse(8, 11, 6, 4, hexrgb("#1e2426"))
        c.rect(3, 7, 10, 2, hexrgb("#2e3638"))
        f = 0 if name == "cauldron0" else 1
        c.rect(4, 7, 8, 1, hexrgb("#9be37a"))
        c.ellipse(6 + f * 3, 4 - f, 1.2, 1.2, (*hexrgb("#c8ff8f")[:3], 200))
        c.ellipse(9 - f * 2, 2 + f, 0.8, 0.8, (*hexrgb("#c8ff8f")[:3], 150))
        c.rect(2, 15, 12, 1, hexrgb("#ff8a3a"))
    elif name == "throne":
        c.rect(3, 0, 10, 12, hexrgb("#1f4f4a"))
        c.rect(4, 1, 8, 10, hexrgb("#2b6a62"))
        c.rect(2, 8, 12, 3, gold)
        c.rect(3, 11, 2, 5, gold)
        c.rect(11, 11, 2, 5, gold)
        c.px(5, 0, gold)
        c.px(8, 0, gold)
        c.px(11, 0, gold)
        c.px(8, 4, glow)
    elif name == "telescope":
        c.line(4, 13, 8, 9, wood_d)
        c.line(12, 13, 8, 9, wood_d)
        c.line(4, 9, 13, 3, hexrgb("#b8a16a"))
        c.line(4, 10, 13, 4, hexrgb("#8a7848"))
        c.px(13, 3, glow)
    elif name == "chest":
        c.rect(2, 7, 12, 8, wood)
        c.rect(2, 7, 12, 2, wood_d)
        c.rect(2, 10, 12, 1, gold)
        c.rect(7, 9, 2, 3, gold)
    elif name == "gold":
        for i in range(9):
            c.ellipse(4 + (i % 4) * 2.5, 13 - (i // 4) * 2, 1.6, 1, gold if i % 3 else hexrgb("#f5d98a"))
    elif name == "bunk":
        c.rect(1, 6, 14, 2, wood)
        c.rect(1, 13, 14, 2, wood)
        c.rect(2, 4, 12, 2, hexrgb("#3b5a7a"))
        c.rect(2, 11, 12, 2, hexrgb("#3b5a7a"))
        c.rect(1, 3, 1, 13, wood_d)
        c.rect(14, 3, 1, 13, wood_d)
    elif name == "candle":
        c.rect(7, 9, 2, 5, hexrgb("#e9e3d1"))
        c.px(8, 8, glow)
        c.px(8, 7, hexrgb("#e9fff6"))
        c.rect(5, 14, 6, 1, gold)
    elif name == "rug":
        c.rect(0, 4, 16, 8, hexrgb("#3d1f2a"))
        c.rect(0, 5, 16, 1, gold)
        c.rect(0, 10, 16, 1, gold)
    elif name == "barrel":
        c.ellipse(8, 10, 5, 6, wood)
        c.rect(3, 7, 10, 1, hexrgb("#5d676b"))
        c.rect(3, 12, 10, 1, hexrgb("#5d676b"))
    elif name == "map_table":
        c.rect(1, 7, 14, 3, wood)
        c.rect(2, 5, 12, 3, hexrgb("#d9c99a"))
        c.line(4, 6, 11, 6, hexrgb("#7a6a3b"))
        c.px(9, 6, hexrgb("#b5523b"))
        c.rect(3, 10, 1, 6, wood_d)
        c.rect(12, 10, 1, 6, wood_d)
    elif name == "crystal":
        c.line(8, 2, 5, 9, glow)
        c.line(8, 2, 11, 9, glow)
        c.ellipse(8, 9, 3, 4, (*glow[:3], 160))
        c.rect(5, 13, 6, 3, stone_l)
    elif name == "rack":
        c.rect(2, 3, 12, 1, wood)
        c.rect(2, 3, 1, 13, wood_d)
        c.rect(13, 3, 1, 13, wood_d)
        for i, x in enumerate((5, 8, 11)):
            c.line(x, 4, x, 13, hexrgb("#b8c4c8"))
            c.px(x, 4 + i, hexrgb("#d7b45a"))
    return c.img


def build_environment(manifest):
    out = ASSETS / "environments"
    out.mkdir(parents=True, exist_ok=True)
    cols = 8
    rows = math.ceil(len(TILES) / cols)
    sheet = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    index = {}
    for i, name in enumerate(TILES):
        sheet.paste(tile(name), ((i % cols) * TILE, (i // cols) * TILE))
        index[name] = i
    sheet.save(out / "castle-tiles.png")
    manifest["environments"]["castle-tiles"] = {"image": "environments/castle-tiles.png", "width": sheet.width, "height": sheet.height, "tileSize": TILE, "columns": cols, "tiles": index}

    # Island backdrop: night sky, moon, mist sea, the island and its ruined castle.
    W, H = 480, 270
    c = Canvas(W, H)
    top, bottom = hexrgb("#050b0e"), hexrgb("#12302f")
    for y in range(H):
        c.rect(0, y, W, 1, mix(top, bottom, (y / H) ** 1.4))
    rnd = random.Random(7)
    for _ in range(120):
        x, y = rnd.randrange(W), rnd.randrange(int(H * 0.55))
        c.px(x, y, (200, 240, 230, rnd.randrange(60, 200)))
    c.ellipse(380, 60, 26, 26, (124, 242, 194, 25))
    c.ellipse(380, 60, 18, 18, hexrgb("#d9f5ea"))
    c.ellipse(373, 55, 4, 3, hexrgb("#b9d9cd"))
    c.ellipse(386, 66, 3, 2, hexrgb("#b9d9cd"))
    sea_y = 190
    for y in range(sea_y, H):
        c.rect(0, y, W, 1, mix(hexrgb("#0b2224"), hexrgb("#061214"), (y - sea_y) / (H - sea_y)))
    for i in range(40):
        y = sea_y + 4 + rnd.randrange(H - sea_y - 6)
        x = rnd.randrange(W)
        c.rect(x, y, rnd.randrange(6, 20), 1, (124, 242, 194, 40))
    # island silhouette
    for x in range(60, 420):
        hgt = 30 + 18 * math.sin((x - 60) / 360 * math.pi) + 4 * math.sin(x / 9)
        c.rect(x, sea_y - hgt, 1, hgt + 6, hexrgb("#0a1617"))
    # castle silhouette with broken towers
    castle = hexrgb("#0d1d1f")
    c.rect(170, 100, 140, 70, castle)
    for tx, tw, th in ((160, 22, 100), (230, 26, 125), (300, 20, 90)):
        c.rect(tx, 170 - th, tw, th, castle)
        for k in range(0, tw, 6):
            c.rect(tx + k, 170 - th - 4, 4, 4, castle)
    c.rect(318, 70, 4, 18, castle)  # broken spire
    for wx, wy in ((240, 70), (172, 95), (305, 110), (200, 130), (270, 130)):
        c.rect(wx, wy, 3, 5, hexrgb("#7cf2c2"))
        c.ellipse(wx + 1, wy + 2, 5, 5, (124, 242, 194, 30))
    # mist bands
    for band in range(5):
        y = sea_y - 20 + band * 12
        for x in range(0, W, 2):
            a = int(28 + 22 * math.sin(x / 37 + band))
            c.px(x, y + int(3 * math.sin(x / 23 + band)), (170, 220, 210, a))
    c.img.save(out / "island-backdrop.png")
    manifest["environments"]["island-backdrop"] = {"image": "environments/island-backdrop.png", "width": W, "height": H}


# ------------------------------------------------------------ top-down castle

TD_TILES = [
    "floor_stone", "floor_wood", "carpet", "wall", "wall_face", "door", "bed", "sleeper",
    "desk", "bookshelf", "anvil", "forge0", "forge1", "cauldron0", "cauldron1", "throne",
    "telescope", "chest", "gold", "map_table", "barrel", "crystal", "candles", "torch0",
    "torch1", "rack", "stool", "window", "zz", "rug",
    "floor_check", "runner", "table_l", "table_m", "table_r", "table_book", "table_candle", "table_map",
    "table_flask", "chair_n", "chair_s", "bench", "plant", "pillar", "statue", "banner", "window_lit",
]


def td_tile(name: str) -> Image.Image:
    """16x16 tiles for the castle seen from above (3/4 view, like classic RPG maps)."""
    c = Canvas(TILE, TILE)
    rnd = random.Random("td-" + name)
    stone, stone_d, stone_l = hexrgb("#2a3a3d"), hexrgb("#1a2426"), hexrgb("#3d5654")
    wood, wood_d, wood_l = hexrgb("#4a3424"), hexrgb("#33241a"), hexrgb("#6a4c34")
    gold = hexrgb("#d7b45a")
    glow = hexrgb("#7cf2c2")
    teal = hexrgb("#1f4f4a")
    if name == "floor_stone":
        c.rect(0, 0, 16, 16, hexrgb("#253235"))
        c.rect(0, 7, 16, 1, hexrgb("#1c2729"))
        c.rect(0, 15, 16, 1, hexrgb("#1c2729"))
        c.rect(7, 0, 1, 7, hexrgb("#1c2729"))
        c.rect(15, 8, 1, 7, hexrgb("#1c2729"))
        for _ in range(5):
            c.px(rnd.randrange(16), rnd.randrange(16), hexrgb("#2f3e40"))
    elif name == "floor_wood":
        c.rect(0, 0, 16, 16, wood)
        for x in range(0, 16, 4):
            c.rect(x, 0, 1, 16, wood_d)
        c.rect(1, 6, 3, 1, wood_d)
        c.rect(9, 12, 3, 1, wood_d)
    elif name == "carpet":
        c.rect(0, 0, 16, 16, hexrgb("#4a1f2a"))
        c.rect(0, 0, 16, 1, hexrgb("#5e2a36"))
        c.px(7, 7, gold)
        c.px(8, 8, gold)
        c.px(7, 8, hexrgb("#6b2f3c"))
        c.px(8, 7, hexrgb("#6b2f3c"))
    elif name == "rug":
        c.rect(0, 0, 16, 16, teal)
        c.rect(1, 1, 14, 14, hexrgb("#24605a"))
        c.rect(3, 3, 10, 10, teal)
        c.rect(7, 5, 2, 6, gold)
    elif name == "wall":
        c.rect(0, 0, 16, 16, hexrgb("#141c1e"))
        c.rect(0, 0, 16, 1, hexrgb("#1e292b"))
        for _ in range(4):
            c.px(rnd.randrange(16), rnd.randrange(16), hexrgb("#1a2325"))
    elif name == "wall_face":
        c.rect(0, 0, 16, 4, hexrgb("#141c1e"))
        c.rect(0, 4, 16, 12, stone)
        for row in range(3):
            y = 4 + row * 4
            c.rect(0, y + 3, 16, 1, stone_d)
            off = 0 if row % 2 == 0 else 4
            for x in range(off, 16, 8):
                c.rect(x, y, 1, 3, stone_d)
            c.rect(off + 1, y, 3, 1, stone_l)
        c.rect(0, 15, 16, 1, hexrgb("#10181a"))
    elif name == "window":
        td = td_tile("wall_face")
        c.img.paste(td, (0, 0))
        c.rect(5, 5, 6, 8, hexrgb("#0b1a26"))
        c.ellipse(9, 7, 1.2, 1.2, hexrgb("#e8f4f0"))
        c.rect(7, 5, 1, 8, stone_d)
    elif name in ("torch0", "torch1"):
        c.img.paste(td_tile("wall_face"), (0, 0))
        c.rect(7, 9, 2, 5, wood)
        f = 0 if name == "torch0" else 1
        c.ellipse(8, 7 - f * 0.5, 2, 2.5, glow)
        c.ellipse(8, 8, 1, 1, hexrgb("#e9fff6"))
        c.ellipse(8, 8, 7, 7, (*glow[:3], 40))
    elif name == "door":
        c.rect(0, 0, 16, 16, hexrgb("#253235"))
        c.rect(0, 0, 1, 16, hexrgb("#141c1e"))
        c.rect(15, 0, 1, 16, hexrgb("#141c1e"))
        c.rect(1, 6, 14, 4, wood_d)
        c.rect(1, 7, 14, 2, wood)
    elif name == "bed":
        c.rect(1, 0, 14, 16, wood_d)
        c.rect(2, 1, 12, 14, wood)
        c.rect(3, 2, 10, 4, hexrgb("#e6e2d4"))  # pillow
        c.rect(3, 6, 10, 9, hexrgb("#2e5a54"))  # blanket
        c.rect(3, 6, 10, 1, hexrgb("#d0ccbe"))  # sheet fold
        c.rect(3, 14, 10, 1, hexrgb("#24504a"))
    elif name == "sleeper":
        # Greyscale so it can be tinted with the character's cloak colour at runtime.
        c.rect(3, 6, 10, 9, hexrgb("#d8d8d8"))
        c.rect(3, 6, 10, 1, hexrgb("#f4f4f4"))
        c.rect(4, 8, 8, 6, hexrgb("#c4c4c4"))
        c.rect(3, 14, 10, 1, hexrgb("#a8a8a8"))
        c.ellipse(8, 4, 2.8, 2.4, hexrgb("#20262a"))  # hood
        c.rect(7, 4, 1, 1, hexrgb("#7cf2c2"))  # closed glowing eyes
        c.rect(9, 4, 1, 1, hexrgb("#7cf2c2"))
    elif name == "zz":
        for i, (x, y) in enumerate(((3, 11), (7, 7), (11, 2))):
            sz = 2 + i
            a = (220, 245, 238, 220)
            c.rect(x, y, sz, 1, a)
            c.line(x + sz - 1, y + 1, x, y + sz - 1, a)
            c.rect(x, y + sz - 1, sz, 1, a)
    elif name == "desk":
        c.rect(1, 3, 14, 10, wood_d)
        c.rect(1, 3, 14, 8, wood_l)
        c.rect(3, 4, 5, 4, hexrgb("#f2ecd8"))
        c.rect(4, 5, 3, 1, hexrgb("#8a8478"))
        c.rect(10, 4, 2, 3, hexrgb("#2b2b38"))
        c.px(12, 4, glow)
        c.rect(2, 13, 1, 2, wood_d)
        c.rect(13, 13, 1, 2, wood_d)
    elif name == "bookshelf":
        c.rect(0, 0, 16, 16, wood_d)
        for shelf in range(3):
            y = 1 + shelf * 5
            x = 1
            while x < 15:
                w = rnd.choice((1, 2))
                col = rnd.choice(["#7a3b3b", "#3b5a7a", "#5a7a3b", "#7a6a3b", "#5a3b7a", "#3b7a6e"])
                c.rect(x, y, w, 4, hexrgb(col))
                x += w
            c.rect(0, y + 4, 16, 1, wood)
    elif name == "anvil":
        c.ellipse(8, 13, 6, 2, (0, 0, 0, 90))
        c.rect(4, 10, 8, 3, hexrgb("#2b3135"))
        c.rect(2, 6, 12, 4, hexrgb("#4a5459"))
        c.rect(2, 6, 12, 1, hexrgb("#6b777c"))
        c.rect(12, 7, 3, 2, hexrgb("#4a5459"))
    elif name in ("forge0", "forge1"):
        f = 0 if name == "forge0" else 1
        c.rect(1, 1, 14, 14, stone_d)
        c.rect(2, 2, 12, 12, stone)
        c.rect(4, 4, 8, 8, hexrgb("#1a0d08"))
        c.ellipse(8, 8 + f * 0.5, 3.5, 3, hexrgb("#e8742a"))
        c.ellipse(8, 9, 2, 1.6 + f * 0.6, hexrgb("#ffd28a"))
        c.ellipse(8, 8, 9, 9, (255, 140, 60, 30))
    elif name in ("cauldron0", "cauldron1"):
        f = 0 if name == "cauldron0" else 1
        c.ellipse(8, 10, 6, 5, hexrgb("#1c2224"))
        c.ellipse(8, 9, 5, 3.5, hexrgb("#2f3a3c"))
        c.ellipse(8, 9, 4, 2.6, hexrgb("#6fdc8c"))
        c.px(6 + f * 2, 8, hexrgb("#d6ffe0"))
        c.px(10 - f * 3, 9, hexrgb("#d6ffe0"))
        c.ellipse(8, 9, 8, 7, (124, 242, 140, 30))
    elif name == "throne":
        c.rect(3, 1, 10, 6, hexrgb("#3b2a52"))
        c.rect(3, 1, 10, 1, gold)
        c.rect(2, 6, 12, 8, hexrgb("#4a3466"))
        c.rect(4, 7, 8, 5, hexrgb("#6a4c8a"))
        c.rect(2, 6, 2, 8, gold)
        c.rect(12, 6, 2, 8, gold)
        c.px(8, 3, glow)
    elif name == "telescope":
        c.line(3, 12, 8, 8, wood_d)
        c.line(13, 12, 8, 8, wood_d)
        c.line(8, 14, 8, 8, wood_d)
        c.rect(5, 4, 9, 3, hexrgb("#8a6b3a"))
        c.rect(12, 3, 2, 5, gold)
    elif name == "chest":
        c.rect(2, 5, 12, 9, wood_d)
        c.rect(3, 5, 10, 4, wood_l)
        c.rect(2, 9, 12, 1, gold)
        c.rect(7, 8, 2, 3, gold)
    elif name == "gold":
        for _ in range(14):
            x, y = 3 + rnd.randrange(10), 6 + rnd.randrange(7)
            c.ellipse(x, y, 1.4, 1, gold)
            c.px(x, y - 1, hexrgb("#fff0b8"))
    elif name == "map_table":
        c.ellipse(8, 9, 7, 5, wood_d)
        c.ellipse(8, 8, 6.5, 4.5, wood_l)
        c.rect(4, 6, 8, 5, hexrgb("#e6d9b0"))
        c.line(5, 8, 10, 7, hexrgb("#8a4b3b"))
        c.px(10, 7, hexrgb("#c23b3b"))
    elif name == "barrel":
        c.ellipse(8, 9, 5, 6, wood_d)
        c.ellipse(8, 7, 4.5, 3.5, wood)
        c.rect(3, 10, 10, 1, hexrgb("#2b3135"))
    elif name == "crystal":
        c.ellipse(8, 12, 5, 2, (0, 0, 0, 80))
        for (x0, h) in ((6, 8), (9, 10), (11, 6)):
            c.rect(x0, 12 - h, 2, h, glow)
            c.px(x0, 12 - h, hexrgb("#e9fff6"))
        c.ellipse(8, 8, 8, 8, (124, 242, 194, 35))
    elif name == "candles":
        for x, h in ((5, 5), (8, 7), (11, 4)):
            c.rect(x, 12 - h, 2, h, hexrgb("#e8e2cf"))
            c.px(x, 11 - h, hexrgb("#ffd28a"))
        c.ellipse(8, 7, 7, 6, (255, 210, 140, 30))
    elif name == "rack":
        c.rect(1, 2, 14, 2, wood)
        c.rect(1, 12, 14, 2, wood)
        for x in (3, 7, 11):
            c.line(x, 1, x + 1, 14, hexrgb("#b8c4c8"))
            c.px(x, 1, gold)
    elif name == "floor_check":
        # Pale and dark flagstones in a checker pattern.
        light, dark = hexrgb("#3c4947"), hexrgb("#323d3c")
        for (x0, y0, col) in ((0, 0, light), (8, 0, dark), (0, 8, dark), (8, 8, light)):
            c.rect(x0, y0, 8, 8, col)
            c.rect(x0, y0, 8, 1, hexrgb("#45524f") if col == light else hexrgb("#3a4644"))
            c.rect(x0 + 7, y0, 1, 8, hexrgb("#2b3534"))
            c.rect(x0, y0 + 7, 8, 1, hexrgb("#2b3534"))
        for _ in range(3):
            c.px(rnd.randrange(16), rnd.randrange(16), hexrgb("#4a5856"))
    elif name == "runner":
        c.rect(0, 0, 16, 16, hexrgb("#8a2f2a"))
        c.rect(0, 0, 16, 1, hexrgb("#a33a33"))
        for x in range(1, 16, 4):
            c.px(x, 7, hexrgb("#c9a45a"))
            c.px(x + 2, 15, hexrgb("#6e2420"))
        c.px(7, 3, hexrgb("#a33a33"))
        c.px(11, 11, hexrgb("#a33a33"))
    elif name in ("table_l", "table_m", "table_r", "table_book", "table_candle", "table_map", "table_flask"):
        top, edge = hexrgb("#8a5a36"), hexrgb("#5a3a22")
        x0 = 2 if name == "table_l" else 0
        x1 = 14 if name == "table_r" else 16
        c.ellipse(8, 14, 8, 2, (0, 0, 0, 70))
        c.rect(x0, 3, x1 - x0, 9, top)
        c.rect(x0, 3, x1 - x0, 1, hexrgb("#a8744a"))
        c.rect(x0, 11, x1 - x0, 2, edge)
        c.rect(x0, 5, x1 - x0, 5, hexrgb("#e9e4d4"))  # cloth runner
        c.rect(x0, 9, x1 - x0, 1, hexrgb("#c9c2ad"))
        if name == "table_l":
            c.rect(2, 13, 1, 2, edge)
        if name == "table_r":
            c.rect(13, 13, 1, 2, edge)
        if name == "table_book":
            c.rect(4, 4, 8, 5, hexrgb("#7a3b3b"))
            c.rect(5, 5, 3, 3, hexrgb("#f2ecd8"))
            c.rect(8, 5, 3, 3, hexrgb("#e6dfc8"))
        elif name == "table_candle":
            c.rect(7, 2, 2, 5, hexrgb("#e8e2cf"))
            c.px(7, 1, hexrgb("#ffd28a"))
            c.px(8, 1, hexrgb("#fff0b8"))
            c.ellipse(8, 3, 6, 5, (255, 210, 140, 35))
            c.ellipse(4, 7, 1.6, 1.2, gold)
            c.ellipse(12, 7, 1.6, 1.2, gold)
        elif name == "table_map":
            c.rect(2, 4, 12, 6, hexrgb("#e6d9b0"))
            c.line(3, 8, 12, 5, hexrgb("#8a4b3b"))
            c.px(12, 5, hexrgb("#c23b3b"))
            c.ellipse(6, 7, 1, 1, gold)
        elif name == "table_flask":
            for x, col in ((4, "#6fdc8c"), (8, "#7cc8f2"), (12, "#d07ce8")):
                c.rect(x - 1, 4, 2, 2, hexrgb("#c8d8d8"))
                c.ellipse(x, 7, 1.8, 1.6, hexrgb(col))
                c.px(x - 1, 6, hexrgb("#ffffff"))
    elif name in ("chair_n", "chair_s"):
        red, red_d = hexrgb("#9a2f2f"), hexrgb("#6a1f22")
        c.ellipse(8, 13, 5, 1.5, (0, 0, 0, 60))
        if name == "chair_n":  # seen from behind, above a table
            c.rect(4, 4, 8, 5, wood_d)
            c.rect(5, 5, 6, 3, red)
            c.rect(4, 9, 8, 4, red_d)
            c.rect(4, 13, 1, 1, wood_d)
            c.rect(11, 13, 1, 1, wood_d)
        else:
            c.rect(4, 3, 8, 5, red_d)
            c.rect(4, 8, 8, 3, red)
            c.rect(4, 8, 8, 1, hexrgb("#b84040"))
            c.rect(4, 11, 1, 3, wood_d)
            c.rect(11, 11, 1, 3, wood_d)
    elif name == "bench":
        c.ellipse(8, 13, 7, 2, (0, 0, 0, 70))
        c.rect(1, 3, 14, 5, hexrgb("#6a1f22"))
        c.rect(1, 7, 14, 4, hexrgb("#9a2f2f"))
        c.rect(1, 7, 14, 1, hexrgb("#b84040"))
        c.rect(0, 4, 2, 8, hexrgb("#5a1a1d"))
        c.rect(14, 4, 2, 8, hexrgb("#5a1a1d"))
        c.rect(1, 11, 14, 2, wood_d)
    elif name == "plant":
        c.ellipse(8, 14, 4, 1.5, (0, 0, 0, 80))
        c.rect(5, 9, 6, 5, hexrgb("#7a4a2a"))
        c.rect(5, 9, 6, 1, hexrgb("#9a6238"))
        for (x, y, r) in ((8, 5, 3.5), (5, 6, 2.5), (11, 6, 2.5), (8, 3, 2)):
            c.ellipse(x, y, r, r * 0.9, hexrgb("#2f6b3a"))
        for _ in range(6):
            c.px(4 + rnd.randrange(9), 2 + rnd.randrange(6), hexrgb("#4f9a52"))
        c.px(7, 4, hexrgb("#d77ad8"))
        c.px(10, 5, hexrgb("#7cf2c2"))
    elif name == "pillar":
        c.ellipse(8, 14, 6, 2, (0, 0, 0, 90))
        c.rect(3, 11, 10, 4, hexrgb("#5a6866"))
        c.rect(4, 0, 8, 12, hexrgb("#6e7d7a"))
        c.rect(4, 0, 2, 12, hexrgb("#8a9a96"))
        c.rect(10, 0, 2, 12, hexrgb("#4f5c5a"))
        c.rect(3, 11, 10, 1, hexrgb("#8a9a96"))
    elif name == "statue":
        c.ellipse(8, 14, 6, 2, (0, 0, 0, 90))
        c.rect(3, 11, 10, 4, hexrgb("#4f5c5a"))
        c.rect(3, 11, 10, 1, hexrgb("#6e7d7a"))
        c.ellipse(8, 7, 3.5, 4.5, hexrgb("#7b8b88"))  # hooded figure
        c.ellipse(8, 3, 2.6, 2.4, hexrgb("#8fa09c"))
        c.rect(7, 3, 1, 1, glow)
        c.rect(9, 3, 1, 1, glow)
    elif name == "banner":
        c.img.paste(td_tile("wall_face"), (0, 0))
        c.rect(4, 4, 8, 1, gold)
        c.rect(5, 5, 6, 9, hexrgb("#8a2f2a"))
        c.rect(5, 5, 1, 9, hexrgb("#a33a33"))
        c.px(5, 14, hexrgb("#8a2f2a"))
        c.px(10, 14, hexrgb("#8a2f2a"))
        c.rect(7, 8, 2, 3, glow)
    elif name == "window_lit":
        c.img.paste(td_tile("wall_face"), (0, 0))
        c.rect(5, 6, 6, 8, hexrgb("#e8a24a"))
        c.rect(6, 5, 4, 1, hexrgb("#e8a24a"))
        c.rect(7, 6, 2, 8, hexrgb("#ffd28a"))
        c.rect(5, 9, 6, 1, stone_d)
        c.rect(7, 6, 1, 8, stone_d)
        c.ellipse(8, 10, 7, 6, (255, 190, 110, 30))
    elif name == "stool":
        c.ellipse(8, 9, 3.5, 3, wood_d)
        c.ellipse(8, 8, 3, 2.5, wood_l)
    return c.img


def build_topdown(manifest):
    out = ASSETS / "environments"
    cols = 8
    rows = math.ceil(len(TD_TILES) / cols)
    sheet = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    index = {}
    for i, name in enumerate(TD_TILES):
        sheet.paste(td_tile(name), ((i % cols) * TILE, (i // cols) * TILE))
        index[name] = i
    sheet.save(out / "castle-topdown.png")
    manifest["environments"]["castle-topdown"] = {"image": "environments/castle-topdown.png", "width": sheet.width, "height": sheet.height, "tileSize": TILE, "columns": cols, "tiles": index}


def main():
    random.seed(1)
    manifest = {"version": 1, "characters": {}, "monsters": {}, "effects": {}, "environments": {}, "ui": {"appIcon": "ui/app-icon-32.png"}}
    build_characters(manifest)
    build_monsters(manifest)
    build_effects(manifest)
    build_environment(manifest)
    build_topdown(manifest)
    import iso_castle  # noqa: E402 (same folder)

    iso_castle.build(ASSETS / "environments" / "castle-iso.png", manifest)
    import king_sprite  # noqa: E402

    king_sprite.build(ASSETS / "characters" / "king.png", manifest)
    with open(ASSETS / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"assets written to {ASSETS}")


if __name__ == "__main__":
    main()
