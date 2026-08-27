package expo.modules.moudieemulator

import android.app.AlertDialog
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
import android.view.ScaleGestureDetector
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
import kotlin.math.max

/** Native Libretro player used by PSP, Sega and Arcade.
 * Keeps physical-controller style multi-touch while preserving editable controls and screen.
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
  private lateinit var root: MultiTouchControlFrame
  private lateinit var gameFrame: FrameLayout
  private lateinit var definition: NativeCoreCatalog.Definition
  private lateinit var preferences: android.content.SharedPreferences
  private lateinit var metricPill: TextView
  private var aspectMode = "fit"
  private var editMode = false
  private var selected: Pair<View, String>? = null
  private val controls = mutableListOf<Pair<View, String>>()
  private val pressedTouchKeys = linkedSetOf<Int>()
  private var frameStarted = 0L
  private var frameCount = 0

  private val frameMeter = object : Choreographer.FrameCallback {
    override fun doFrame(t: Long) {
      if (frameStarted == 0L) frameStarted = t
      frameCount++
      val elapsed = t - frameStarted
      if (elapsed >= 1_000_000_000L) {
        metricPill.text = "FPS ${(frameCount * 1_000_000_000L / elapsed).coerceAtMost(120L)}   •   LOCAL"
        frameStarted = t; frameCount = 0
      }
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    requestedOrientation = when (intent.getStringExtra(EXTRA_PLAYER_ORIENTATION)) {
      "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      else -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    @Suppress("DEPRECATION") window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE

    definition = runCatching { NativeCoreCatalog.forSystem(intent.getStringExtra(EXTRA_SYSTEM).orEmpty()) }.getOrElse { showError("The requested emulator system is not supported."); return }
    val game = File(intent.getStringExtra(EXTRA_GAME_PATH).orEmpty())
    val core = File(intent.getStringExtra(EXTRA_CORE_PATH).orEmpty())
    if (!game.isFile || !game.canRead()) { showError("Could not read the game file. Choose it again from the library."); return }
    if (!core.isFile || core.length() == 0L) { showError("Could not load ${definition.coreName}. Reinstall the complete APK."); return }

    preferences = getSharedPreferences("moudie-controller-layouts", Context.MODE_PRIVATE)
    editMode = intent.getBooleanExtra(EXTRA_PLAYER_SETTINGS_MODE, false)
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)?.takeIf { it in setOf("fit", "4:3", "16:9") } ?: preferences.getString("${definition.system}.aspect", "fit") ?: "fit"
    val saves = File(filesDir, "moudie-${definition.system}/saves").apply { mkdirs() }
    val system = NativeCoreCatalog.prepareSystemDirectory(this, definition, File(filesDir, definition.systemDirectory).apply { mkdirs() })
    retroView = GLRetroView(this, GLRetroViewData(this).apply {
      coreFilePath = core.absolutePath; gameFilePath = game.absolutePath
      systemDirectory = system.absolutePath; savesDirectory = saves.absolutePath
      shader = ShaderConfig.Sharp; preferLowLatencyAudio = true; rumbleEventsEnabled = true
    }).apply { renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY }
    lifecycle.addObserver(retroView)
    lifecycleScope.launch { retroView.getGLRetroErrors().collect { showToast(errorMessage(it, game.name)) } }

    root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }
    gameFrame = FrameLayout(this).apply { addView(retroView, FrameLayout.LayoutParams(-1, -1)) }
    root.addView(gameFrame, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
    metricPill = metric()
    root.addView(metricPill, FrameLayout.LayoutParams(-2, dp(32), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(14) })
    addController()
    addMenu()
    setContentView(root)
    root.post { applyAspectRatio(); restoreScreen(); enableScreenEditor(); if (editMode) showEditorBar() }
  }

  override fun onResume() { super.onResume(); Choreographer.getInstance().postFrameCallback(frameMeter) }
  override fun onPause() { Choreographer.getInstance().removeFrameCallback(frameMeter); releaseAll(); super.onPause() }
  override fun onKeyDown(k: Int, e: KeyEvent): Boolean { retroView.sendKeyEvent(KeyEvent.ACTION_DOWN, k, 0); return super.onKeyDown(k, e) }
  override fun onKeyUp(k: Int, e: KeyEvent): Boolean { retroView.sendKeyEvent(KeyEvent.ACTION_UP, k, 0); return super.onKeyUp(k, e) }
  override fun onGenericMotionEvent(e: MotionEvent?): Boolean { if (e != null) { retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), 0); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), 0); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ), 0) }; return super.onGenericMotionEvent(e) }

  private fun press(k: Int) { if (pressedTouchKeys.add(k)) retroView.sendKeyEvent(KeyEvent.ACTION_DOWN, k, 0) }
  private fun release(k: Int) { if (pressedTouchKeys.remove(k)) retroView.sendKeyEvent(KeyEvent.ACTION_UP, k, 0) }
  private fun releaseAll() { pressedTouchKeys.toList().forEach { retroView.sendKeyEvent(KeyEvent.ACTION_UP, it, 0) }; pressedTouchKeys.clear() }

  private fun addController() {
    val p = definition.profile
    val dpad = PlayStationStyleDpad(
      context = this,
      upKey = p.directions.up.keyCode, downKey = p.directions.down.keyCode,
      leftKey = p.directions.left.keyCode, rightKey = p.directions.right.keyCode,
      onKey = { action, key -> if (action == MotionEvent.ACTION_DOWN) press(key) else release(key) },
      preferences = preferences, layoutKey = key("dpad"), editing = { editMode },
      onSelected = { view -> selected = view to "dpad" },
    )
    root.addView(dpad, FrameLayout.LayoutParams(dp(174), dp(174), Gravity.LEFT or Gravity.BOTTOM).apply { leftMargin = dp(16); bottomMargin = dp(52) })
    controls += dpad to "dpad"
    val face = arrayOf(74 to 168, 132 to 110, 16 to 110, 74 to 52)
    p.actionButtons.forEachIndexed { i, c -> addControl(c, Gravity.RIGHT or Gravity.BOTTOM, face.getOrElse(i) { 74 to 52 }.first, face.getOrElse(i) { 74 to 52 }.second) }
    p.shoulderButtons.forEachIndexed { i, c -> addControl(c, if (i % 2 == 0) Gravity.LEFT or Gravity.TOP else Gravity.RIGHT or Gravity.TOP, 16 + (i / 2) * 72, 18) }
    p.systemButtons.forEachIndexed { i, c -> addControl(c, Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, i * 84 - 42, 24) }
  }

  private fun addControl(c: EmulatorTouchButton, gravity: Int, x: Int, y: Int) {
    val direction = c.id in setOf("up", "down", "left", "right")
    val utility = c.id in setOf("start", "select", "l", "r", "l1", "r1", "l2", "r2")
    val w = if (utility) dp(72) else dp(58); val h = if (utility) dp(36) else dp(58)
    val v = TextView(this).apply {
      text = c.label; textSize = if (utility) 9f else 20f; this.gravity = Gravity.CENTER
      setTextColor(Color.WHITE); background = bg(Color.argb(86, 8, 19, 33), Color.argb(210, 198, 230, 255), if (direction) 10 else if (utility) 9 else 40)
      isClickable = true
    }
    interact(v, c.id, c.keyCode)
    val lp = FrameLayout.LayoutParams(w, h, gravity).apply {
      when { gravity and Gravity.RIGHT == Gravity.RIGHT -> rightMargin = dp(x); gravity and Gravity.LEFT == Gravity.LEFT -> leftMargin = dp(x) }
      if (gravity and Gravity.TOP == Gravity.TOP) topMargin = dp(y) else bottomMargin = dp(y)
    }
    root.addView(v, lp); if (gravity and Gravity.CENTER_HORIZONTAL == Gravity.CENTER_HORIZONTAL) v.translationX = dp(x).toFloat()
    controls += v to c.id
  }

  private fun interact(v: View, id: String, key: Int) {
    var dx = 0f; var dy = 0f; var ox = 0f; var oy = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() { override fun onScale(d: ScaleGestureDetector): Boolean { if (!editMode) return false; val s = max(.35f, v.scaleX * d.scaleFactor); v.scaleX = s; v.scaleY = s; return true } })
    v.post { restoreControl(v, id) }
    v.setOnTouchListener { _, e ->
      scaler.onTouchEvent(e)
      if (editMode) {
        when (e.actionMasked) {
          MotionEvent.ACTION_DOWN -> { selected = v to id; dx = e.rawX; dy = e.rawY; ox = v.translationX; oy = v.translationY }
          MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) { v.translationX = ox + e.rawX - dx; v.translationY = oy + e.rawY - dy }
          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> saveControl(v, id)
        }; return@setOnTouchListener true
      }
      when (e.actionMasked) { MotionEvent.ACTION_DOWN -> press(key); MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> release(key) }; true
    }
  }

  private fun addMenu() {
    val b = TextView(this).apply { text = "☰"; textSize = 24f; gravity = Gravity.CENTER; setTextColor(Color.WHITE); background = bg(Color.argb(160, 4, 12, 22), Color.argb(150, 130, 210, 255), 12); setOnClickListener { menu() } }
    root.addView(b, FrameLayout.LayoutParams(dp(46), dp(46), Gravity.RIGHT or Gravity.TOP).apply { topMargin = dp(14); rightMargin = dp(14) })
  }
  private fun menu() { AlertDialog.Builder(this).setItems(arrayOf(if (editMode) "FINISH EDITING" else "EDIT CONTROLS & SCREEN", "RESET CONTROLS", "EXIT GAME")) { _, i -> when (i) { 0 -> toggleEdit(); 1 -> reset(); else -> finish() } }.show() }

  private fun showEditorBar() {
    if (!editMode || root.findViewWithTag<View>("editor") != null) return
    val bar = FrameLayout(this).apply { tag = "editor" }
    fun b(label: String, buttonGravity: Int, click: () -> Unit) {
      val button = TextView(this@UniversalLibretroPlayerActivity).apply {
        text = label; gravity = Gravity.CENTER; setTextColor(Color.WHITE); textSize = 15f
        background = bg(Color.argb(190, 4, 12, 22), Color.argb(170, 90, 220, 255), 10)
        setOnClickListener { click() }
      }
      val params = FrameLayout.LayoutParams(dp(48), dp(38), buttonGravity).apply { topMargin = dp(8); setMargins(dp(8), dp(8), dp(8), 0) }
      bar.addView(button, params)
    }
    b("✓", Gravity.LEFT or Gravity.TOP) { toggleEdit() }; b("−", Gravity.CENTER_HORIZONTAL or Gravity.TOP) { resize(-.1f) }; b("+", Gravity.RIGHT or Gravity.TOP) { resize(.1f) }
    root.addView(bar, FrameLayout.LayoutParams(-1, dp(56), Gravity.TOP))
  }
  private fun toggleEdit() { editMode = !editMode; selected = null; if (editMode) { showEditorBar(); showToast("Edit mode: drag controls or screen, pinch to resize, −/+ for precise size.") } else { root.findViewWithTag<View>("editor")?.let { root.removeView(it) }; showToast("Layout saved for this orientation.") } }
  private fun resize(d: Float) { val s = selected ?: run { showToast("Tap a control first. The game screen can be resized with pinch."); return }; val n = max(.35f, s.first.scaleX + d); s.first.scaleX = n; s.first.scaleY = n; saveControl(s.first, s.second) }

  private fun orientation(): String = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
  private fun key(id: String) = "${definition.system}.${orientation()}.$id"
  private fun saveControl(v: View, id: String) { val k = key(id); preferences.edit().putFloat("$k.x", v.translationX).putFloat("$k.y", v.translationY).putFloat("$k.s", v.scaleX).apply() }
  private fun restoreControl(v: View, id: String) { val k = key(id); v.translationX = preferences.getFloat("$k.x", 0f); v.translationY = preferences.getFloat("$k.y", 0f); val s = preferences.getFloat("$k.s", 1f); v.scaleX = s; v.scaleY = s }
  private fun screenKey() = key("screen")
  private fun saveScreen() { val k = screenKey(); preferences.edit().putFloat("$k.x", gameFrame.translationX).putFloat("$k.y", gameFrame.translationY).putFloat("$k.s", gameFrame.scaleX).apply() }
  private fun restoreScreen() { val k = screenKey(); gameFrame.translationX = preferences.getFloat("$k.x", 0f); gameFrame.translationY = preferences.getFloat("$k.y", 0f); val s = preferences.getFloat("$k.s", 1f); gameFrame.scaleX = s; gameFrame.scaleY = s }
  private fun reset() { val prefix = "${definition.system}.${orientation()}."; preferences.edit().also { e -> preferences.all.keys.filter { it.startsWith(prefix) }.forEach { e.remove(it) }; e.apply() }; controls.forEach { it.first.translationX = 0f; it.first.translationY = 0f; it.first.scaleX = 1f; it.first.scaleY = 1f }; gameFrame.translationX = 0f; gameFrame.translationY = 0f; gameFrame.scaleX = 1f; gameFrame.scaleY = 1f; showToast("Controls and screen reset.") }

  private fun enableScreenEditor() {
    var dx = 0f; var dy = 0f; var ox = 0f; var oy = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() { override fun onScale(d: ScaleGestureDetector): Boolean { if (!editMode) return false; val s = max(.35f, gameFrame.scaleX * d.scaleFactor); gameFrame.scaleX = s; gameFrame.scaleY = s; return true } })
    retroView.setOnTouchListener { _, e -> if (!editMode) return@setOnTouchListener false; scaler.onTouchEvent(e); when (e.actionMasked) { MotionEvent.ACTION_DOWN -> { selected = null; dx = e.rawX; dy = e.rawY; ox = gameFrame.translationX; oy = gameFrame.translationY }; MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) { gameFrame.translationX = ox + e.rawX - dx; gameFrame.translationY = oy + e.rawY - dy }; MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> saveScreen() }; true }
  }

  private fun metric() = TextView(this).apply { text = "FPS —   •   LOCAL"; textSize = 10f; gravity = Gravity.CENTER; setTextColor(Color.rgb(194, 243, 255)); setPadding(dp(12), 0, dp(12), 0); background = bg(Color.argb(130, 2, 12, 24), Color.argb(125, 21, 178, 238), 16) }
  private fun applyAspectRatio() { if (aspectMode == "fit" || root.width <= 0 || root.height <= 0) return; val ratio = if (aspectMode == "4:3") 4f / 3f else 16f / 9f; var w = root.width; var h = (w / ratio).toInt(); if (h > root.height) { h = root.height; w = (h * ratio).toInt() }; gameFrame.layoutParams = FrameLayout.LayoutParams(w, h, Gravity.CENTER) }
  private fun errorMessage(e: Int, name: String) = when (e) { GLRetroView.ERROR_LOAD_LIBRARY -> "Could not load ${definition.coreName}. Reinstall the complete APK."; GLRetroView.ERROR_LOAD_GAME -> "Could not open $name. Check that it is compatible with ${definition.title}."; GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "This device does not support the graphics configuration required by this emulator."; else -> "${definition.coreName} stopped while starting the game (code $e)." }
  private fun showError(m: String) { setContentView(TextView(this).apply { text = m; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(3, 8, 18)); textSize = 16f; setPadding(dp(28), dp(28), dp(28), dp(28)); setOnClickListener { finish() } }) }
  private fun showToast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
  private fun bg(fill: Int, stroke: Int, radius: Int) = GradientDrawable().apply { shape = GradientDrawable.RECTANGLE; cornerRadius = dp(radius).toFloat(); setColor(fill); setStroke(dp(1), stroke) }
}
