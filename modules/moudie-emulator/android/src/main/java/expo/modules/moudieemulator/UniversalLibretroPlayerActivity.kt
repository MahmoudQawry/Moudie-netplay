package expo.modules.moudieemulator

import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.view.Choreographer
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig
import java.io.File
import kotlinx.coroutines.launch

/** Native Libretro player used by PSP, Sega and Arcade.
 * Touch controls deliberately keep independent key-down state so two or more
 * fingers behave like a real physical controller rather than a sequence of taps.
 */
class UniversalLibretroPlayerActivity : ComponentActivity() {
  companion object {
    const val EXTRA_SYSTEM = "expo.modules.moudieemulator.SYSTEM"
    const val EXTRA_CORE_PATH = "expo.modules.moudieemulator.CORE_PATH"
    const val EXTRA_GAME_PATH = "expo.modules.moudieemulator.GAME_PATH"
    const val EXTRA_GAME_NAME = "expo.modules.moudieemulator.GAME_NAME"
    const val EXTRA_PLAYER_ORIENTATION = "expo.modules.moudieemulator.PLAYER_ORIENTATION"
    const val EXTRA_PLAYER_ASPECT_RATIO = "expo.modules.moudieemulator.PLAYER_ASPECT_RATIO"
    const val EXTRA_PLAYER_SETTINGS_MODE = "expo.modules.moudieemulator.PLAYER_SETTINGS_MODE"
    const val EXTRA_NETPLAY_SERVER_URL = "expo.modules.moudieemulator.NETPLAY_SERVER_URL"
    const val EXTRA_NETPLAY_ROOM_ID = "expo.modules.moudieemulator.NETPLAY_ROOM_ID"
    const val EXTRA_NETPLAY_MEMBER_ID = "expo.modules.moudieemulator.NETPLAY_MEMBER_ID"
    const val EXTRA_NETPLAY_MEMBER_TOKEN = "expo.modules.moudieemulator.NETPLAY_MEMBER_TOKEN"
    const val EXTRA_NETPLAY_FINGERPRINT = "expo.modules.moudieemulator.NETPLAY_FINGERPRINT"
    const val EXTRA_NETPLAY_CORE_VERSION = "expo.modules.moudieemulator.NETPLAY_CORE_VERSION"
    const val EXTRA_NETPLAY_PLAYER = "expo.modules.moudieemulator.NETPLAY_PLAYER"
  }

  private lateinit var retroView: GLRetroView
  private lateinit var root: FrameLayout
  private lateinit var gameFrame: FrameLayout
  private lateinit var definition: NativeCoreCatalog.Definition
  private lateinit var preferences: android.content.SharedPreferences
  private var aspectMode = "fit"
  private lateinit var metricPill: TextView
  private var frameWindowStartedAt = 0L
  private var framesInWindow = 0
  private val pressedTouchKeys = linkedSetOf<Int>()

