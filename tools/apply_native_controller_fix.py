from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ps1 = ROOT / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt"
dpad = ROOT / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PlayStationStyleDpad.kt"

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Patch anchor not found: {label}")
    return text.replace(old, new, 1)

# Keep coordinates in the receiving View's space. getRawX(index) was introduced in API 29;
# using getX(index)/getY(index) keeps the editable D-pad compatible with older Android devices.
text = dpad.read_text()
text = text.replace("downRawX = event.rawX; downRawY = event.rawY", "downRawX = event.x; downRawY = event.y")
text = text.replace("event.getRawX(i) - downRawX", "event.getX(i) - downRawX")
text = text.replace("event.getRawY(i) - downRawY", "event.getY(i) - downRawY")
dpad.write_text(text)

text = ps1.read_text()
text = text.replace("private var selectedEditableControl: Pair<TextView, String>? = null", "private var selectedEditableControl: Pair<View, String>? = null")
if "private lateinit var savesDirectory: File" not in text:
    text = text.replace("private lateinit var stateFile: File", "private lateinit var stateFile: File\n  private lateinit var savesDirectory: File", 1)
text = text.replace("val savesDirectory = File(filesDir, \"moudie-ps1/saves\").apply { mkdirs() }", "savesDirectory = File(filesDir, \"moudie-ps1/saves\").apply { mkdirs() }")

old_free = '''  private fun createFreeControlCanvas(): FrameLayout = FrameLayout(this).apply {
    val size = dp(58)
    fun add(control: EmulatorTouchButton, gravity: Int, left: Int = 0, top: Int = 0, right: Int = 0, bottom: Int = 0, shape: TouchButtonShape = TouchButtonShape.CIRCLE) {
      addView(button(control, size, size, shape), FrameLayout.LayoutParams(size, size, gravity).apply {
        leftMargin = dp(left); topMargin = dp(top); rightMargin = dp(right); bottomMargin = dp(bottom)
      })
    }
    add(controlProfile.shoulderButtons[0], Gravity.LEFT or Gravity.TOP, left = 16, top = 72)
    add(controlProfile.shoulderButtons[1], Gravity.LEFT or Gravity.TOP, left = 82, top = 72)
    add(controlProfile.shoulderButtons[3], Gravity.RIGHT or Gravity.TOP, right = 82, top = 72)
    add(controlProfile.shoulderButtons[2], Gravity.RIGHT or Gravity.TOP, right = 16, top = 72)
    add(controlProfile.directions.up, Gravity.LEFT or Gravity.BOTTOM, left = 74, bottom = 168, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.directions.left, Gravity.LEFT or Gravity.BOTTOM, left = 16, bottom = 110, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.directions.right, Gravity.LEFT or Gravity.BOTTOM, left = 132, bottom = 110, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.directions.down, Gravity.LEFT or Gravity.BOTTOM, left = 74, bottom = 52, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.actionButtons[0], Gravity.RIGHT or Gravity.BOTTOM, right = 74, bottom = 168)
    add(controlProfile.actionButtons[2], Gravity.RIGHT or Gravity.BOTTOM, right = 132, bottom = 110)
    add(controlProfile.actionButtons[1], Gravity.RIGHT or Gravity.BOTTOM, right = 16, bottom = 110)
    add(controlProfile.actionButtons[3], Gravity.RIGHT or Gravity.BOTTOM, right = 74, bottom = 52)
    add(controlProfile.systemButtons[0], Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, right = 64, bottom = 40)
    add(controlProfile.systemButtons[1], Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, left = 64, bottom = 40)
  }
'''
new_free = '''  private fun createFreeControlCanvas(): FrameLayout = FrameLayout(this).apply {
    val size = dp(58)
    fun add(control: EmulatorTouchButton, gravity: Int, left: Int = 0, top: Int = 0, right: Int = 0, bottom: Int = 0) {
      addView(button(control, size, size), FrameLayout.LayoutParams(size, size, gravity).apply {
        leftMargin = dp(left); topMargin = dp(top); rightMargin = dp(right); bottomMargin = dp(bottom)
      })
    }
    add(controlProfile.shoulderButtons[0], Gravity.LEFT or Gravity.TOP, left = 16, top = 72)
    add(controlProfile.shoulderButtons[1], Gravity.LEFT or Gravity.TOP, left = 82, top = 72)
    add(controlProfile.shoulderButtons[3], Gravity.RIGHT or Gravity.TOP, right = 82, top = 72)
    add(controlProfile.shoulderButtons[2], Gravity.RIGHT or Gravity.TOP, right = 16, top = 72)

    // The four directions are deliberately one connected touch surface. This is the
    // same physical-control principle as the classic PlayStation D-pad, not four
    // separate square buttons that compete for Android's gesture stream.
    val dpad = createConnectedDpad()
    addView(dpad, FrameLayout.LayoutParams(size * 3, size * 3, Gravity.LEFT or Gravity.BOTTOM).apply {
      leftMargin = dp(16); bottomMargin = dp(52)
    })

    add(controlProfile.actionButtons[0], Gravity.RIGHT or Gravity.BOTTOM, right = 74, bottom = 168)
    add(controlProfile.actionButtons[2], Gravity.RIGHT or Gravity.BOTTOM, right = 132, bottom = 110)
    add(controlProfile.actionButtons[1], Gravity.RIGHT or Gravity.BOTTOM, right = 16, bottom = 110)
    add(controlProfile.actionButtons[3], Gravity.RIGHT or Gravity.BOTTOM, right = 74, bottom = 52)
    add(controlProfile.systemButtons[0], Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, right = 64, bottom = 40)
    add(controlProfile.systemButtons[1], Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, left = 64, bottom = 40)
  }

  private fun createConnectedDpad(): PlayStationStyleDpad = PlayStationStyleDpad(
    context = this,
    upKey = controlProfile.directions.up.keyCode,
    downKey = controlProfile.directions.down.keyCode,
    leftKey = controlProfile.directions.left.keyCode,
    rightKey = controlProfile.directions.right.keyCode,
    onKey = { action, keyCode -> sendLocalKey(if (action == MotionEvent.ACTION_DOWN) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, keyCode) },
    preferences = controlPreferences,
    layoutKey = controlLayoutKey("dpad"),
    editing = { controlEditMode },
    onSelected = { view ->
      selectedEditableControl = view to "DPAD"
      selectedHud = null
      showToast("D-pad selected. Drag or pinch to resize the complete connected pad.")
    },
  )
'''
text = replace_once(text, old_free, new_free, "connected D-pad canvas")

