#!/usr/bin/env python3
"""Replace the Famicom's four detached direction buttons with one connected D-pad."""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/FamicomCompatPlayerActivity.kt"
text = path.read_text(encoding="utf-8")
text = text.replace("private var selectedEditableControl: Pair<TextView, String>? = null", "private var selectedEditableControl: Pair<View, String>? = null", 1)
wrapped = 'controlsContainer = MultiTouchControlFrame(this, { !controlEditMode }) { action, key -> retroView.sendKeyEvent(action, key) }'
plain = 'controlsContainer = FrameLayout(this).apply { isMotionEventSplittingEnabled = true }'
text = text.replace(wrapped, plain, 1)
text = text.replace('private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {\n    controlsContainer.registerWhenAttached(view, keyCode)', 'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {', 1)
old = '''  private fun createDpad(): FrameLayout = FrameLayout(this).apply {
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    val size = controlSize()
    addView(button(controlProfile.directions.up, size, size), FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.CENTER_HORIZONTAL))
    addView(button(controlProfile.directions.left, size, size), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.LEFT))
    addView(button(controlProfile.directions.right, size, size), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.RIGHT))
    addView(button(controlProfile.directions.down, size, size), FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
  }
'''
new = '''  private fun createDpad(): PlayStationStyleDpad = PlayStationStyleDpad(
    context = this,
    upKey = controlProfile.directions.up.keyCode, downKey = controlProfile.directions.down.keyCode,
    leftKey = controlProfile.directions.left.keyCode, rightKey = controlProfile.directions.right.keyCode,
    onKey = { action, key -> retroView.sendKeyEvent(if (action == MotionEvent.ACTION_DOWN) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, key) },
    preferences = controlPreferences, layoutKey = controlLayoutKey("dpad"), editing = { controlEditMode },
    onSelected = { view -> selectedEditableControl = view to "DPAD" },
  )
'''
if old in text: text = text.replace(old, new, 1)
elif new not in text: raise SystemExit("Famicom D-pad anchor not found")
path.write_text(text, encoding="utf-8")
print("Connected D-pad installed for Famicom.")