  private val frameMeter = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (frameWindowStartedAt == 0L) frameWindowStartedAt = frameTimeNanos
      framesInWindow += 1
      val elapsed = frameTimeNanos - frameWindowStartedAt
      if (elapsed >= 1_000_000_000L) {
        val fps = (framesInWindow * 1_000_000_000L / elapsed).coerceAtMost(120L)
        updateMetricPill(fps)
        frameWindowStartedAt = frameTimeNanos
        framesInWindow = 0
      }
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestedOrientation = when (intent.getStringExtra(EXTRA_PLAYER_ORIENTATION)) {
      "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      else -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    @Suppress("DEPRECATION") window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE

    definition = runCatching { NativeCoreCatalog.forSystem(intent.getStringExtra(EXTRA_SYSTEM).orEmpty()) }.getOrElse { showError("The requested emulator system is not supported."); return }
    val gameFile = File(intent.getStringExtra(EXTRA_GAME_PATH).orEmpty())
    val coreFile = File(intent.getStringExtra(EXTRA_CORE_PATH).orEmpty())
    if (!gameFile.isFile || !gameFile.canRead()) { showError("Could not read the game file. Choose it again from the library."); return }
    if (!coreFile.isFile || coreFile.length() == 0L) { showError("Could not load ${definition.coreName}. Reinstall the complete APK."); return }

    preferences = getSharedPreferences("moudie-controller-layouts", Context.MODE_PRIVATE)
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)?.takeIf { it in setOf("fit", "4:3", "16:9") } ?: preferences.getString("${definition.system}.aspect", "fit") ?: "fit"
    val savesDirectory = File(filesDir, "moudie-${definition.system}/saves").apply { mkdirs() }
    val systemDirectory = NativeCoreCatalog.prepareSystemDirectory(this, definition, File(filesDir, definition.systemDirectory).apply { mkdirs() })
    val gameData = GLRetroViewData(this).apply { coreFilePath = coreFile.absolutePath; gameFilePath = gameFile.absolutePath; this.systemDirectory = systemDirectory.absolutePath; this.savesDirectory = savesDirectory.absolutePath; shader = ShaderConfig.Sharp; preferLowLatencyAudio = true; rumbleEventsEnabled = true }
    retroView = GLRetroView(this, gameData).apply { renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY }
    lifecycle.addObserver(retroView)
    lifecycleScope.launch { retroView.getGLRetroErrors().collect { showToast(errorMessage(it, gameFile.name)) } }

