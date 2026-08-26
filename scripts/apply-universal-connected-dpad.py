#!/usr/bin/env python3
"""Use one connected classic-style D-pad for PSP, Sega and Arcade native players."""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt"
text = path.read_text(encoding="utf-8")

# The generic router is excellent for separate buttons, but a connected D-pad is already
# a multi-pointer owner. Preserve Android child event splitting for this activity.
wrapped = 'root = MultiTouchControlFrame(this, { !editMode }) { action, key -> if (action == KeyEvent.ACTION_DOWN) press(key) else release(key) }.apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }'
plain = 'root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }'
text = text.replace(wrapped, plain, 1)
injected = 'private fun interact(v: View, id: String, key: Int) {\n    root.registerWhenAttached(v, key)'
text = text.replace(injected, 'private fun interact(v: View, id: String, key: Int) {', 1)

old = '''  private fun addController() {
    val p = definition.profile
    addControl(p.directions.up, Gravity.LEFT or Gravity.BOTTOM, 74, 168)
    addControl(p.directions.left, Gravity.LEFT or Gravity.BOTTOM, 16, 110)
    addControl(p.directions.right, Gravity.LEFT or Gravity.BOTTOM, 132, 110)
    addControl(p.directions.down, Gravity.LEFT or Gravity.BOTTOM, 74, 52)
    val face = arrayOf(74 to 168, 132 to 110, 16 to 110, 74 to 52)
'''
new = '''  private fun addController() {
    val p = definition.profile
    val dpad = PlayStationStyleDpad(
      context = this,
      upKey = p.directions.up.keyCode, downKey = p.directions.down.keyCode,
      leftKey = p.directions.left.keyCode, rightKey = p.directions.right.keyCode,
      onKey = { action, key -> if (action == MotionEvent.ACTION_DOWN) press(key) else release(key) },
      preferences = preferences, layoutKey = key("dpad"), editing = { editMode },
      onSelected = { view -> selected = view to "dpad" },
    )
    root.addView(dpad, FrameLayout.LayoutParams(dp(174), dp(174), Gravity.LEFT or Gravity.BOTTOM).apply { leftMargin = dp(16); bottomMargin = dp(52) })
    controls += dpad to "dpad"
    val face = arrayOf(74 to 168, 132 to 110, 16 to 110, 74 to 52)
'''
if old not in text and new not in text:
    raise SystemExit("Universal controller anchor not found")
if old in text: text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("Connected D-pad installed for PSP, Sega and Arcade.")
