package expo.modules.moudieemulator

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
