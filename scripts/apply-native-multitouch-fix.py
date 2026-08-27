#!/usr/bin/env python3
"""Keep each native emulator on its connected-D-pad touch model.

The connected D-pad controls its own multi-pointer stream. Android's child
event splitting therefore remains the single owner model for every native
activity; a generic parent pointer router would consume the D-pad's fingers
before it can combine a direction with a face button.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator"


def normalize(path: Path, wrapped: str, plain: str, injected: str, original: str) -> None:
    text = path.read_text(encoding="utf-8")
    text = text.replace(wrapped, plain, 1)
    text = text.replace(injected, original, 1)
    if plain not in text:
        raise SystemExit(f"Connected D-pad touch container is missing: {path}")
    path.write_text(text, encoding="utf-8")


normalize(
    src / "PS1PlayerActivity.kt",
    "controlsContainer = MultiTouchControlFrame(this, { !controlEditMode }) { action, key -> sendLocalKey(action, key) }.apply { addView(createFreeControlCanvas()) }",
    "controlsContainer = FrameLayout(this).apply { isMotionEventSplittingEnabled = true; addView(createFreeControlCanvas()) }",
    "private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {\n    controlsContainer.registerWhenAttached(view, keyCode)",
    "private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {",
)
normalize(
    src / "FamicomCompatPlayerActivity.kt",
    "controlsContainer = MultiTouchControlFrame(this, { !controlEditMode }) { action, key -> retroView.sendKeyEvent(action, key) }",
    "controlsContainer = FrameLayout(this).apply { isMotionEventSplittingEnabled = true }",
    "private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {\n    controlsContainer.registerWhenAttached(view, keyCode)",
    "private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {",
)
normalize(
    src / "UniversalLibretroPlayerActivity.kt",
    "root = MultiTouchControlFrame(this, { !editMode }) { action, key -> if (action == KeyEvent.ACTION_DOWN) press(key) else release(key) }.apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }",
    "root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }",
    "private fun interact(v: View, id: String, key: Int) {\n    root.registerWhenAttached(v, key)",
    "private fun interact(v: View, id: String, key: Int) {",
)

print("Connected D-pad multi-touch routing preserved for all native emulators.")
