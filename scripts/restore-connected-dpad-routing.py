#!/usr/bin/env python3
"""Keep the connected PS1 D-pad as the owner of its touch stream during builds.

The generic multi-touch build guard predates the connected D-pad and routes only
individual TextView buttons. The connected D-pad is itself a multi-pointer View,
so wrapping the PS1 overlay in that older router would steal a second finger when
it moves from the pad to a face button. Android child event splitting is the
correct model here: the D-pad owns its own pointers and the independent face
buttons own theirs.
"""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt"
text = path.read_text(encoding="utf-8")
wrapped = 'controlsContainer = MultiTouchControlFrame(this, { !controlEditMode }) { action, key -> sendLocalKey(action, key) }.apply { addView(createFreeControlCanvas()) }'
plain = 'controlsContainer = FrameLayout(this).apply { isMotionEventSplittingEnabled = true; addView(createFreeControlCanvas()) }'
if wrapped in text:
    text = text.replace(wrapped, plain, 1)
elif 'controlsContainer = FrameLayout(this).apply { addView(createFreeControlCanvas()) }' in text:
    text = text.replace('controlsContainer = FrameLayout(this).apply { addView(createFreeControlCanvas()) }', plain, 1)

injected = 'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {\n    controlsContainer.registerWhenAttached(view, keyCode)'
original = 'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {'
text = text.replace(injected, original, 1)
path.write_text(text, encoding="utf-8")
print("Connected D-pad routing preserved for PS1.")
