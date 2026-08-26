package expo.modules.moudieemulator

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.abs
import kotlin.math.max

/**
 * One connected, PlayStation-style D-pad touch surface.
 *
 * A single surface owns all four directions so Android delivers the complete
 * pointer stream here. Pointer IDs are tracked independently, which means a
 * second finger cannot steal or cancel the first finger's direction. This is
 * intentionally different from four unrelated click buttons: it behaves like
 * one physical D-pad while preserving simultaneous direction/button input.
 */
internal class PlayStationStyleDpad(
  context: Context,
  private val upKey: Int,
  private val downKey: Int,
  private val leftKey: Int,
  private val rightKey: Int,
  private val onKey: (action: Int, keyCode: Int) -> Unit,
) : View(context) {
  private enum class Direction { UP, DOWN, LEFT, RIGHT }

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val pointerDirections = mutableMapOf<Int, Direction>()
  private val activeCounts = mutableMapOf<Direction, Int>()
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(78, 8, 19, 33); style = Paint.Style.FILL }
  private val pressedFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(118, 65, 210, 255); style = Paint.Style.FILL }
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(210, 218, 239, 255); style = Paint.Style.STROKE; strokeWidth = resources.displayMetrics.density * 2f }
  private val arrow = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.FILL; textAlign = Paint.Align.CENTER; textSize = resources.displayMetrics.density * 18f }
  private val bodyPath = Path()
  private val upPath = Path()
  private val downPath = Path()
  private val leftPath = Path()
  private val rightPath = Path()

  init {
    isClickable = true
    isFocusable = true
    contentDescription = "Directional pad"
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    rebuildPaths()
    canvas.drawPath(bodyPath, fill)
    Direction.entries.forEach { direction ->
      if ((activeCounts[direction] ?: 0) > 0) canvas.drawPath(pathFor(direction), pressedFill)
    }
    canvas.drawPath(bodyPath, stroke)
    val cx = width / 2f
    val cy = height / 2f
    val offset = minOf(width, height) * .31f
    canvas.drawText("▲", cx, cy - offset + arrow.textSize * .35f, arrow)
    canvas.drawText("▼", cx, cy + offset + arrow.textSize * .35f, arrow)
    canvas.drawText("◀", cx - offset, cy + arrow.textSize * .35f, arrow)
    canvas.drawText("▶", cx + offset, cy + arrow.textSize * .35f, arrow)
  }

  private fun rebuildPaths() {
    bodyPath.reset(); upPath.reset(); downPath.reset(); leftPath.reset(); rightPath.reset()
    val w = width.toFloat(); val h = height.toFloat(); if (w <= 0f || h <= 0f) return
    val arm = minOf(w, h) / 3f
    val radius = arm * .22f
    val vertical = RectF(w / 2f - arm / 2f, 0f, w / 2f + arm / 2f, h)
    val horizontal = RectF(0f, h / 2f - arm / 2f, w, h / 2f + arm / 2f)
    bodyPath.addRoundRect(vertical, radius, radius, Path.Direction.CW)
    bodyPath.addRoundRect(horizontal, radius, radius, Path.Direction.CW)
    bodyPath.op(Path(bodyPath), Path(), Path.Op.UNION)
    upPath.addRect(vertical.left, 0f, vertical.right, h / 2f, Path.Direction.CW)
    downPath.addRect(vertical.left, h / 2f, vertical.right, h, Path.Direction.CW)
    leftPath.addRect(0f, horizontal.top, w / 2f, horizontal.bottom, Path.Direction.CW)
    rightPath.addRect(w / 2f, horizontal.top, w, horizontal.bottom, Path.Direction.CW)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
        val index = event.actionIndex
        val pointerId = event.getPointerId(index)
        updatePointer(pointerId, directionAt(event.getX(index), event.getY(index)))
      }
      MotionEvent.ACTION_MOVE -> {
        for (index in 0 until event.pointerCount) {
          val pointerId = event.getPointerId(index)
          updatePointer(pointerId, directionAt(event.getX(index), event.getY(index)))
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
        releasePointer(event.getPointerId(event.actionIndex))
      }
      MotionEvent.ACTION_CANCEL -> releaseAll()
    }
    return true
  }

  private fun updatePointer(pointerId: Int, next: Direction?) {
    val previous = pointerDirections[pointerId]
    if (previous == next) return
    if (previous != null) decrement(previous)
    if (next != null) {
      pointerDirections[pointerId] = next
      increment(next)
    } else pointerDirections.remove(pointerId)
    invalidate()
  }

  private fun releasePointer(pointerId: Int) {
    pointerDirections.remove(pointerId)?.let(::decrement)
    invalidate()
  }

  private fun releaseAll() {
    pointerDirections.keys.toList().forEach(::releasePointer)
    activeCounts.clear()
    invalidate()
  }

  private fun increment(direction: Direction) {
    val before = activeCounts[direction] ?: 0
    activeCounts[direction] = before + 1
    if (before == 0) onKey(MotionEvent.ACTION_DOWN, keyFor(direction))
  }

  private fun decrement(direction: Direction) {
    val before = activeCounts[direction] ?: return
    if (before <= 1) {
      activeCounts.remove(direction)
      onKey(MotionEvent.ACTION_UP, keyFor(direction))
    } else activeCounts[direction] = before - 1
  }

  private fun keyFor(direction: Direction) = when (direction) {
    Direction.UP -> upKey; Direction.DOWN -> downKey; Direction.LEFT -> leftKey; Direction.RIGHT -> rightKey
  }

  private fun pathFor(direction: Direction) = when (direction) {
    Direction.UP -> upPath; Direction.DOWN -> downPath; Direction.LEFT -> leftPath; Direction.RIGHT -> rightPath
  }

  private fun directionAt(x: Float, y: Float): Direction? {
    if (width <= 0 || height <= 0) return null
    val cx = width / 2f; val cy = height / 2f
    val dx = x - cx; val dy = y - cy
    val dead = minOf(width, height) * .08f
    if (abs(dx) < dead && abs(dy) < dead) return null
    return if (abs(dx) > abs(dy)) if (dx < 0f) Direction.LEFT else Direction.RIGHT else if (dy < 0f) Direction.UP else Direction.DOWN
  }

  override fun onDetachedFromWindow() {
    releaseAll()
    super.onDetachedFromWindow()
  }
}
