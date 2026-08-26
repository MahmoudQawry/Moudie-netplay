#!/usr/bin/env python3
"""Build-time guard for Android touch routing and native-player compatibility.

Android ViewGroups only deliver independent touch streams to sibling controls when
motion-event splitting is enabled along the complete ancestor chain. Without it,
the first finger can own the gesture stream and a second button never receives its
own DOWN/UP pair. This script also normalizes a Kotlin editor-bar block that can
be rejected by the Android/Kotlin toolchain because of ambiguous synthetic property
assignment inside a nested layout lambda. It is intentionally idempotent so local
and CI builds behave identically.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected compatibility block not found: {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


ps1 = ROOT / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt"
replace_once(
    ps1,
    'root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }',
    'root = FrameLayout(this).apply {\n      setBackgroundColor(Color.BLACK)\n      // Every finger must be routed independently to its own virtual control.\n      isMotionEventSplittingEnabled = true\n    }',
)
replace_once(
    ps1,
    'controlsContainer = FrameLayout(this).apply { addView(createFreeControlCanvas()) }',
    'controlsContainer = FrameLayout(this).apply {\n      isMotionEventSplittingEnabled = true\n      addView(createFreeControlCanvas())\n    }',
)
replace_once(
    ps1,
    'private fun createFreeControlCanvas(): FrameLayout = FrameLayout(this).apply {\n    val size = dp(58)',
    'private fun createFreeControlCanvas(): FrameLayout = FrameLayout(this).apply {\n    // The D-pad and face buttons are siblings; split pointers so two fingers can\n    // hold any combination exactly like a physical controller.\n    isMotionEventSplittingEnabled = true\n    val size = dp(58)',
)

famicom = ROOT / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/FamicomCompatPlayerActivity.kt"
replace_once(
    famicom,
    'root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }',
    'root = FrameLayout(this).apply {\n      setBackgroundColor(Color.BLACK)\n      isMotionEventSplittingEnabled = true\n    }',
)
replace_once(
    famicom,
    'controlsContainer = FrameLayout(this)',
    'controlsContainer = FrameLayout(this).apply { isMotionEventSplittingEnabled = true }',
)
replace_once(
    famicom,
    'val wrapper = LinearLayout(this).apply {\n      orientation = LinearLayout.VERTICAL',
    'val wrapper = LinearLayout(this).apply {\n      // Keep independent pointers alive through the full control hierarchy.\n      isMotionEventSplittingEnabled = true\n      orientation = LinearLayout.VERTICAL',
)
replace_once(
    famicom,
    'val playRow = FrameLayout(this)',
    'val playRow = FrameLayout(this).apply { isMotionEventSplittingEnabled = true }',
)
replace_once(
    famicom,
    'private fun createDpad(): FrameLayout = FrameLayout(this).apply {\n    layoutDirection',
    'private fun createDpad(): FrameLayout = FrameLayout(this).apply {\n    isMotionEventSplittingEnabled = true\n    layoutDirection',
)

universal = ROOT / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt"
replace_once(
    universal,
    '    fun b(label: String, gravity: Int, click: () -> Unit) { bar.addView(TextView(this@UniversalLibretroPlayerActivity).apply { text = label; gravity = Gravity.CENTER; setTextColor(Color.WHITE); textSize = 15f; background = bg(Color.argb(190, 4, 12, 22), Color.argb(170, 90, 220, 255), 10); setOnClickListener { click() } }, FrameLayout.LayoutParams(dp(48), dp(38), gravity).apply { topMargin = dp(8); leftMargin = dp(8); rightMargin = dp(8) }) }',
    '''    fun b(label: String, buttonGravity: Int, click: () -> Unit) {
      val button = TextView(this@UniversalLibretroPlayerActivity).apply {
        text = label
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        textSize = 15f
        background = bg(Color.argb(190, 4, 12, 22), Color.argb(170, 90, 220, 255), 10)
        setOnClickListener { click() }
      }
      val params = FrameLayout.LayoutParams(dp(48), dp(38), buttonGravity)
      params.topMargin = dp(8)
      params.setMargins(dp(8), dp(8), dp(8), 0)
      bar.addView(button, params)
    }''',
)

print("Native multitouch and editor compatibility guard applied successfully.")
