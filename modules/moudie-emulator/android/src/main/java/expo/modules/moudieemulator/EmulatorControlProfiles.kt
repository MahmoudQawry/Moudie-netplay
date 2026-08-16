package expo.modules.moudieemulator

import android.view.KeyEvent

/** Immutable button definitions keep each emulated system's layout and key mapping isolated. */
data class EmulatorTouchButton(val id: String, val label: String, val keyCode: Int)

data class DirectionalControlGroup(
  val up: EmulatorTouchButton,
  val down: EmulatorTouchButton,
  val left: EmulatorTouchButton,
  val right: EmulatorTouchButton,
)

data class EmulatorControlProfile(
  val systemId: String,
  val directions: DirectionalControlGroup,
  val actionButtons: List<EmulatorTouchButton>,
  val systemButtons: List<EmulatorTouchButton>,
  val shoulderButtons: List<EmulatorTouchButton> = emptyList(),
)

/**
 * Source of truth for native touch controls. Players use only their own profile, so Famicom,
 * PS1, PSP, and Sega mappings cannot be accidentally combined as new native players are added.
 */
object EmulatorControlProfiles {
  private fun dpad() = DirectionalControlGroup(
    up = EmulatorTouchButton("up", "↑", KeyEvent.KEYCODE_DPAD_UP),
    down = EmulatorTouchButton("down", "↓", KeyEvent.KEYCODE_DPAD_DOWN),
    left = EmulatorTouchButton("left", "←", KeyEvent.KEYCODE_DPAD_LEFT),
    right = EmulatorTouchButton("right", "→", KeyEvent.KEYCODE_DPAD_RIGHT),
  )

  val FAMICOM = EmulatorControlProfile(
    systemId = "nes",
    directions = dpad(),
    actionButtons = listOf(
      EmulatorTouchButton("a", "A", KeyEvent.KEYCODE_BUTTON_A),
      EmulatorTouchButton("b", "B", KeyEvent.KEYCODE_BUTTON_B),
    ),
    systemButtons = listOf(
      EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT),
      EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START),
    ),
  )

  val PS1 = EmulatorControlProfile(
    systemId = "ps1",
    directions = dpad(),
    actionButtons = listOf(
      EmulatorTouchButton("triangle", "△", KeyEvent.KEYCODE_BUTTON_X),
      EmulatorTouchButton("circle", "○", KeyEvent.KEYCODE_BUTTON_A),
      EmulatorTouchButton("square", "□", KeyEvent.KEYCODE_BUTTON_Y),
      EmulatorTouchButton("cross", "×", KeyEvent.KEYCODE_BUTTON_B),
    ),
    systemButtons = listOf(
      EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT),
      EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START),
    ),
    shoulderButtons = listOf(
      EmulatorTouchButton("l1", "L1", KeyEvent.KEYCODE_BUTTON_L1),
      EmulatorTouchButton("l2", "L2", KeyEvent.KEYCODE_BUTTON_L2),
      EmulatorTouchButton("r1", "R1", KeyEvent.KEYCODE_BUTTON_R1),
      EmulatorTouchButton("r2", "R2", KeyEvent.KEYCODE_BUTTON_R2),
    ),
  )

  // Reserved profiles for their own future native players; these do not enable emulation yet.
  val PSP = EmulatorControlProfile(
    systemId = "psp",
    directions = dpad(),
    actionButtons = listOf(
      EmulatorTouchButton("triangle", "△", KeyEvent.KEYCODE_BUTTON_X),
      EmulatorTouchButton("circle", "○", KeyEvent.KEYCODE_BUTTON_A),
      EmulatorTouchButton("square", "□", KeyEvent.KEYCODE_BUTTON_Y),
      EmulatorTouchButton("cross", "×", KeyEvent.KEYCODE_BUTTON_B),
    ),
    systemButtons = listOf(
      EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT),
      EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START),
    ),
    shoulderButtons = listOf(
      EmulatorTouchButton("l", "L", KeyEvent.KEYCODE_BUTTON_L1),
      EmulatorTouchButton("r", "R", KeyEvent.KEYCODE_BUTTON_R1),
    ),
  )

  val SEGA = EmulatorControlProfile(
    systemId = "sega",
    directions = dpad(),
    actionButtons = listOf(
      EmulatorTouchButton("a", "A", KeyEvent.KEYCODE_BUTTON_A),
      EmulatorTouchButton("b", "B", KeyEvent.KEYCODE_BUTTON_B),
      EmulatorTouchButton("c", "C", KeyEvent.KEYCODE_BUTTON_C),
      EmulatorTouchButton("x", "X", KeyEvent.KEYCODE_BUTTON_X),
      EmulatorTouchButton("y", "Y", KeyEvent.KEYCODE_BUTTON_Y),
      EmulatorTouchButton("z", "Z", KeyEvent.KEYCODE_BUTTON_Z),
    ),
    systemButtons = listOf(
      EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START),
    ),
  )
}
