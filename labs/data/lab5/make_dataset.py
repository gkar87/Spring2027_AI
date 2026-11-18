#!/usr/bin/env python3
"""Generate the Lab 5 image dataset.

    python3 make_dataset.py            # writes dataset.bin and dataset_meta.json

Ten classes of 28x28 greyscale images, 1000 each, generated procedurally:
each class is a stroke pattern drawn with a random rotation, scale, offset,
line weight, background and Gaussian noise. Some classes are deliberately
confusable under noise (cross vs diagonal cross, ring vs circle), which is what
makes the error analysis in the lab worth doing.

Dataset file layout (`dataset.bin`, no dependencies to read it):

    offset 0                    10000 * 28 * 28 bytes   pixels, uint8, row-major
    offset 7840000              10000 bytes              labels, uint8, 0..9

Read it with

    import numpy as np
    raw = np.fromfile("dataset.bin", dtype=np.uint8)
    x = raw[:7840000].reshape(-1, 28, 28)
    y = raw[7840000:]

Deterministic: the same seed produces the same file byte for byte.
"""
import json
import math
import random

SIZE = 28
PER_CLASS = 1000
SEED = 2027
SPLIT = {"train": 7000, "val": 1500, "test": 1500}

CLASS_NAMES = ["circle", "ring", "square", "triangle", "cross",
               "diagonal", "bar", "ell", "tee", "dots"]


def polygon(cx, cy, r, n, phase=0.0):
    pts = [(cx + r * math.cos(phase + 2 * math.pi * i / n),
            cy + r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]
    return list(zip(pts, pts[1:] + pts[:1]))


def shapes():
    s = {}
    s["circle"] = polygon(0, 0, 0.72, 20)
    s["ring"] = polygon(0, 0, 0.78, 20) + polygon(0, 0, 0.46, 20)
    s["square"] = [((-0.6, -0.6), (0.6, -0.6)), ((0.6, -0.6), (0.6, 0.6)),
                   ((0.6, 0.6), (-0.6, 0.6)), ((-0.6, 0.6), (-0.6, -0.6))]
    s["triangle"] = [((0, -0.7), (0.68, 0.55)), ((0.68, 0.55), (-0.68, 0.55)),
                     ((-0.68, 0.55), (0, -0.7))]
    s["cross"] = [((0, -0.7), (0, 0.7)), ((-0.7, 0), (0.7, 0))]
    s["diagonal"] = [((-0.65, -0.65), (0.65, 0.65)), ((0.65, -0.65), (-0.65, 0.65))]
    s["bar"] = [((-0.72, 0), (0.72, 0))]
    s["ell"] = [((0, -0.7), (0, 0.65)), ((0, 0.65), (0.6, 0.65))]
    s["tee"] = [((-0.6, -0.6), (0.6, -0.6)), ((0, -0.6), (0, 0.7))]
    s["dots"] = [((x - 0.09, y), (x + 0.09, y))
                 for x in (-0.42, 0.42) for y in (-0.42, 0.42)]
    return s


SHAPES = shapes()


def transform(pt, scale, rot, tx, ty):
    x, y = pt
    xr = x * math.cos(rot) - y * math.sin(rot)
    yr = x * math.sin(rot) + y * math.cos(rot)
    return ((xr * scale + tx) * SIZE / 2 + SIZE / 2,
            (yr * scale + ty) * SIZE / 2 + SIZE / 2)


def stroke(buf, p0, p1, weight):
    """Bresenham line with a soft 1-pixel spread, so strokes are not razor thin."""
    x0, y0 = p0
    x1, y1 = p1
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                px, py = int(round(x)) + dx, int(round(y)) + dy
                if 0 <= px < SIZE and 0 <= py < SIZE:
                    falloff = weight if (dx == 0 and dy == 0) else weight * 0.35
                    buf[py][px] = min(1.0, buf[py][px] + falloff)


def render(cls, rng):
    buf = [[0.0] * SIZE for _ in range(SIZE)]
    scale = rng.uniform(0.50, 1.05)
    rot = rng.uniform(-0.70, 0.70)
    tx = rng.uniform(-0.20, 0.20)
    ty = rng.uniform(-0.20, 0.20)
    weight = rng.choice((0.55, 0.75, 0.95))

    segments = SHAPES[CLASS_NAMES[cls]]
    for a, b in segments:
        stroke(buf, transform(a, scale, rot, tx, ty),
               transform(b, scale, rot, tx, ty), weight)

    # occluding patches, which is what makes some images genuinely ambiguous
    if rng.random() < 0.30:
        r0, c0 = rng.randrange(0, SIZE - 10), rng.randrange(0, SIZE - 10)
        for r in range(r0, r0 + rng.randrange(4, 11)):
            for c in range(c0, c0 + rng.randrange(4, 11)):
                buf[r][c] *= rng.uniform(0.0, 0.3)

    background = rng.uniform(0.0, 0.35)
    sigma = rng.uniform(0.06, 0.20)
    out = bytearray(SIZE * SIZE)
    for r in range(SIZE):
        for c in range(SIZE):
            v = buf[r][c] + background + rng.gauss(0.0, sigma)
            out[r * SIZE + c] = max(0, min(255, int(v * 255)))
    return bytes(out)


def main():
    rng = random.Random(SEED)
    pixels = bytearray()
    labels = bytearray()
    for cls in range(len(CLASS_NAMES)):
        for _ in range(PER_CLASS):
            pixels += render(cls, rng)
            labels.append(cls)

    with open("dataset.bin", "wb") as f:
        f.write(pixels)
        f.write(labels)

    order = list(range(PER_CLASS * len(CLASS_NAMES)))
    rng.shuffle(order)
    train = order[:SPLIT["train"]]
    val = order[SPLIT["train"]:SPLIT["train"] + SPLIT["val"]]
    test = order[SPLIT["train"] + SPLIT["val"]:]
    with open("dataset_meta.json", "w", encoding="utf-8") as f:
        json.dump({
            "size": SIZE,
            "classes": CLASS_NAMES,
            "count": len(order),
            "per_class": PER_CLASS,
            "layout": "pixels (count*size*size uint8) then labels (count uint8)",
            "seed": SEED,
            "split": {"train": train, "val": val, "test": test},
            "note": "Indices in 'split' index into the flat dataset. Respect the split: "
                    "tuning against test makes the test set meaningless.",
        }, f)
        f.write("\n")

    print(f"wrote dataset.bin ({len(pixels) + len(labels):,} bytes) "
          f"and dataset_meta.json ({len(order):,} images, {len(CLASS_NAMES)} classes)")


if __name__ == "__main__":
    main()
