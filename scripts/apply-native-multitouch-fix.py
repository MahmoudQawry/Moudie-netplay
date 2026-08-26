#!/usr/bin/env python3
"""Install a pointer-ID virtual gamepad router before Android builds.

Motion-event splitting alone is not a complete emulator solution. A real emulator
needs one owner for the whole touch stream, stable pointer IDs, reference-counted
button states and clean pointer transitions while fingers slide across controls.
This script installs that model for PS1, NES/Famicom, PSP, Sega and Arcade while
leaving the existing edit/drag/pinch controls untouched in edit mode.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected block not found: {path}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


helper = SRC / "MultiTouchControlFrame.kt"
helper.write_text(r'''package expo.modules.moudieemulator

import android.content.Context
import android.graphics.Rect
import android.util.SparseArray
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout

/**
 * Emulator-grade virtual gamepad input.
 *
 * The container owns the complete MotionEvent stream and tracks pointer IDs
 * directly, instead of relying on Android to keep separate child Views alive.
 * That gives the same fundamental behaviour expected from mature emulator
 * overlays: hold a direction, press one or more face buttons, change direction
 * without lifting, and never lose another finger's state.
 */
internal class MultiTouchControlFrame(
  context: Context,
  private val gameplayEnabled: () -> Boolean,
  private val dispatchKey: (Int, Int) -> Unit,
) : FrameLayout(context) {
  private val controls = linkedMapOf<View, Int>()
  private val pointerKeys = SparseArray<Int>()
  private val keyCounts = mutableMapOf<Int, Int>()
  private val rect = Rect()
  private var ownsGesture = false

  init {
    isMotionEventSplittingEnabled = true
    isClickable = true
  }

  fun registerWhenAttached(view: View, keyCode: Int) {
    view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) {
        controls[v] = keyCode
        // Gameplay events are handled by this parent. The child remains fully
        // interactive in edit mode because routing is disabled there.
        v.isClickable = false
      }
      override fun onViewDetachedFromWindow(v: View) { controls.remove(v) }
    })
    if (view.isAttachedToWindow) controls[view] = keyCode
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (!gameplayEnabled()) {
      if (ownsGesture || pointerKeys.size() > 0) releaseAll()
      ownsGesture = false
      return super.dispatchTouchEvent(event)
    }

    when (event.actionMasked) {
      MotionEvent.ACTION_CANCEL -> { releaseAll(); ownsGesture = false; return true }
      MotionEvent.ACTION_DOWN -> {
        releaseAll()
        ownsGesture = hit(event.rawX, event.rawY) != null
        if (!ownsGesture) return super.dispatchTouchEvent(event)
      }
      MotionEvent.ACTION_POINTER_DOWN -> if (!ownsGesture) {
        val i = event.actionIndex
        if (hit(rawX(event, i), rawY(event, i)) != null) ownsGesture = true
      }
    }
    if (!ownsGesture) return super.dispatchTouchEvent(event)

    val lifted = if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_POINTER_UP) event.actionIndex else -1
    for (i in 0 until event.pointerCount) {
      if (i == lifted) continue
      setPointer(event.getPointerId(i), hit(rawX(event, i), rawY(event, i)))
    }
    if (lifted >= 0) clearPointer(event.getPointerId(lifted))
    if (event.actionMasked == MotionEvent.ACTION_UP) ownsGesture = false
    return true
  }

  override fun onTouchEvent(event: MotionEvent): Boolean = true

  fun releaseAll() {
    val keys = keyCounts.keys.toList()
    pointerKeys.clear()
    keyCounts.clear()
    keys.forEach { dispatchKey(KeyEvent.ACTION_UP, it) }
  }

  private fun setPointer(pointerId: Int, next: Int?) {
    val stored = pointerKeys.get(pointerId, Int.MIN_VALUE)
    val previous = if (stored == Int.MIN_VALUE) null else stored
    if (previous == next) return
    if (previous != null) decrement(previous)
    if (next == null) pointerKeys.remove(pointerId)
    else {
      pointerKeys.put(pointerId, next)
      val count = (keyCounts[next] ?: 0) + 1
      keyCounts[next] = count
      if (count == 1) dispatchKey(KeyEvent.ACTION_DOWN, next)
    }
  }

  private fun clearPointer(pointerId: Int) {
    val previous = pointerKeys.get(pointerId, Int.MIN_VALUE)
    if (previous != Int.MIN_VALUE) {
      pointerKeys.remove(pointerId)
      decrement(previous)
    }
  }

  private fun decrement(keyCode: Int) {
    val count = (keyCounts[keyCode] ?: 1) - 1
    if (count <= 0) {
      keyCounts.remove(keyCode)
      dispatchKey(KeyEvent.ACTION_UP, keyCode)
    } else keyCounts[keyCode] = count
  }

  private fun hit(x: Float, y: Float): Int? {
    controls.entries.toList().asReversed().forEach { (view, keyCode) ->
      if (view.isShown && view.getGlobalVisibleRect(rect) && rect.contains(x.toInt(), y.toInt())) return keyCode
    }
    return null
  }

  private fun rawX(event: MotionEvent, index: Int): Float = if (index == 0) event.rawX else event.rawX + event.getX(index) - event.getX(0)
  private fun rawY(event: MotionEvent, index: Int): Float = if (index == 0) event.rawY else event.rawY + event.getY(index) - event.getY(0)
}
''', encoding="utf-8")

ps1 = SRC / "PS1PlayerActivity.kt"
replace_once(
    ps1,
    'controlsContainer = FrameLayout(this).apply { addView(createFreeControlCanvas()) }',
    'controlsContainer = MultiTouchControlFrame(this, { !controlEditMode }) { action, key -> sendLocalKey(action, key) }.apply { addView(createFreeControlCanvas()) }',
)
replace_once(
    ps1,
    'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {',
    'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {\n    controlsContainer.registerWhenAttached(view, keyCode)',
)

famicom = SRC / "FamicomCompatPlayerActivity.kt"
replace_once(
    famicom,
    'controlsContainer = FrameLayout(this)',
    'controlsContainer = MultiTouchControlFrame(this, { !controlEditMode }) { action, key -> retroView.sendKeyEvent(action, key) }',
)
replace_once(
    famicom,
    'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {',
    'private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {\n    controlsContainer.registerWhenAttached(view, keyCode)',
)

universal = SRC / "UniversalLibretroPlayerActivity.kt"
replace_once(
    universal,
    'root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }',
    'root = MultiTouchControlFrame(this, { !editMode }) { action, key -> if (action == KeyEvent.ACTION_DOWN) press(key) else release(key) }.apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }',
)
replace_once(
    universal,
    'private fun interact(v: View, id: String, key: Int) {',
    'private fun interact(v: View, id: String, key: Int) {\n    root.registerWhenAttached(v, key)',
)

# Keep the editor-bar compatibility fix from the previous build guard.
replace_once(
    universal,
    '    fun b(label: String, gravity: Int, click: () -> Unit) { bar.addView(TextView(this@UniversalLibretroPlayerActivity).apply { text = label; gravity = Gravity.CENTER; setTextColor(Color.WHITE); textSize = 15f; background = bg(Color.argb(190, 4, 12, 22), Color.argb(170, 90, 220, 255), 10); setOnClickListener { click() } }, FrameLayout.LayoutParams(dp(48), dp(38), gravity).apply { topMargin = dp(8); leftMargin = dp(8); rightMargin = dp(8) }) }',
    '''    fun b(label: String, buttonGravity: Int, click: () -> Unit) {
      val button = TextView(this@UniversalLibretroPlayerActivity).apply {
        text = label; gravity = Gravity.CENTER; setTextColor(Color.WHITE); textSize = 15f
        background = bg(Color.argb(190, 4, 12, 22), Color.argb(170, 90, 220, 255), 10)
        setOnClickListener { click() }
      }
      val params = FrameLayout.LayoutParams(dp(48), dp(38), buttonGravity).apply { topMargin = dp(8); setMargins(dp(8), dp(8), dp(8), 0) }
      bar.addView(button, params)
    }''',
)

print("Installed pointer-ID virtual gamepad routing for all five emulators.")
