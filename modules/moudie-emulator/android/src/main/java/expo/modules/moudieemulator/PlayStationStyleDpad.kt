package expo.modules.moudieemulator

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** One connected, PlayStation-style D-pad with independent multi-pointer tracking. */
internal class PlayStationStyleDpad(
  context: Context,
  private val upKey: Int,
  private val downKey: Int,
  private val leftKey: Int,
  private val rightKey: Int,
  private val onKey: (Int, Int) -> Unit,
  private val preferences: SharedPreferences? = null,
  private val layoutKey: String? = null,
  private val editing: (() -> Boolean)? = null,
  private val onSelected: ((View) -> Unit)? = null,
) : View(context) {
  private enum class Direction { UP, DOWN, LEFT, RIGHT }
  private val pointers = mutableMapOf<Int, Direction>()
  private val counts = mutableMapOf<Direction, Int>()
  private val density = resources.displayMetrics.density
  private var dragId = -1
  private var downRawX = 0f; private var downRawY = 0f
  private var originX = 0f; private var originY = 0f

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(62, 8, 19, 33); style = Paint.Style.FILL }
  private val pressedFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(125, 65, 210, 255); style = Paint.Style.FILL }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(220, 218, 239, 255); style = Paint.Style.STROKE; strokeWidth = density * 1.8f }
  private val seam = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(80, 218, 239, 255); style = Paint.Style.STROKE; strokeWidth = density }
  private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.FILL; textAlign = Paint.Align.CENTER; textSize = density * 19f }
  private val body = Path(); private val up = Path(); private val down = Path(); private val left = Path(); private val right = Path()

  private val scaler = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
    override fun onScale(detector: ScaleGestureDetector): Boolean {
      if (editing?.invoke() != true) return false
      val next = max(.35f, scaleX * detector.scaleFactor)
      scaleX = next; scaleY = next
      return true
    }
  })

  init { isClickable = true; contentDescription = "Directional pad"; restoreLayout() }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas); rebuild()
    canvas.drawPath(body, fill)
    Direction.entries.forEach { if ((counts[it] ?: 0) > 0) canvas.drawPath(pathFor(it), pressedFill) }
    canvas.drawPath(body, stroke)
    val cx = width / 2f; val cy = height / 2f; val arm = min(width, height) / 3f
    canvas.drawLine(cx - arm / 2f, cy, cx + arm / 2f, cy, seam); canvas.drawLine(cx, cy - arm / 2f, cx, cy + arm / 2f, seam)
    val offset = min(width, height) * .31f
    canvas.drawText("▲", cx, cy - offset + text.textSize * .35f, text); canvas.drawText("▼", cx, cy + offset + text.textSize * .35f, text)
    canvas.drawText("◀", cx - offset, cy + text.textSize * .35f, text); canvas.drawText("▶", cx + offset, cy + text.textSize * .35f, text)
  }

  private fun rebuild() {
    body.reset(); up.reset(); down.reset(); left.reset(); right.reset()
    val w = width.toFloat(); val h = height.toFloat(); if (w <= 0f || h <= 0f) return
    val arm = min(w, h) / 3f; val radius = arm * .22f
    val vertical = RectF(w / 2f - arm / 2f, 0f, w / 2f + arm / 2f, h)
    val horizontal = RectF(0f, h / 2f - arm / 2f, w, h / 2f + arm / 2f)
    body.addRoundRect(vertical, radius, radius, Path.Direction.CW); body.addRoundRect(horizontal, radius, radius, Path.Direction.CW)
    up.addRect(vertical.left, 0f, vertical.right, h / 2f, Path.Direction.CW); down.addRect(vertical.left, h / 2f, vertical.right, h, Path.Direction.CW)
    left.addRect(0f, horizontal.top, w / 2f, horizontal.bottom, Path.Direction.CW); right.addRect(w / 2f, horizontal.top, w, horizontal.bottom, Path.Direction.CW)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (editing?.invoke() == true) return editTouch(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> { val i = event.actionIndex; update(event.getPointerId(i), directionAt(event.getX(i), event.getY(i))) }
      MotionEvent.ACTION_MOVE -> for (i in 0 until event.pointerCount) update(event.getPointerId(i), directionAt(event.getX(i), event.getY(i)))
      MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> release(event.getPointerId(event.actionIndex))
      MotionEvent.ACTION_CANCEL -> releaseAll()
    }
    return true
  }

  private fun editTouch(event: MotionEvent): Boolean {
    scaler.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> { onSelected?.invoke(this); dragId = event.getPointerId(0); downRawX = event.rawX; downRawY = event.rawY; originX = translationX; originY = translationY }
      MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress && dragId >= 0) { val i = event.findPointerIndex(dragId); if (i >= 0) { translationX = originX + event.getRawX(i) - downRawX; translationY = originY + event.getRawY(i) - downRawY } }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { dragId = -1; persistLayout() }
    }
    return true
  }

  private fun update(id: Int, next: Direction?) { val previous = pointers[id]; if (previous == next) return; previous?.let(::decrement); if (next == null) pointers.remove(id) else { pointers[id] = next; increment(next) }; invalidate() }
  private fun release(id: Int) { pointers.remove(id)?.let(::decrement); invalidate() }
  private fun releaseAll() { pointers.keys.toList().forEach(::release); counts.clear(); invalidate() }
  private fun increment(direction: Direction) { val before = counts[direction] ?: 0; counts[direction] = before + 1; if (before == 0) onKey(MotionEvent.ACTION_DOWN, keyFor(direction)) }
  private fun decrement(direction: Direction) { val before = counts[direction] ?: return; if (before <= 1) { counts.remove(direction); onKey(MotionEvent.ACTION_UP, keyFor(direction)) } else counts[direction] = before - 1 }
  private fun keyFor(direction: Direction) = when (direction) { Direction.UP -> upKey; Direction.DOWN -> downKey; Direction.LEFT -> leftKey; Direction.RIGHT -> rightKey }
  private fun pathFor(direction: Direction) = when (direction) { Direction.UP -> up; Direction.DOWN -> down; Direction.LEFT -> left; Direction.RIGHT -> right }
  private fun directionAt(x: Float, y: Float): Direction? { if (width <= 0 || height <= 0) return null; val dx = x - width / 2f; val dy = y - height / 2f; val dead = min(width, height) * .08f; if (abs(dx) < dead && abs(dy) < dead) return null; return if (abs(dx) > abs(dy)) if (dx < 0) Direction.LEFT else Direction.RIGHT else if (dy < 0) Direction.UP else Direction.DOWN }
  private fun restoreLayout() { val prefs = preferences ?: return; val key = layoutKey ?: return; post { translationX = prefs.getFloat("$key.x", 0f); translationY = prefs.getFloat("$key.y", 0f); val scale = prefs.getFloat("$key.scale", 1f); scaleX = scale; scaleY = scale } }
  private fun persistLayout() { val prefs = preferences ?: return; val key = layoutKey ?: return; prefs.edit().putFloat("$key.x", translationX).putFloat("$key.y", translationY).putFloat("$key.scale", scaleX).apply() }
  override fun onDetachedFromWindow() { releaseAll(); super.onDetachedFromWindow() }
}
