#!/usr/bin/env python3
"""Small follow-up type guard for the pointer-id touch router."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator"

def patch(name: str, old: str, new: str) -> None:
    path = src / name
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected declaration not found: {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

patch("PS1PlayerActivity.kt", "private lateinit var controlsContainer: FrameLayout", "private lateinit var controlsContainer: MultiTouchControlFrame")
patch("FamicomCompatPlayerActivity.kt", "private lateinit var controlsContainer: FrameLayout", "private lateinit var controlsContainer: MultiTouchControlFrame")
patch("UniversalLibretroPlayerActivity.kt", "private lateinit var root: FrameLayout", "private lateinit var root: MultiTouchControlFrame")
print("Pointer router container declarations aligned.")
