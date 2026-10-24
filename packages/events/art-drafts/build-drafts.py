#!/usr/bin/env python3
"""Hand-composes the three Fall 2026 art drafts into <name>.txt (the picture)
and <name>.mask.txt (same shape; 1-9 then a, b mark the week each character
belongs to, a space is scenery). Edit the stamps, rerun, then preview with
scripts/art-preview.mjs."""
import os
WK = "123456789ab"  # 11 weeks: Sep 7 .. Nov 16 2026

def canvas(w, h):
    return [[" "] * w for _ in range(h)], [[" "] * w for _ in range(h)]

def put(art, mask, r, c, rows, sym=None):
    for dr, line in enumerate(rows):
        for dc, ch in enumerate(line):
            if ch == " ":
                continue
            if 0 <= r + dr < len(art) and 0 <= c + dc < len(art[0]):
                art[r + dr][c + dc] = ch
                if sym:
                    mask[r + dr][c + dc] = sym

def write(name, art, mask):
    here = os.path.dirname(os.path.abspath(__file__))
    for suffix, grid in (("", art), (".mask", mask)):
        lines = ["".join(row).rstrip() for row in grid]
        while lines and not lines[-1]:
            lines.pop()
        with open(os.path.join(here, f"{name}{suffix}.txt"), "w") as f:
            f.write("\n".join(lines) + "\n")

STARS = [(0, 4), (1, 17), (0, 29), (2, 40), (1, 52), (4, 8), (3, 33), (5, 47), (2, 11), (6, 24), (0, 45)]

# ---- A: paw trail -----------------------------------------------------------
def paws():
    art, mask = canvas(58, 13)
    for r, c in STARS:
        art[r][c] = "*" if (r + c) % 3 == 0 else "."
    paw = ["o o", "(_)"]
    for i in range(11):
        col = 1 + i * 5
        row = 10 - i * 7 // 10 - (3 if i % 2 else 0)
        put(art, mask, row, col, paw, WK[i])
    # scenery: a small moon top right and a ground line
    put(art, mask, 0, 53, [" _ ", "( )", " ' "])
    art[12] = list("-" * 58)
    write("a-paw-trail", art, mask)

# ---- B: rocket --------------------------------------------------------------
def rocket():
    art, mask = canvas(60, 11)
    for r, c in [(0, 6), (1, 30), (0, 52), (10, 14), (9, 40), (10, 57), (1, 12)]:
        art[r][c] = "." if (r + c) % 2 else "*"
    blocks = [
        # week 1: the exhaust
        ["     ", "  ~~ ", " ~~~-", "~~~~~", " ~~~-", "  ~~ ", "     "],
        # week 2: the engine
        ["     ", "  ___", " |===", " |===", " |===", " |___", "     "],
        # week 3: lower fin
        ["  /| ", " / | ", "/__|_", "     ", "_|___", "     ", "     "],
        # week 4: tank band
        ["_____", "     ", "#####", "#####", "#####", "     ", "-----"],
        # week 5: tank band
        ["_____", "     ", "=====", "=====", "=====", "     ", "-----"],
        # week 6: porthole 1
        ["_____", " ___ ", "|( )|", "|___|", "     ", "     ", "-----"],
        # week 7: tank band
        ["_____", "     ", "#####", "#####", "#####", "     ", "-----"],
        # week 8: porthole 2
        ["_____", " ___ ", "|( )|", "|___|", "     ", "     ", "-----"],
        # week 9: upper hull
        ["_____", "     ", "=====", "=====", "=====", "     ", "-----"],
        # week 10: shoulder
        ["___  ", "   -.", "####.", "####.", "####'", "   -'", "---  "],
        # week 11: nose cone
        ["     ", ".-.  ", "|  ' ", "|  . ", "'-'  ", "     ", "     "],
    ]
    # rebuild as a proper rocket by hand: top/bottom edges on rows 1 and 5
    for i, rows in enumerate(blocks):
        put(art, mask, 2, 2 + i * 5 if i < 11 else 2, rows, WK[i])
    write("b-rocket", art, mask)

# ---- C: skyline -------------------------------------------------------------
def skyline():
    art, mask = canvas(58, 14)
    for r, c in [(0, 3), (1, 19), (0, 33), (2, 46), (1, 55), (3, 10), (0, 24), (2, 38)]:
        art[r][c] = "*" if (r * c) % 2 else "."
    heights = [6, 9, 7, 11, 8, 12, 9, 7, 10, 8, 6]
    for i, h in enumerate(heights):
        col = 1 + i * 5
        top = 13 - h
        w = 5
        rows = ["+---+"]
        for k in range(h - 1):
            if k % 2 == 0:
                rows.append("|o o|")
            else:
                rows.append("|   |")
        put(art, mask, top, col, rows, WK[i])
    art[13] = list("=" * 58)
    # the ground is scenery; building bottoms sit on it
    write("c-skyline", art, mask)

paws(); rocket(); skyline()
