package expo.modules.moudieemulator

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
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
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Local FCEUmm player for NES/Famicom games which require mapper support beyond JSNES.
 * This player is intentionally local-only: network play continues to use the deterministic JSNES path.
 */
class FamicomCompatPlayerActivity : ComponentActivity() {
  companion object {
    const val EXTRA_GAME_PATH = "expo.modules.moudieemulator.FAMICOM_GAME_PATH"
    const val EXTRA_GAME_NAME = "expo.modules.moudieemulator.FAMICOM_GAME_NAME"
    const val EXTRA_FOCUS_MODE = "expo.modules.moudieemulator.FAMICOM_FOCUS_MODE"
    const val EXTRA_PLAYER_ORIENTATION = "expo.modules.moudieemulator.PLAYER_ORIENTATION"
    const val EXTRA_PLAYER_ASPECT_RATIO = "expo.modules.moudieemulator.PLAYER_ASPECT_RATIO"
    private const val CORE_FILE_NAME = "fceumm_libretro_android.so"
  }

  private lateinit var retroView: GLRetroView
  private lateinit var root: FrameLayout
  private lateinit var gameFrame: FrameLayout
  private lateinit var controlsContainer: FrameLayout
  private lateinit var headerView: LinearLayout
  private lateinit var controlPreferences: android.content.SharedPreferences
  private lateinit var stateDirectory: File
  private val controlProfile = EmulatorControlProfiles.FAMICOM
  private var selectedSlot = 1
  private var controlScale = 1.3f
  private var focusMode = false
  private var controlEditMode = false
  private var selectedEditableControl: Pair<View, String>? = null
  private var editToggleButton: TextView? = null
  private var aspectMode = "fit"
  private var micMuted = true
  private var speakerEnabled = false
  private val gameplayHud = mutableListOf<View>()
  @Volatile private var stateActionInProgress = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    focusMode = intent.getBooleanExtra(EXTRA_FOCUS_MODE, false)
    requestedOrientation = when (intent.getStringExtra(EXTRA_PLAYER_ORIENTATION)) {
      "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      else -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
    }
    controlPreferences = getSharedPreferences("moudie-famicom-controls", MODE_PRIVATE)
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)
      ?.takeIf { it in setOf("fit", "4:3", "16:9") }
      ?: "fit"
    controlScale = kotlin.math.max(.35f, controlPreferences.getFloat(controlScaleKey(), 1.3f))
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      )

    val gameFile = File(intent.getStringExtra(EXTRA_GAME_PATH).orEmpty())
    if (!gameFile.isFile || !gameFile.canRead()) {
      showError("Could not read the Famicom game file. Choose it again from the game screen.")
      return
    }

    val savesDirectory = File(filesDir, "moudie-famicom/saves").apply { mkdirs() }
    stateDirectory = File(filesDir, "moudie-famicom/states").apply { mkdirs() }
    retroView = GLRetroView(this, GLRetroViewData(this).apply {
      coreFilePath = CORE_FILE_NAME
      gameFilePath = gameFile.absolutePath
      this.savesDirectory = savesDirectory.absolutePath
      shader = ShaderConfig.Sharp
      preferLowLatencyAudio = true
      skipDuplicateFrames = true
    })
    lifecycle.addObserver(retroView)

    root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    gameFrame = FrameLayout(this).apply {
      addView(retroView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
    root.addView(gameFrame, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
    headerView = createHeader(gameFile)
    attachGameplayHud()
    controlsContainer = FrameLayout(this).apply { isMotionEventSplittingEnabled = true }.apply { isMotionEventSplittingEnabled = true }.apply { isMotionEventSplittingEnabled = true }
    root.addView(controlsContainer, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    renderControls()
    setContentView(root)
    root.post { applyAspectRatio(); restoreScreenLayout(); enableScreenEditor() }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) retroView.sendKeyEvent(event.action, keyCode)
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) retroView.sendKeyEvent(event.action, keyCode)
    return super.onKeyUp(keyCode, event)
  }

  override fun onPause() {
    if (::retroView.isInitialized && !isChangingConfigurations) saveState(silent = true)
    super.onPause()
  }

  private fun createHeader(gameFile: File): LinearLayout = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(10), dp(7), dp(10), dp(7))
    setBackgroundColor(Color.argb(145, 4, 12, 22))
    addView(button("×", KeyEvent.KEYCODE_UNKNOWN, dp(36), onClick = { finish() }))
    addView(TextView(this@FamicomCompatPlayerActivity).apply {
      text = if (focusMode) "Famicom · Native Focus" else "Famicom · Extended Compatibility"
      setTextColor(Color.rgb(210, 241, 255)); textSize = 12f; gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(10), 0, 0, 0)
    }, LinearLayout.LayoutParams(0, dp(36), 1f))
    (1..3).forEach { slot -> addView(button("S$slot", KeyEvent.KEYCODE_UNKNOWN, dp(34), onClick = { selectedSlot = slot; showToast("Save slot $slot selected.") })) }
    addView(button("LOAD", KeyEvent.KEYCODE_UNKNOWN, dp(50), onClick = { loadState() }))
    addView(button("SAVE", KeyEvent.KEYCODE_UNKNOWN, dp(42), onClick = { saveState() }))
    editToggleButton = button("EDIT", KeyEvent.KEYCODE_UNKNOWN, dp(46), onClick = { toggleControlEditing() })
    addView(editToggleButton)
  }

  private fun attachGameplayHud() {
    gameplayHud.forEach { root.removeView(it) }
    gameplayHud.clear()
    val actions = listOf(
      Triple("CHAT", "chat") { showToast("Open the room chat while connected to an online Famicom room.") },
      Triple(if (micMuted) "MIC×" else "MIC", "microphone") {
        micMuted = !micMuted
        gameplayHud.filterIsInstance<DraggableHudButton>().firstOrNull { it.text.toString().startsWith("MIC") }?.text = if (micMuted) "MIC×" else "MIC"
        showToast(if (micMuted) "Microphone muted." else "Microphone enabled.")
      },
      Triple(if (speakerEnabled) "SPK" else "SPK×", "speaker") {
        speakerEnabled = !speakerEnabled
        gameplayHud.filterIsInstance<DraggableHudButton>().firstOrNull { it.text.toString().startsWith("SPK") }?.text = if (speakerEnabled) "SPK" else "SPK×"
        showToast(if (speakerEnabled) "Phone speaker selected." else "Automatic audio output selected.")
      },
      Triple("OPTIONS", "options") { showGameplayOptions() },
    )
    actions.forEachIndexed { index, (label, id, action) ->
      val hud = DraggableHudButton(this, controlPreferences, "famicom", id, label, editing = { controlEditMode }, action = action).also { it.restore() }
      root.addView(hud, hud.layoutParams(Gravity.RIGHT or Gravity.TOP, right = 12 + index * 58, top = 12))
      gameplayHud += hud
    }
  }

  private fun showGameplayOptions() {
    android.app.AlertDialog.Builder(this)
      .setItems(arrayOf("EDIT CONTROLS & SCREEN", "SAVE GAME", "LOAD GAME", "EXIT GAME")) { _, index ->
        when (index) { 0 -> toggleControlEditing(); 1 -> saveState(); 2 -> loadState(); else -> finish() }
      }
      .show()
  }

  private fun renderControls() {
    controlsContainer.removeAllViews()
    val wrapper = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(10), dp(6), dp(10), dp(8)); setBackgroundColor(Color.argb(40, 4, 12, 22))
    }
    val size = controlSize()
    val playRow = FrameLayout(this)
    // LEFT/RIGHT stay physical on Arabic devices. The utility controls are deliberately
    // placed in a separate row below this play row, so they can never overlap D-pad/A-B.
    playRow.addView(createDpad(), FrameLayout.LayoutParams(size * 3, size * 3, Gravity.LEFT or Gravity.TOP))
    playRow.addView(createActionButtons(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.RIGHT or Gravity.CENTER_VERTICAL))
    wrapper.addView(playRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, size * 3))
    wrapper.addView(createMiddleControls().apply { alpha = .90f }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    controlsContainer.addView(wrapper, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
  }

  private fun createDpad(): PlayStationStyleDpad = PlayStationStyleDpad(
    context = this,
    upKey = controlProfile.directions.up.keyCode, downKey = controlProfile.directions.down.keyCode,
    leftKey = controlProfile.directions.left.keyCode, rightKey = controlProfile.directions.right.keyCode,
    onKey = { action, key -> retroView.sendKeyEvent(if (action == MotionEvent.ACTION_DOWN) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, key) },
    preferences = controlPreferences, layoutKey = controlLayoutKey("dpad"), editing = { controlEditMode },
    onSelected = { view -> selectedEditableControl = view to "DPAD" },
  )

  private fun createMiddleControls(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    addView(row(
      button("−", KeyEvent.KEYCODE_UNKNOWN, dp(46), dp(54), onClick = { resizeSelectedControl(-.1f) }),
      controlScaleIndicator(),
      button("+", KeyEvent.KEYCODE_UNKNOWN, dp(46), dp(54), onClick = { resizeSelectedControl(.1f) }),
    ))
    addView(row(
      button(controlProfile.systemButtons[0], dp(74), dp(48)),
      button(controlProfile.systemButtons[1], dp(74), dp(48)),
    ))
    addView(row(
      button("LOAD", KeyEvent.KEYCODE_UNKNOWN, dp(70), dp(42), onClick = { loadState() }),
      button("SAVE", KeyEvent.KEYCODE_UNKNOWN, dp(54), dp(42), onClick = { saveState() }),
    ))
  }

  private fun createActionButtons(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    addView(row(button(controlProfile.actionButtons[0], controlSize(), controlSize()), button(controlProfile.actionButtons[1], controlSize(), controlSize())))
  }

  private fun saveState(silent: Boolean = false) = runStateAction("Saving state…", silent) {
    val state = retroView.serializeState(); require(state.isNotEmpty()) { "Could not create a save state." }
    val target = stateFile(); val temporary = File(target.parentFile, "${target.name}.tmp")
    FileOutputStream(temporary).use { output -> output.write(state); output.fd.sync() }
    if (!temporary.renameTo(target)) { temporary.copyTo(target, overwrite = true); temporary.delete() }
    "Saved in slot S$selectedSlot."
  }

  private fun loadState() = runStateAction("Loading state…", false) {
    val source = stateFile(); require(source.isFile && source.length() > 0) { "No state exists in slot S$selectedSlot." }
    require(retroView.unserializeState(source.readBytes())) { "Could not load the state; it may be incompatible." }
    "Slot S$selectedSlot loaded."
  }

  private fun runStateAction(startMessage: String, silent: Boolean, action: () -> String) {
    if (stateActionInProgress) return
    stateActionInProgress = true; if (!silent) showToast(startMessage)
    Thread {
      val result = runCatching(action)
      runOnUiThread { stateActionInProgress = false; if (!silent) showToast(result.getOrElse { it.message ?: "Could not complete the action." }) }
    }.start()
  }

  private fun stateFile(): File = File(stateDirectory, "${stateKey()}.slot$selectedSlot.state")
  private fun stateKey(): String {
    val identity = "${intent.getStringExtra(EXTRA_GAME_NAME).orEmpty().lowercase()}:${File(intent.getStringExtra(EXTRA_GAME_PATH).orEmpty()).length()}"
    return MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }
  private fun row(vararg children: View): LinearLayout = LinearLayout(this).apply {
    gravity = Gravity.CENTER
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    children.forEach { child ->
      val requested = child.layoutParams
      addView(child, LinearLayout.LayoutParams(
        requested?.width ?: LinearLayout.LayoutParams.WRAP_CONTENT,
        requested?.height ?: LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { setMargins(dp(4), dp(3), dp(4), dp(3)) })
    }
  }
  private fun controlScaleIndicator(): TextView = TextView(this).apply {
      text = "SELECT\nBUTTON"
    textSize = 11f; setTextColor(Color.rgb(216, 244, 255)); gravity = Gravity.CENTER
    setBackgroundColor(Color.rgb(20, 49, 70)); setPadding(dp(5), 0, dp(5), 0)
    layoutParams = LinearLayout.LayoutParams(dp(92), dp(54))
  }
  private fun button(control: EmulatorTouchButton, width: Int, height: Int = dp(46)): TextView =
    button(control.label, control.keyCode, width, height, isDirection = control.id in setOf("up", "down", "left", "right")).also { view -> attachEditableControl(view, control.id, control.keyCode) }
  private fun button(label: String, keyCode: Int, width: Int, height: Int = dp(46), onClick: (() -> Unit)? = null, isDirection: Boolean = false): TextView = TextView(this).apply {
    val side = maxOf(width, height)
    text = label; textSize = if (label.length == 1) 21f else 10f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
    background = if (isDirection) directionalControlBackground() else circularControlBackground(); isClickable = true; isFocusable = true
    layoutParams = LinearLayout.LayoutParams(side, side)
    if (onClick != null) setOnClickListener { onClick() } else setOnTouchListener { _, event -> when (event.actionMasked) { MotionEvent.ACTION_DOWN -> retroView.sendKeyEvent(KeyEvent.ACTION_DOWN, keyCode); MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> retroView.sendKeyEvent(KeyEvent.ACTION_UP, keyCode) }; true }
  }
  private fun circularControlBackground(): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(Color.argb(150, 37, 62, 85))
    setStroke(dp(2), Color.argb(205, 218, 239, 255))
  }
  private fun directionalControlBackground(): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = dp(10).toFloat()
    setColor(Color.argb(150, 14, 39, 61))
    setStroke(dp(2), Color.argb(205, 218, 239, 255))
  }
  private fun toggleControlEditing() {
    controlEditMode = !controlEditMode
    editToggleButton?.text = if (controlEditMode) "DONE" else "EDIT"
    if (controlEditMode) root.addView(headerView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP))
    else root.removeView(headerView)
    showToast(if (controlEditMode) "Edit mode: tap a control, then drag, pinch, or use − / +." else "Control layout saved for this orientation.")
  }

  private fun resizeSelectedControl(delta: Float) {
    val selected = selectedEditableControl
    if (selected == null) { showToast("Tap a control in EDIT mode first."); return }
    val (view, controlId) = selected
    val next = kotlin.math.max(.35f, view.scaleX + delta)
    view.scaleX = next; view.scaleY = next
    persistControlLayout(view, controlId)
    showToast("$controlId size ${(next * 100).toInt()}% saved.")
  }
  private fun controlScaleKey(): String {
    val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
    return "famicom.$orientation.scale"
  }

  private fun controlLayoutKey(controlId: String): String {
    val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
    return "famicom.$orientation.$controlId"
  }

  private fun persistControlLayout(view: View, controlId: String) {
    val key = controlLayoutKey(controlId)
    controlPreferences.edit().putFloat("$key.x", view.translationX).putFloat("$key.y", view.translationY).putFloat("$key.scale", view.scaleX).apply()
  }

  private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {
    var downX = 0f; var downY = 0f; var originX = 0f; var originY = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        if (!controlEditMode) return false
        val next = kotlin.math.max(.35f, view.scaleX * detector.scaleFactor)
        view.scaleX = next; view.scaleY = next
        return true
      }
    })
    view.post {
      val key = controlLayoutKey(controlId)
      view.translationX = controlPreferences.getFloat("$key.x", 0f)
      view.translationY = controlPreferences.getFloat("$key.y", 0f)
      val storedScale = controlPreferences.getFloat("$key.scale", 1f)
      view.scaleX = storedScale; view.scaleY = storedScale
    }
    view.setOnTouchListener { _, event ->
      scaler.onTouchEvent(event)
      if (controlEditMode) {
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> { selectedEditableControl = view to controlId; downX = event.rawX; downY = event.rawY; originX = view.translationX; originY = view.translationY; showToast("$controlId selected. Drag, pinch, or use − / +.") }
          MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) { view.translationX = originX + event.rawX - downX; view.translationY = originY + event.rawY - downY }
          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> persistControlLayout(view, controlId)
        }
        true
      } else {
        when (event.actionMasked) { MotionEvent.ACTION_DOWN -> retroView.sendKeyEvent(KeyEvent.ACTION_DOWN, keyCode); MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> retroView.sendKeyEvent(KeyEvent.ACTION_UP, keyCode) }
        true
      }
    }
  }
  private fun controlScalePercent(): Int = (controlScale * 100).roundToInt()
  private fun controlSize(): Int {
    val requested = dp((84 * controlScale).toInt())
    if (!focusMode) return requested
    // Portrait focus has five button-widths across (three for D-pad, two for A/B).
    // Cap the rendered size to the available width, preserving clear gaps at every scale.
    val safeWidth = resources.displayMetrics.widthPixels - dp(72)
    return min(requested, safeWidth / 5)
  }
  private fun applyAspectRatio() {
    if (root.width <= 0 || root.height <= 0) return
    if (aspectMode == "fit") {
      gameFrame.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER)
      return
    }
    val ratio = if (aspectMode == "4:3") 4f / 3f else 16f / 9f
    var width = root.width
    var height = (width / ratio).toInt()
    if (height > root.height) { height = root.height; width = (height * ratio).toInt() }
    gameFrame.layoutParams = FrameLayout.LayoutParams(width, height, Gravity.CENTER)
  }

  private fun screenLayoutKey(): String {
    val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
    return "famicom.$orientation.screen"
  }

  private fun restoreScreenLayout() {
    val key = screenLayoutKey()
    gameFrame.translationX = controlPreferences.getFloat("$key.x", 0f)
    gameFrame.translationY = controlPreferences.getFloat("$key.y", 0f)
    val scale = controlPreferences.getFloat("$key.scale", 1f)
    gameFrame.scaleX = scale
    gameFrame.scaleY = scale
  }

  private fun persistScreenLayout() {
    val key = screenLayoutKey()
    controlPreferences.edit()
      .putFloat("$key.x", gameFrame.translationX)
      .putFloat("$key.y", gameFrame.translationY)
      .putFloat("$key.scale", gameFrame.scaleX)
      .apply()
  }

  private fun enableScreenEditor() {
    var downX = 0f; var downY = 0f; var originX = 0f; var originY = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        if (!controlEditMode) return false
        val next = kotlin.math.max(.35f, gameFrame.scaleX * detector.scaleFactor)
        gameFrame.scaleX = next
        gameFrame.scaleY = next
        return true
      }
    })
    retroView.setOnTouchListener { _, event ->
      if (!controlEditMode) return@setOnTouchListener false
      scaler.onTouchEvent(event)
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX; downY = event.rawY
          originX = gameFrame.translationX; originY = gameFrame.translationY
          showToast("Screen selected. Drag or pinch to resize it for this orientation.")
        }
        MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) {
          gameFrame.translationX = originX + event.rawX - downX
          gameFrame.translationY = originY + event.rawY - downY
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> persistScreenLayout()
      }
      true
    }
  }

  private fun showToast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  private fun showError(message: String) { setContentView(TextView(this).apply { text = message; gravity = Gravity.CENTER; textSize = 18f; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(5, 8, 14)); setOnClickListener { finish() } }) }
  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
