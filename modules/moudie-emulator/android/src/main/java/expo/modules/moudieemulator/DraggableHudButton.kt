package expo.modules.moudieemulator

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.max

/**
 * A compact in-game HUD control. It can be operated normally during a match and
 * moved or pinched to resize only while the native player is in settings mode.
 */
internal class DraggableHudButton(
  context: Context,
  private val preferences: SharedPreferences,
  private val systemId: String,
  private val controlId: String,
  label: String,
  private val editing: () -> Boolean,
  private val action: () -> Unit,
  private val selected: ((View, String) -> Unit)? = null,
) : TextView(context) {
  private var downX = 0f
  private var downY = 0f
  private var originX = 0f
  private var originY = 0f
  private var moved = false
  private val density = resources.displayMetrics.density
  private val scaler = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
    override fun onScale(detector: ScaleGestureDetector): Boolean {
      if (!editing()) return false
      val next = (scaleX * detector.scaleFactor).coerceIn(.65f, 1.75f)
      scaleX = next
      scaleY = next
      return true
    }
  })

  init {
    text = label
    textSize = if (label.length <= 3) 10f else 8.5f
    gravity = Gravity.CENTER
    setTextColor(Color.WHITE)
    setPadding(dp(7), 0, dp(7), 0)
    isClickable = true
    background = GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(10).toFloat()
      setColor(Color.argb(210, 8, 19, 33))
      setStroke(dp(1), Color.argb(205, 171, 222, 255))
    }
    setOnTouchListener { _, event -> handleTouch(event) }
  }

  fun layoutParams(gravity: Int, right: Int = 0, top: Int = 0): FrameLayout.LayoutParams = FrameLayout.LayoutParams(
    FrameLayout.LayoutParams.WRAP_CONTENT,
    dp(38),
    gravity,
  ).apply {
    rightMargin = dp(right)
    topMargin = dp(top)
  }

  fun restore() {
    post {
      translationX = preferences.getFloat("$storageKey.x", 0f)
      translationY = preferences.getFloat("$storageKey.y", 0f)
      val scale = preferences.getFloat("$storageKey.scale", 1f)
      scaleX = scale
      scaleY = scale
    }
  }

  private val storageKey: String
    get() {
      val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
      return "$systemId.$orientation.hud.$controlId"
    }

  private fun handleTouch(event: MotionEvent): Boolean {
    scaler.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.rawX
        downY = event.rawY
        originX = translationX
        originY = translationY
        moved = false
        if (editing()) selected?.invoke(this, controlId)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (editing() && !scaler.isInProgress) {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          moved = max(abs(dx), abs(dy)) > dp(4)
          translationX = originX + dx
          translationY = originY + dy
        }
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (editing()) persist()
        else if (!moved) performClick()
        return true
      }
    }
    return true
  }

  override fun performClick(): Boolean {
    super.performClick()
    action()
    return true
  }

  private fun persist() {
    preferences.edit()
      .putFloat("$storageKey.x", translationX)
      .putFloat("$storageKey.y", translationY)
      .putFloat("$storageKey.scale", scaleX)
      .apply()
  }

  private fun dp(value: Int): Int = (value * density).toInt()
}
