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
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

/**
 * Native Libretro player used by Sega, PSP and Arcade. It deliberately keeps
 * the game surface black/immersive and stores touch-control layouts separately
 * for each system and device orientation.
 */
class UniversalLibretroPlayerActivity : ComponentActivity() {
  companion object {
    const val EXTRA_SYSTEM = "expo.modules.moudieemulator.SYSTEM"
    const val EXTRA_CORE_PATH = "expo.modules.moudieemulator.CORE_PATH"
    const val EXTRA_GAME_PATH = "expo.modules.moudieemulator.GAME_PATH"
    const val EXTRA_GAME_NAME = "expo.modules.moudieemulator.GAME_NAME"
    const val EXTRA_PLAYER_ORIENTATION = "expo.modules.moudieemulator.PLAYER_ORIENTATION"
    const val EXTRA_PLAYER_ASPECT_RATIO = "expo.modules.moudieemulator.PLAYER_ASPECT_RATIO"
  }

  private lateinit var retroView: GLRetroView
  private lateinit var root: FrameLayout
  private lateinit var gameFrame: FrameLayout
  private lateinit var definition: NativeCoreCatalog.Definition
  private lateinit var stateFile: File
  private lateinit var preferences: android.content.SharedPreferences
  private var customizationEnabled = false
  private val controlButtons = mutableListOf<MovableControlButton>()
  private var selectedControl: MovableControlButton? = null
  private var aspectMode = "fit"
  private var aspectButton: TextView? = null
  private var micMuted = true
  private var micOverlayButton: TextView? = null
  private var stateActionInProgress = false
  private lateinit var metricPill: TextView
  private var frameWindowStartedAt = 0L
  private var framesInWindow = 0
  private val frameMeter = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (frameWindowStartedAt == 0L) frameWindowStartedAt = frameTimeNanos
      framesInWindow += 1
      val elapsed = frameTimeNanos - frameWindowStartedAt
      if (elapsed >= 1_000_000_000L) {
        val fps = (framesInWindow * 1_000_000_000L / elapsed).coerceAtMost(120L)
        if (::metricPill.isInitialized) metricPill.text = "FPS $fps   •   LOCAL PING   •   P1"
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
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      )

    val system = intent.getStringExtra(EXTRA_SYSTEM).orEmpty()
    definition = runCatching { NativeCoreCatalog.forSystem(system) }.getOrElse {
      showError("The requested emulator system is not supported.")
      return
    }
    val gameFile = File(intent.getStringExtra(EXTRA_GAME_PATH).orEmpty())
    val coreFile = File(intent.getStringExtra(EXTRA_CORE_PATH).orEmpty())
    if (!gameFile.isFile || !gameFile.canRead()) {
      showError("Could not read the game file. Choose it again from the library.")
      return
    }
    if (!coreFile.isFile || coreFile.length() == 0L) {
      showError("Could not load ${definition.coreName}. Reinstall the complete APK.")
      return
    }

