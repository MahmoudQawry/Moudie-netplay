#!/usr/bin/env python3
"""Prepare the user-supplied square brand artwork for Expo app assets."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/home/ubuntu/upload/1000360792.webp")
TARGET = ROOT / "assets" / "images"


def save_png(image: Image.Image, name: str, size: int) -> None:
    canvas = image.copy().convert("RGBA")
    canvas.thumbnail((size, size), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (size, size), (16, 24, 39, 255))
    offset = ((size - canvas.width) // 2, (size - canvas.height) // 2)
    output.alpha_composite(canvas, offset)
    output.convert("RGB").save(TARGET / name, "PNG", optimize=True)


if not SOURCE.is_file():
    raise SystemExit(f"Missing user-supplied brand image: {SOURCE}")

TARGET.mkdir(parents=True, exist_ok=True)
with Image.open(SOURCE) as source:
    image = source.convert("RGBA")
    save_png(image, "classic-era-brand-icon.png", 1024)
    save_png(image, "classic-era-brand-splash.png", 1024)
    save_png(image, "classic-era-brand-card.png", 768)

print("Prepared Classic Era brand assets from the user-supplied artwork.")