old_pad = '''  /** A conventional four-way D-pad, matching the reference layout and editable per direction. */
  private fun createDirectionalPad(size: Int): FrameLayout = FrameLayout(this).apply {
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    addView(button(controlProfile.directions.up, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.CENTER_HORIZONTAL))
    addView(button(controlProfile.directions.down, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    addView(button(controlProfile.directions.left, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.LEFT))
    addView(button(controlProfile.directions.right, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.RIGHT))
  }
'''
new_pad = '''  /** One connected physical-style D-pad; the size argument remains for the existing layout caller. */
  private fun createDirectionalPad(size: Int): View = createConnectedDpad().apply {
    layoutParams = FrameLayout.LayoutParams(size * 3, size * 3)
  }
'''
text = replace_once(text, old_pad, new_pad, "connected D-pad normal layout")

old_options = '''.setItems(arrayOf("EDIT CONTROLS & SCREEN", "SAVE GAME", "LOAD GAME", "EXIT GAME")) { _, index ->
        when (index) { 0 -> beginGameplayEditor(); 1 -> saveState(silent = false); 2 -> loadState(); else -> finish() }
      }'''
new_options = '''.setItems(arrayOf("EDIT CONTROLS & SCREEN", "SAVE STATE", "LOAD STATE", "MEMORY CARD", "EXIT GAME")) { _, index ->
        when (index) { 0 -> beginGameplayEditor(); 1 -> saveState(silent = false); 2 -> loadState(); 3 -> showMemoryCardInfo(); else -> finish() }
      }'''
text = replace_once(text, old_options, new_options, "save/load options")

anchor = '''  private fun showChatDialog() {'''
method = '''  private fun showMemoryCardInfo() {
    val files = savesDirectory.listFiles()?.filter { it.isFile() }?.sortedBy { it.name }.orEmpty()
    val summary = if (files.isEmpty()) {
      "No memory-card file has been written yet. PS1 games create and update their own memory-card data automatically when they save in-game."
    } else {
      "Persistent memory-card data is stored locally for this app. Files currently present: ${files.joinToString { it.name }}"
    }
    AlertDialog.Builder(this).setTitle("PS1 MEMORY CARD").setMessage(summary).setPositiveButton("OK", null).show()
  }

'''
text = replace_once(text, anchor, method + anchor, "memory-card status")
ps1.write_text(text)
print("Native controller and save patch applied")