    preferences = getSharedPreferences("moudie-controller-layouts", Context.MODE_PRIVATE)
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)
      ?.takeIf { it in setOf("fit", "4:3", "16:9") }
      ?: preferences.getString("${definition.system}.aspect", "fit") ?: "fit"
    val savesDirectory = File(filesDir, "moudie-${definition.system}/saves").apply { mkdirs() }
    val statesDirectory = File(filesDir, "moudie-${definition.system}/states").apply { mkdirs() }
    val systemDirectory = File(filesDir, definition.systemDirectory).apply { mkdirs() }
    stateFile = File(statesDirectory, "${stableStateKey(gameFile)}.state")

    val gameData = GLRetroViewData(this).apply {
      coreFilePath = coreFile.absolutePath
      gameFilePath = gameFile.absolutePath
      this.systemDirectory = systemDirectory.absolutePath
      this.savesDirectory = savesDirectory.absolutePath
      shader = ShaderConfig.Sharp
      preferLowLatencyAudio = true
      rumbleEventsEnabled = true
    }
    retroView = GLRetroView(this, gameData).apply { renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY }
    lifecycle.addObserver(retroView)
    lifecycleScope.launch {
      retroView.getGLRetroErrors().collect { errorCode ->
        showToast(errorMessage(errorCode, gameFile.name))
      }
    }

    root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    gameFrame = FrameLayout(this).apply { addView(retroView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)) }
    root.addView(gameFrame, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
    root.addView(createHeader(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(48), Gravity.TOP))
    metricPill = createMetricPill()
    root.addView(metricPill, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(32), Gravity.CENTER_HORIZONTAL or Gravity.TOP).apply { topMargin = dp(54) })
    addController()
    root.addView(createSocialOverlay(), FrameLayout.LayoutParams(dp(48), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.RIGHT or Gravity.CENTER_VERTICAL).apply { rightMargin = dp(12) })
    setContentView(root)
    root.post { applyAspectRatio() }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) retroView.sendKeyEvent(KeyEvent.ACTION_DOWN, keyCode, 0)
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) retroView.sendKeyEvent(KeyEvent.ACTION_UP, keyCode, 0)
    return super.onKeyUp(keyCode, event)
  }

  override fun onGenericMotionEvent(event: MotionEvent?): Boolean {
    if (event != null && ::retroView.isInitialized) {
      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, event.getAxisValue(MotionEvent.AXIS_HAT_X), event.getAxisValue(MotionEvent.AXIS_HAT_Y), 0)
      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, event.getAxisValue(MotionEvent.AXIS_X), event.getAxisValue(MotionEvent.AXIS_Y), 0)
      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, event.getAxisValue(MotionEvent.AXIS_Z), event.getAxisValue(MotionEvent.AXIS_RZ), 0)
    }
    return super.onGenericMotionEvent(event)
  }

  override fun onResume() {
    super.onResume()
    Choreographer.getInstance().postFrameCallback(frameMeter)
  }

  override fun onPause() {
    Choreographer.getInstance().removeFrameCallback(frameMeter)
    if (::retroView.isInitialized && !isChangingConfigurations) saveState(silent = true)
    super.onPause()
  }

  private fun createHeader(): LinearLayout = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(12), dp(4), dp(12), dp(4))
    setBackgroundColor(Color.argb(105, 3, 8, 18))
    addView(headerButton("×") { finish() }, LinearLayout.LayoutParams(dp(38), dp(38)))
    addView(TextView(this@UniversalLibretroPlayerActivity).apply {
      text = "${definition.title} · ${definition.coreName}"
      setTextColor(Color.rgb(223, 244, 255))
      textSize = 12f
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), 0, dp(8), 0)
      maxLines = 1
    }, LinearLayout.LayoutParams(0, dp(38), 1f))
    addView(headerButton("LOAD") { loadState() }, LinearLayout.LayoutParams(dp(52), dp(38)))
    addView(headerButton("SAVE") { saveState(silent = false) }, LinearLayout.LayoutParams(dp(52), dp(38)))
    addView(headerButton("−") { resizeSelectedControl(-0.1f) }, LinearLayout.LayoutParams(dp(34), dp(38)))
    addView(headerButton("+") { resizeSelectedControl(0.1f) }, LinearLayout.LayoutParams(dp(34), dp(38)))
    aspectButton = headerButton(aspectLabel()) { cycleAspectRatio() }
    addView(aspectButton, LinearLayout.LayoutParams(dp(62), dp(38)))
    addView(headerButton(if (customizationEnabled) "DONE" else "EDIT") { toggleCustomization() }, LinearLayout.LayoutParams(dp(50), dp(38)))
  }

  private fun headerButton(label: String, action: () -> Unit): TextView = TextView(this).apply {
    text = label
    textSize = 11f
    gravity = Gravity.CENTER
    setTextColor(Color.WHITE)
    background = roundedBackground(Color.argb(44, 18, 29, 55), Color.argb(185, 118, 225, 255), 10)
    isClickable = true
    setOnClickListener { action() }
  }

  private fun createMetricPill(): TextView = TextView(this).apply {
    text = "FPS —   •   LOCAL PING   •   P1"
    textSize = 10f
    gravity = Gravity.CENTER
    setTextColor(Color.rgb(194, 243, 255))
    setPadding(dp(12), 0, dp(12), 0)
    background = roundedBackground(Color.argb(130, 2, 12, 24), Color.argb(125, 21, 178, 238), 16)
  }

  private fun addController() {
    val profile = definition.profile
    addDraggableButton(profile.directions.up, Gravity.LEFT or Gravity.BOTTOM, dp(60), dp(148))
    addDraggableButton(profile.directions.down, Gravity.LEFT or Gravity.BOTTOM, dp(60), dp(34))
    addDraggableButton(profile.directions.left, Gravity.LEFT or Gravity.BOTTOM, dp(6), dp(91))
    addDraggableButton(profile.directions.right, Gravity.LEFT or Gravity.BOTTOM, dp(114), dp(91))

    profile.actionButtons.forEachIndexed { index, control ->
      val col = index % 3
      val row = index / 3
      addDraggableButton(control, Gravity.RIGHT or Gravity.BOTTOM, dp(20 + (2 - col) * 64), dp(35 + (1 - row) * 64))
    }
    profile.systemButtons.forEachIndexed { index, control ->
      addDraggableButton(control, Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, dp((index - 1) * 66), dp(22))
    }
    profile.shoulderButtons.forEachIndexed { index, control ->
      val right = index >= profile.shoulderButtons.size / 2
      val offset = if (right) dp(14 + (index % 2) * 58) else dp(14 + (index % 2) * 58)
      addDraggableButton(control, if (right) Gravity.RIGHT or Gravity.TOP else Gravity.LEFT or Gravity.TOP, offset, dp(62))
    }
  }

  private fun addDraggableButton(control: EmulatorTouchButton, gravity: Int, horizontalOffset: Int, bottomOrTopOffset: Int) {
    val button = MovableControlButton(this, control).apply {
      tag = control.id
      contentDescription = "${definition.system}-${control.id}"
      restoreLayout(this, control.id)
    }
    val params = FrameLayout.LayoutParams(dp(54), dp(54), gravity).apply {
      if (gravity and Gravity.RIGHT == Gravity.RIGHT) rightMargin = horizontalOffset
      else if (gravity and Gravity.LEFT == Gravity.LEFT) leftMargin = horizontalOffset
      else leftMargin = horizontalOffset
      if (gravity and Gravity.TOP == Gravity.TOP) topMargin = bottomOrTopOffset else bottomMargin = bottomOrTopOffset
    }
    controlButtons += button
    root.addView(button, params)
  }

  private fun restoreLayout(view: View, id: String) {
    val key = layoutKey(id)
    view.post {
      view.translationX = preferences.getFloat("$key.x", 0f)
      view.translationY = preferences.getFloat("$key.y", 0f)
      val scale = preferences.getFloat("$key.scale", 1f)
      view.scaleX = scale
      view.scaleY = scale
    }
  }

  private fun persistLayout(view: View, id: String) {
    val key = layoutKey(id)
    preferences.edit()
      .putFloat("$key.x", view.translationX)
      .putFloat("$key.y", view.translationY)
      .putFloat("$key.scale", view.scaleX)
      .apply()
  }

  private fun layoutKey(id: String): String {
    val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
    return "${definition.system}.$orientation.$id"
  }

  private fun toggleCustomization() {
    customizationEnabled = !customizationEnabled
    val label = if (customizationEnabled) "Edit mode: drag a control or pinch it to resize. Tap DONE to save." else "Control layout saved for this system and orientation."
    showToast(label)
  }

  private fun resizeSelectedControl(delta: Float) {
    val button = selectedControl
    if (button == null) {
      showToast("Tap a control in EDIT mode, then use − or + to resize that control only.")
      return
    }
    val next = (button.scaleX + delta).coerceIn(.65f, 1.75f)
    button.scaleX = next
    button.scaleY = next
    persistLayout(button, button.controlId())
    showToast("${button.controlId()} size ${(next * 100).toInt()}% saved.")
  }

  private fun aspectLabel(): String = if (aspectMode == "fit") "FIT" else aspectMode

  private fun cycleAspectRatio() {
    val modes = listOf("fit", "4:3", "16:9")
    aspectMode = modes[(modes.indexOf(aspectMode) + 1) % modes.size]
    preferences.edit().putString("${definition.system}.aspect", aspectMode).apply()
    aspectButton?.text = aspectLabel()
    root.post { applyAspectRatio() }
    showToast("Screen ratio: ${if (aspectMode == "fit") "FIT" else aspectMode}.")
  }

  private fun applyAspectRatio() {
    if (!::gameFrame.isInitialized || root.width <= 0 || root.height <= 0) return
    if (aspectMode == "fit") {
      gameFrame.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER)
      return
    }
    val ratio = if (aspectMode == "4:3") 4f / 3f else 16f / 9f
    var width = root.width
    var height = (width / ratio).toInt()
    if (height > root.height) {
      height = root.height
      width = (height * ratio).toInt()
    }
    gameFrame.layoutParams = FrameLayout.LayoutParams(width, height, Gravity.CENTER)
  }

  private fun createSocialOverlay(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
    alpha = .92f
    addView(headerButton("CHAT") { showToast("Text chat is available in an online room.") }, LinearLayout.LayoutParams(dp(48), dp(44)).apply { bottomMargin = dp(10) })
    micOverlayButton = headerButton(if (micMuted) "MIC×" else "MIC") {
      micMuted = !micMuted
      micOverlayButton?.text = if (micMuted) "MIC×" else "MIC"
      val status = if (micMuted) "Microphone muted." else "Microphone enabled."
      showToast("$status Voice is connected when you join a room.")
    }
    addView(micOverlayButton, LinearLayout.LayoutParams(dp(48), dp(44)))
  }

  private fun saveState(silent: Boolean) {
    if (stateActionInProgress) return
    stateActionInProgress = true
    Thread {
      val result = runCatching {
        val state = retroView.serializeState()
        require(state.isNotEmpty()) { "Could not create a save state for this game." }
        val temporary = File(stateFile.parentFile, "${stateFile.name}.tmp")
        FileOutputStream(temporary).use { output ->
          output.write(state)
          output.fd.sync()
        }
        if (!temporary.renameTo(stateFile)) {
          temporary.copyTo(stateFile, overwrite = true)
          temporary.delete()
        }
        "Save state stored locally."
      }
      runOnUiThread {
        stateActionInProgress = false
        if (!silent) showToast(result.getOrElse { it.message ?: "Could not save the state." })
      }
    }.start()
  }

  private fun loadState() {
    if (stateActionInProgress) return
    stateActionInProgress = true
    Thread {
      val result = runCatching {
        require(stateFile.isFile() && stateFile.length() > 0L) { "No saved state exists for this game." }
        require(retroView.unserializeState(stateFile.readBytes())) { "Could not load the save state; it may not match this core version." }
        "Saved state loaded."
      }
      runOnUiThread {
        stateActionInProgress = false
        showToast(result.getOrElse { it.message ?: "Could not load the state." })
      }
    }.start()
  }

  private fun stableStateKey(game: File): String {
    val name = intent.getStringExtra(EXTRA_GAME_NAME).orEmpty()
    val identity = "${definition.system}:${name.lowercase()}:${game.length()}"
    return MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun errorMessage(error: Int, fileName: String): String = when (error) {
    GLRetroView.ERROR_LOAD_LIBRARY -> "Could not load ${definition.coreName}. Reinstall the complete APK."
    GLRetroView.ERROR_LOAD_GAME -> "Could not open $fileName. Check that it is compatible with ${definition.title}."
    GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "This device does not support the graphics configuration required by this emulator."
    else -> "${definition.coreName} stopped while starting the game (code $error)."
  }

  private fun showError(message: String) {
    setContentView(TextView(this).apply {
      text = message
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(3, 8, 18))
      textSize = 16f
      setPadding(dp(28), dp(28), dp(28), dp(28))
      setOnClickListener { finish() }
    })
  }

  private fun showToast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun roundedBackground(fill: Int, stroke: Int, radius: Int) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = dp(radius).toFloat()
    setColor(fill)
    setStroke(dp(1), stroke)
  }

  private inner class MovableControlButton(context: Context, private val control: EmulatorTouchButton) : TextView(context) {
    fun controlId(): String = control.id
    private var dragging = false
    private var downX = 0f
    private var downY = 0f
    private var originX = 0f
    private var originY = 0f
    private val scaler = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        if (!customizationEnabled) return false
        val next = (scaleX * detector.scaleFactor).coerceIn(.65f, 1.75f)
        scaleX = next
        scaleY = next
        return true
      }
    })

    init {
      text = control.label
      textSize = if (control.label.length == 1) 20f else 9f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      background = roundedBackground(Color.argb(44, 9, 20, 38), Color.argb(215, 196, 237, 255), 28)
      isClickable = true
      setPadding(dp(3), 0, dp(3), 0)
      setOnTouchListener { _, event -> handleTouch(event) }
    }

    private fun handleTouch(event: MotionEvent): Boolean {
      scaler.onTouchEvent(event)
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          originX = translationX
          originY = translationY
          dragging = false
          if (customizationEnabled) {
            selectedControl = this
            showToast("${control.id} selected. Drag, pinch, or use − / +.")
          } else retroView.sendKeyEvent(KeyEvent.ACTION_DOWN, control.keyCode, 0)
          return true
        }
        MotionEvent.ACTION_MOVE -> {
          if (customizationEnabled && !scaler.isInProgress) {
            val distanceX = event.rawX - downX
            val distanceY = event.rawY - downY
            if (max(kotlin.math.abs(distanceX), kotlin.math.abs(distanceY)) > dp(4).toFloat()) dragging = true
            translationX = originX + distanceX
            translationY = originY + distanceY
          }
          return true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (customizationEnabled) persistLayout(this, control.id)
          else retroView.sendKeyEvent(KeyEvent.ACTION_UP, control.keyCode, 0)
          return true
        }
      }
      return true
    }
  }
}