    root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }
    gameFrame = FrameLayout(this).apply { addView(retroView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)) }
    root.addView(gameFrame, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
    metricPill = createMetricPill()
    root.addView(metricPill, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(32), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(14) })
    addController()
    setContentView(root)
    root.post { applyAspectRatio() }
  }

  override fun onResume() { super.onResume(); Choreographer.getInstance().postFrameCallback(frameMeter) }
  override fun onPause() { Choreographer.getInstance().removeFrameCallback(frameMeter); releaseAllTouchKeys(); super.onPause() }
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean { if (::retroView.isInitialized) sendLocalKey(KeyEvent.ACTION_DOWN, keyCode); return super.onKeyDown(keyCode, event) }
  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean { if (::retroView.isInitialized) sendLocalKey(KeyEvent.ACTION_UP, keyCode); return super.onKeyUp(keyCode, event) }
  override fun onGenericMotionEvent(event: MotionEvent?): Boolean { if (event != null && ::retroView.isInitialized) { retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, event.getAxisValue(MotionEvent.AXIS_HAT_X), event.getAxisValue(MotionEvent.AXIS_HAT_Y), 0); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, event.getAxisValue(MotionEvent.AXIS_X), event.getAxisValue(MotionEvent.AXIS_Y), 0); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, event.getAxisValue(MotionEvent.AXIS_Z), event.getAxisValue(MotionEvent.AXIS_RZ), 0) }; return super.onGenericMotionEvent(event) }

  private fun sendLocalKey(action: Int, keyCode: Int) { retroView.sendKeyEvent(action, keyCode, 0) }
  private fun pressTouchKey(keyCode: Int) { if (pressedTouchKeys.add(keyCode)) sendLocalKey(KeyEvent.ACTION_DOWN, keyCode) }
  private fun releaseTouchKey(keyCode: Int) { if (pressedTouchKeys.remove(keyCode)) sendLocalKey(KeyEvent.ACTION_UP, keyCode) }
  private fun releaseAllTouchKeys() { pressedTouchKeys.toList().forEach { sendLocalKey(KeyEvent.ACTION_UP, it) }; pressedTouchKeys.clear() }

  private fun addController() {
    val profile = definition.profile
    listOf(profile.directions.up, profile.directions.down, profile.directions.left, profile.directions.right).forEachIndexed { index, control -> addControl(control, Gravity.LEFT or Gravity.BOTTOM, 16 + (index % 2) * 60, 40 + (index / 2) * 64) }
    profile.actionButtons.forEachIndexed { index, control -> addControl(control, Gravity.RIGHT or Gravity.BOTTOM, 16 + (index % 3) * 62, 38 + (index / 3) * 62) }
    profile.shoulderButtons.forEachIndexed { index, control -> addControl(control, if (index % 2 == 0) Gravity.LEFT or Gravity.TOP else Gravity.RIGHT or Gravity.TOP, 16 + (index / 2) * 62, 18) }
    profile.systemButtons.forEachIndexed { index, control -> addControl(control, Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, (index - 1) * 62, 16) }
  }

  private fun addControl(control: EmulatorTouchButton, controlGravity: Int, horizontalOffset: Int, verticalOffset: Int) {
    val direction = control.id in setOf("up", "down", "left", "right")
    val systemButton = control.id in setOf("start", "select")
    val shoulder = control.id in setOf("l", "r", "l1", "r1", "l2", "r2")
    val width = when { systemButton -> dp(70); shoulder -> dp(66); else -> dp(58) }
    val height = when { systemButton -> dp(34); shoulder -> dp(34); else -> dp(58) }
    val button = TextView(this).apply {
      text = control.label; textSize = if (systemButton || shoulder) 9f else 20f; gravity = Gravity.CENTER
      setTextColor(Color.argb(225, 245, 248, 255))
      background = roundedBackground(Color.argb(86, 8, 19, 33), Color.argb(210, 198, 230, 255), when { direction -> 10; systemButton || shoulder -> 9; else -> 40 })
      isClickable = true
      setOnTouchListener { _, event -> when (event.actionMasked) { MotionEvent.ACTION_DOWN -> pressTouchKey(control.keyCode); MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> releaseTouchKey(control.keyCode) }; true }
    }
    val params = FrameLayout.LayoutParams(width, height, controlGravity).apply {
      when { controlGravity and Gravity.RIGHT == Gravity.RIGHT -> rightMargin = dp(horizontalOffset); controlGravity and Gravity.LEFT == Gravity.LEFT -> leftMargin = dp(horizontalOffset) }
      if (controlGravity and Gravity.TOP == Gravity.TOP) topMargin = dp(verticalOffset) else bottomMargin = dp(verticalOffset)
    }
    root.addView(button, params)
    if (controlGravity and Gravity.CENTER_HORIZONTAL == Gravity.CENTER_HORIZONTAL) button.translationX = dp(horizontalOffset).toFloat()
  }

  private fun createMetricPill(): TextView = TextView(this).apply { text = "FPS —   •   LOCAL"; textSize = 10f; gravity = Gravity.CENTER; setTextColor(Color.rgb(194, 243, 255)); setPadding(dp(12), 0, dp(12), 0); background = roundedBackground(Color.argb(130, 2, 12, 24), Color.argb(125, 21, 178, 238), 16) }
  private fun updateMetricPill(fps: Long?) { if (::metricPill.isInitialized) metricPill.text = "FPS ${fps ?: "—"}   •   LOCAL" }
  private fun applyAspectRatio() { if (aspectMode == "fit" || root.width <= 0 || root.height <= 0) return; val ratio = if (aspectMode == "4:3") 4f / 3f else 16f / 9f; var width = root.width; var height = (width / ratio).toInt(); if (height > root.height) { height = root.height; width = (height * ratio).toInt() }; gameFrame.layoutParams = FrameLayout.LayoutParams(width, height, Gravity.CENTER) }
  private fun errorMessage(error: Int, fileName: String): String = when (error) { GLRetroView.ERROR_LOAD_LIBRARY -> "Could not load ${definition.coreName}. Reinstall the complete APK."; GLRetroView.ERROR_LOAD_GAME -> "Could not open $fileName. Check that it is compatible with ${definition.title}."; GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "This device does not support the graphics configuration required by this emulator."; else -> "${definition.coreName} stopped while starting the game (code $error)." }
  private fun showError(message: String) { setContentView(TextView(this).apply { text = message; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(3, 8, 18)); textSize = 16f; setPadding(dp(28), dp(28), dp(28), dp(28)); setOnClickListener { finish() } }) }
  private fun showToast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
  private fun roundedBackground(fill: Int, stroke: Int, radius: Int) = GradientDrawable().apply { shape = GradientDrawable.RECTANGLE; cornerRadius = dp(radius).toFloat(); setColor(fill); setStroke(dp(1), stroke) }
}
