package com.app.moudienetplay

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  private val startupHandler = Handler(Looper.getMainLooper())
  private var startupOverlay: View? = null
  private var startupStatus: TextView? = null
  private val reactRootProbe = object : Runnable {
    override fun run() {
      val overlay = startupOverlay ?: return
      val content = findViewById<ViewGroup>(android.R.id.content)
      if (hasMountedReactContent(content)) {
        markReactContentReady()
        return
      }
      // Keep the status layer visible only while the actual React root has not
      // mounted. It no longer depends on the custom emulator module.
      if (overlay.parent != null) startupHandler.postDelayed(this, 120L)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Do not install Expo's native splash gate here. Its pre-draw listener can
    // keep Android 12+ on the launcher logo when React Native initialization
    // stalls on a device. The regular app theme lets Android hand off to the
    // activity immediately, so a failure is observable instead of masked by a
    // permanently retained system splash.
    super.onCreate(null)
    installNativeStartupOverlay()
  }

  /** Releases the native status layer after a ReactRootView has mounted. */
  fun markReactContentReady() {
    runOnUiThread {
      startupHandler.removeCallbacksAndMessages(null)
      val overlay = startupOverlay ?: return@runOnUiThread
      startupOverlay = null
      overlay.animate().alpha(0f).setDuration(180L).withEndAction {
        (overlay.parent as? ViewGroup)?.removeView(overlay)
      }.start()
    }
  }

  private fun installNativeStartupOverlay() {
    val overlay = FrameLayout(this).apply {
      setBackgroundColor(Color.rgb(9, 8, 23))
      alpha = 1f
      isClickable = true
    }
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
    }
    val icon = ImageView(this).apply {
      setImageResource(R.mipmap.ic_launcher)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(28).toFloat()
        setColor(Color.rgb(23, 20, 71))
        setStroke(dp(1), Color.rgb(85, 232, 255))
      }
      setPadding(dp(12), dp(12), dp(12), dp(12))
    }
    content.addView(icon, LinearLayout.LayoutParams(dp(112), dp(112)))
    content.addView(TextView(this).apply {
      text = "MOUDIE"
      setTextColor(Color.rgb(225, 250, 255))
      textSize = 25f
      gravity = Gravity.CENTER
      letterSpacing = .14f
      setPadding(0, dp(20), 0, 0)
    })
    startupStatus = TextView(this).apply {
      text = "STARTING…"
      setTextColor(Color.rgb(127, 225, 255))
      textSize = 11f
      gravity = Gravity.CENTER
      letterSpacing = .12f
      setPadding(0, dp(8), 0, 0)
    }
    content.addView(startupStatus)
    overlay.addView(content, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER,
    ))
    overlay.setOnClickListener { startupStatus?.text = "WAITING FOR APP…" }
    addContentView(overlay, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    startupOverlay = overlay
    startupHandler.post(reactRootProbe)
    startupHandler.postDelayed({
      if (startupOverlay != null) startupStatus?.text = "WAITING FOR APP…"
    }, 3_500L)
  }

  private fun hasMountedReactContent(view: View?): Boolean {
    if (view == null) return false
    val isReactRoot = view.javaClass.name.contains("ReactRootView")
    if (isReactRoot && view.width > 0 && view.height > 0 && view is ViewGroup && view.childCount > 0) return true
    return (view as? ViewGroup)?.let { group ->
      (0 until group.childCount).any { index -> hasMountedReactContent(group.getChildAt(index)) }
    } ?: false
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  override fun onDestroy() {
    startupHandler.removeCallbacksAndMessages(null)
    startupOverlay = null
    startupStatus = null
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
