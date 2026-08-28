package expo.modules.moudieemulator

import android.app.AlertDialog
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.util.Base64
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
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.TreeMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
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
    private const val NETPLAY_FRAME_INTERVAL_MS = 17L
    @Volatile var onOverlayAction: ((action: String, muted: Boolean) -> Unit)? = null
  }

  private lateinit var retroView: GLRetroView
  private lateinit var root: FrameLayout
  private lateinit var gameFrame: FrameLayout
  private lateinit var definition: NativeCoreCatalog.Definition
  private lateinit var gameFile: File
  private lateinit var stateDirectory: File
  private lateinit var preferences: android.content.SharedPreferences
  private lateinit var metricPill: TextView
  private var aspectMode = "fit"
  private var editMode = false
  private var selected: Pair<View, String>? = null
  private val controls = mutableListOf<Pair<View, String>>()
  private val pressedTouchKeys = linkedSetOf<Int>()
  private var frameStarted = 0L
  private var frameCount = 0
  private var selectedStateSlot = 1
  @Volatile private var stateActionInProgress = false
  private var netplayClient: UniversalNetplayClient? = null
  private var localMemberId = 0
  private var localPlayerIndex = 0
  private var sessionPlayerMemberIds: List<Int> = emptyList()
  private var lockstepNetplay = false
  private val lockstepActive = AtomicBoolean(false)
  private val lockstepHandler = android.os.Handler(android.os.Looper.getMainLooper())
  private val remoteFrameMasks = TreeMap<Long, MutableMap<Int, Int>>()
  private val localFrameMasks = TreeMap<Long, Int>()
  private val localPressedKeys = mutableSetOf<Int>()
  private val appliedMasksByPort = mutableMapOf<Int, Int>()
  private var nextLockstepFrame = 0L
  private var netplayInputDelayFrames = 3L
  private var netplayQuality = NetplayQuality()
  @Volatile private var lastNetplaySyncId = -1L
  private var microphoneMuted = true
  private var speakerEnabled = true

  private val frameMeter = object : Choreographer.FrameCallback {
    override fun doFrame(t: Long) {
      if (frameStarted == 0L) frameStarted = t
      frameCount++
      val elapsed = t - frameStarted
      if (elapsed >= 1_000_000_000L) {
        updateMetric((frameCount * 1_000_000_000L / elapsed).coerceAtMost(120L))
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
    gameFile = File(intent.getStringExtra(EXTRA_GAME_PATH).orEmpty())
    val core = File(intent.getStringExtra(EXTRA_CORE_PATH).orEmpty())
    if (!gameFile.isFile || !gameFile.canRead()) { showError("Could not read the game file. Choose it again from the library."); return }
    if (!core.isFile || core.length() == 0L) { showError("Could not load ${definition.coreName}. Reinstall the complete APK."); return }

    preferences = getSharedPreferences("moudie-controller-layouts", Context.MODE_PRIVATE)
    editMode = intent.getBooleanExtra(EXTRA_PLAYER_SETTINGS_MODE, false)
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)?.takeIf { it in setOf("fit", "4:3", "16:9") } ?: preferences.getString("${definition.system}.aspect", "fit") ?: "fit"
    val saves = File(filesDir, "moudie-${definition.system}/saves").apply { mkdirs() }
    stateDirectory = File(filesDir, "moudie-${definition.system}/states").apply { mkdirs() }
    val system = NativeCoreCatalog.prepareSystemDirectory(this, definition, File(filesDir, definition.systemDirectory).apply { mkdirs() })
    retroView = GLRetroView(this, GLRetroViewData(this).apply {
      coreFilePath = core.absolutePath; gameFilePath = gameFile.absolutePath
      systemDirectory = system.absolutePath; savesDirectory = saves.absolutePath
      shader = ShaderConfig.Sharp; preferLowLatencyAudio = true; rumbleEventsEnabled = true
    }).apply { renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY }
    lifecycle.addObserver(retroView)
    lifecycleScope.launch { retroView.getGLRetroErrors().collect { showToast(errorMessage(it, gameFile.name)) } }

    root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); isMotionEventSplittingEnabled = true }
    gameFrame = FrameLayout(this).apply { addView(retroView, FrameLayout.LayoutParams(-1, -1)) }
    root.addView(gameFrame, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
    metricPill = metric()
    root.addView(metricPill, FrameLayout.LayoutParams(-2, dp(32), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(14) })
    addController()
    addMenu()
    setContentView(root)
    root.post { applyAspectRatio(); restoreScreen(); enableScreenEditor(); if (editMode) showEditorBar() }
    connectNetplayIfConfigured()
  }

  override fun onResume() { super.onResume(); Choreographer.getInstance().postFrameCallback(frameMeter) }
  override fun onPause() { Choreographer.getInstance().removeFrameCallback(frameMeter); releaseAll(); super.onPause() }
  override fun onDestroy() { stopLockstep(); netplayClient?.close(); onOverlayAction = null; super.onDestroy() }
  override fun onKeyDown(k: Int, e: KeyEvent): Boolean { sendLocalKey(KeyEvent.ACTION_DOWN, k); return super.onKeyDown(k, e) }
  override fun onKeyUp(k: Int, e: KeyEvent): Boolean { sendLocalKey(KeyEvent.ACTION_UP, k); return super.onKeyUp(k, e) }
  override fun onGenericMotionEvent(e: MotionEvent?): Boolean { if (e != null) { retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), localPlayerIndex); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), localPlayerIndex); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ), localPlayerIndex) }; return super.onGenericMotionEvent(e) }

  private fun press(k: Int) { if (pressedTouchKeys.add(k)) sendLocalKey(KeyEvent.ACTION_DOWN, k) }
  private fun release(k: Int) { if (pressedTouchKeys.remove(k)) sendLocalKey(KeyEvent.ACTION_UP, k) }
  private fun releaseAll() { pressedTouchKeys.toList().forEach { sendLocalKey(KeyEvent.ACTION_UP, it) }; pressedTouchKeys.clear() }

  private fun connectNetplayIfConfigured() {
    val serverUrl = intent.getStringExtra(EXTRA_NETPLAY_SERVER_URL).orEmpty()
    val roomId = intent.getIntExtra(EXTRA_NETPLAY_ROOM_ID, 0)
    val memberId = intent.getIntExtra(EXTRA_NETPLAY_MEMBER_ID, 0)
    val memberToken = intent.getStringExtra(EXTRA_NETPLAY_MEMBER_TOKEN).orEmpty()
    val fingerprint = intent.getStringExtra(EXTRA_NETPLAY_FINGERPRINT).orEmpty()
    val coreVersion = intent.getStringExtra(EXTRA_NETPLAY_CORE_VERSION).orEmpty()
    val player = intent.getIntExtra(EXTRA_NETPLAY_PLAYER, 0)
    if (serverUrl.isBlank() || roomId <= 0 || memberId <= 0 || memberToken.length < 20 || fingerprint.length != 64 || coreVersion.isBlank() || player !in 1..8) return
    localMemberId = memberId
    localPlayerIndex = player - 1
    lockstepNetplay = true
    updateMetric(null)
    netplayClient = UniversalNetplayClient(
      UniversalNetplayConfig(serverUrl, roomId, memberId, memberToken, definition.system, fingerprint, coreVersion, localPlayerIndex),
      onBootstrap = { runOnUiThread { if (localPlayerIndex == 0) sendInitialNetplayState() else netplayClient?.requestState(-1L) } },
      onSessionGo = { startAt, members -> runOnUiThread { startLockstep(startAt, members) } },
      onStateRequest = { if (localPlayerIndex == 0) sendInitialNetplayState() },
      onRemoteInput = { remoteMemberId, frame, mask -> synchronized(remoteFrameMasks) { remoteFrameMasks.getOrPut(frame) { mutableMapOf() }[remoteMemberId] = mask } },
      onRemoteState = { encoded, syncId, encoding -> restoreNetplayState(encoded, syncId, encoding) },
      onChat = { displayName, text -> runOnUiThread { showToast("$displayName: $text") } },
      onStatus = { message -> runOnUiThread { showToast(message) } },
      onQuality = { quality -> runOnUiThread { netplayQuality = quality; if (!lockstepActive.get()) netplayInputDelayFrames = quality.recommendedInputDelayFrames(); updateMetric(null) } },
    ).also { it.connect() }
    addRoomOverlayButtons()
  }

  private fun lockstepKeys(): List<Int> = buildList {
    val directions = definition.profile.directions
    add(directions.up.keyCode); add(directions.down.keyCode); add(directions.left.keyCode); add(directions.right.keyCode)
    definition.profile.actionButtons.forEach { add(it.keyCode) }
    definition.profile.shoulderButtons.forEach { add(it.keyCode) }
    definition.profile.systemButtons.forEach { add(it.keyCode) }
  }.distinct().take(16)

  private fun sendLocalKey(action: Int, keyCode: Int) {
    if (!lockstepNetplay) { retroView.sendKeyEvent(action, keyCode, localPlayerIndex); return }
    if (action == KeyEvent.ACTION_DOWN) localPressedKeys.add(keyCode) else localPressedKeys.remove(keyCode)
  }

  private fun currentLocalMask(): Int = lockstepKeys().foldIndexed(0) { index, mask, keyCode -> if (keyCode in localPressedKeys) mask or (1 shl index) else mask }

  private fun sendInitialNetplayState() {
    Thread {
      Thread.sleep(120)
      if (!::retroView.isInitialized || localPlayerIndex != 0) return@Thread
      runCatching { Base64.encodeToString(gzip(retroView.serializeState()), Base64.NO_WRAP) }
        .onSuccess { state -> runOnUiThread {
          if (state.isBlank()) showToast("Could not create the initial ${definition.title} room state.")
          else if (state.length > 16_000_000) showToast("The initial emulator state is too large for this room.")
          else netplayClient?.sendState(state, 0L, "gzip-base64")
        } }
        .onFailure { error -> runOnUiThread { showToast("Could not prepare the shared game state: ${error.message ?: "unknown error"}") } }
    }.start()
  }

  private fun restoreNetplayState(encoded: String, syncId: Long, encoding: String) {
    if (syncId <= lastNetplaySyncId) return
    Thread {
      runCatching { val bytes = Base64.decode(encoded, Base64.NO_WRAP); if (encoding == "gzip-base64") gunzip(bytes) else bytes }
        .onSuccess { state -> runOnUiThread {
          if (syncId <= lastNetplaySyncId) return@runOnUiThread
          if (retroView.unserializeState(state)) { lastNetplaySyncId = syncId; netplayClient?.acknowledgeState(syncId); if (syncId == 0L) showToast("Initial state synchronized. Waiting for the shared start signal.") }
          else showToast("A room state could not be applied. Request it again from the room.")
        } }
        .onFailure { error -> runOnUiThread { showToast("Could not read the shared game state: ${error.message ?: "unknown error"}") } }
    }.start()
  }

  private fun startLockstep(startAt: Long, members: List<Int>) {
    if (localMemberId !in members || members.size !in 2..definition.maxControllerSlots) {
      showToast("This ${definition.title} core supports ${definition.maxControllerSlots} synchronized controller seats. Keep additional room members as spectators for this game.")
      return
    }
    if (localPlayerIndex != 0 && lastNetplaySyncId < 0L) { showToast("The initial state has not arrived. Waiting for synchronization before starting."); netplayClient?.requestState(-1L); return }
    if (!lockstepActive.compareAndSet(false, true)) return
    sessionPlayerMemberIds = members
    localPlayerIndex = members.indexOf(localMemberId)
    nextLockstepFrame = 0L
    appliedMasksByPort.clear()
    synchronized(remoteFrameMasks) { remoteFrameMasks.clear() }
    synchronized(localFrameMasks) {
      localFrameMasks.clear()
      repeat(netplayInputDelayFrames.toInt()) { frame -> localFrameMasks[frame.toLong()] = 0; netplayClient?.sendInputFrame(frame.toLong(), 0) }
    }
    lockstepHandler.postDelayed(lockstepTick, max(0L, startAt - System.currentTimeMillis()))
    showToast("The shared session started with synchronized inputs.")
  }

  private fun stopLockstep() { lockstepActive.set(false); lockstepHandler.removeCallbacksAndMessages(null) }

  private val lockstepTick = object : Runnable {
    override fun run() {
      if (!lockstepActive.get() || !::retroView.isInitialized) return
      val targetFrame = nextLockstepFrame + netplayInputDelayFrames
      val currentMask = currentLocalMask()
      synchronized(localFrameMasks) { localFrameMasks[targetFrame] = currentMask }
      netplayClient?.sendInputFrame(targetFrame, currentMask)
      val localMask = synchronized(localFrameMasks) { localFrameMasks.remove(nextLockstepFrame) ?: 0 }
      val remoteMasks = synchronized(remoteFrameMasks) { remoteFrameMasks.remove(nextLockstepFrame) }
      val remoteMembers = sessionPlayerMemberIds.filter { it != localMemberId }
      if (remoteMasks == null || remoteMembers.any { it !in remoteMasks }) { lockstepHandler.postDelayed(this, 4L); return }
      applyMask(localMask, localPlayerIndex, appliedMasksByPort[localPlayerIndex] ?: 0)
      appliedMasksByPort[localPlayerIndex] = localMask
      remoteMembers.forEach { memberId ->
        val port = sessionPlayerMemberIds.indexOf(memberId)
        val mask = remoteMasks.getValue(memberId)
        applyMask(mask, port, appliedMasksByPort[port] ?: 0)
        appliedMasksByPort[port] = mask
      }
      retroView.requestRender()
      nextLockstepFrame += 1L
      lockstepHandler.postDelayed(this, NETPLAY_FRAME_INTERVAL_MS)
    }
  }

  private fun applyMask(mask: Int, port: Int, previous: Int) {
    lockstepKeys().forEachIndexed { index, keyCode ->
      val wasDown = previous and (1 shl index) != 0
      val isDown = mask and (1 shl index) != 0
      if (wasDown != isDown) retroView.sendKeyEvent(if (isDown) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, keyCode, port)
    }
  }

  private fun gzip(source: ByteArray): ByteArray = ByteArrayOutputStream().use { output -> GZIPOutputStream(output).use { it.write(source) }; output.toByteArray() }
  private fun gunzip(source: ByteArray): ByteArray = GZIPInputStream(ByteArrayInputStream(source)).use { it.readBytes() }

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

  private fun addRoomOverlayButtons() {
    addUtilityButton("mic", "MIC×", dp(14)) {
      microphoneMuted = !microphoneMuted
      onOverlayAction?.invoke("toggle-microphone", microphoneMuted)
      showToast(if (microphoneMuted) "Microphone muted." else "Microphone enabled.")
    }
    addUtilityButton("speaker", "SPK", dp(68)) {
      speakerEnabled = !speakerEnabled
      onOverlayAction?.invoke("toggle-speaker", !speakerEnabled)
      showToast(if (speakerEnabled) "Phone speaker enabled." else "Automatic audio output enabled.")
    }
    addUtilityButton("chat", "CHAT", dp(122)) { showChatInput() }
  }

  private fun addUtilityButton(id: String, label: String, leftMargin: Int, onClick: () -> Unit) {
    val button = TextView(this).apply { text = label; textSize = 10f; gravity = Gravity.CENTER; setTextColor(Color.WHITE); background = bg(Color.argb(190, 5, 18, 35), Color.argb(190, 99, 229, 255), 13); isClickable = true }
    var dx = 0f; var dy = 0f; var originX = 0f; var originY = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() { override fun onScale(detector: ScaleGestureDetector): Boolean { if (!editMode) return false; val size = max(.35f, button.scaleX * detector.scaleFactor); button.scaleX = size; button.scaleY = size; return true } })
    button.post { restoreControl(button, "hud-$id") }
    button.setOnTouchListener { _, event ->
      scaler.onTouchEvent(event)
      if (editMode) {
        when (event.actionMasked) { MotionEvent.ACTION_DOWN -> { selected = button to "hud-$id"; dx = event.rawX; dy = event.rawY; originX = button.translationX; originY = button.translationY }; MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) { button.translationX = originX + event.rawX - dx; button.translationY = originY + event.rawY - dy }; MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> saveControl(button, "hud-$id") }
        true
      } else { if (event.actionMasked == MotionEvent.ACTION_UP && !scaler.isInProgress) onClick(); true }
    }
    root.addView(button, FrameLayout.LayoutParams(if (id == "chat") dp(58) else dp(48), dp(38), Gravity.LEFT or Gravity.TOP).apply { topMargin = dp(14); this.leftMargin = leftMargin })
    controls += button to "hud-$id"
  }

  private fun showChatInput() {
    val input = android.widget.EditText(this).apply { hint = "Write a room message"; setSingleLine(false); maxLines = 3; setTextColor(Color.WHITE); setHintTextColor(Color.LTGRAY) }
    AlertDialog.Builder(this).setTitle("ROOM CHAT").setView(input).setNegativeButton("CANCEL", null).setPositiveButton("SEND") { _, _ ->
      val message = input.text?.toString().orEmpty().trim()
      if (message.isNotEmpty()) netplayClient?.sendChat(message)
    }.show()
  }
  private fun menu() { AlertDialog.Builder(this).setItems(arrayOf(if (editMode) "FINISH EDITING" else "EDIT CONTROLS & SCREEN", "SAVE STATE", "LOAD STATE", "RESET CONTROLS", "EXIT GAME")) { _, i -> when (i) { 0 -> toggleEdit(); 1 -> chooseStateSlot(true); 2 -> chooseStateSlot(false); 3 -> reset(); else -> finish() } }.show() }

  private fun chooseStateSlot(save: Boolean) {
    val labels = Array(5) { index ->
      val slot = index + 1
      val state = stateFile(slot)
      "S$slot${if (state.isFile && state.length() > 0L) " · saved" else " · empty"}"
    }
    AlertDialog.Builder(this).setTitle(if (save) "SAVE STATE" else "LOAD STATE").setItems(labels) { _, index ->
      selectedStateSlot = index + 1
      if (save) saveState() else loadState()
    }.show()
  }

  private fun saveState() = runStateAction("Saving state…") {
    val state = retroView.serializeState()
    require(state.isNotEmpty()) { "Could not create a save state for this game." }
    val target = stateFile(selectedStateSlot)
    val temporary = File(target.parentFile, "${target.name}.tmp")
    FileOutputStream(temporary).use { output -> output.write(state); output.fd.sync() }
    if (!temporary.renameTo(target)) { temporary.copyTo(target, overwrite = true); temporary.delete() }
    "Saved ${definition.title} in slot S$selectedStateSlot."
  }

  private fun loadState() = runStateAction("Loading state…") {
    val source = stateFile(selectedStateSlot)
    require(source.isFile && source.length() > 0L) { "No state exists in slot S$selectedStateSlot." }
    require(retroView.unserializeState(source.readBytes())) { "Could not load this state; it may not match the current game or core." }
    "Loaded ${definition.title} from slot S$selectedStateSlot."
  }

  private fun runStateAction(startMessage: String, action: () -> String) {
    if (stateActionInProgress) { showToast("Wait for the current save or load action to finish."); return }
    stateActionInProgress = true
    showToast(startMessage)
    Thread {
      val result = runCatching(action)
      runOnUiThread { stateActionInProgress = false; showToast(result.getOrElse { it.message ?: "Could not complete the state action." }) }
    }.start()
  }

  private fun stateFile(slot: Int): File = File(stateDirectory, "${stateKey()}.slot${slot.coerceIn(1, 5)}.state")
  private fun stateKey(): String {
    val identity = "${definition.system}:${intent.getStringExtra(EXTRA_GAME_NAME).orEmpty().lowercase()}:${gameFile.length()}"
    return MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

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

  private fun metric() = TextView(this).apply { text = "FPS — · LOCAL"; textSize = 10f; gravity = Gravity.CENTER; setTextColor(Color.rgb(194, 243, 255)); setPadding(dp(12), 0, dp(12), 0); background = bg(Color.argb(130, 2, 12, 24), Color.argb(125, 21, 178, 238), 16) }
  private fun updateMetric(fps: Long?) { metricPill.text = if (lockstepNetplay) "FPS ${fps?.toString() ?: "—"} · ${netplayQuality.compactLabel()} · P${localPlayerIndex + 1}" else "FPS ${fps?.toString() ?: "—"} · LOCAL" }
  private fun applyAspectRatio() { if (aspectMode == "fit" || root.width <= 0 || root.height <= 0) return; val ratio = if (aspectMode == "4:3") 4f / 3f else 16f / 9f; var w = root.width; var h = (w / ratio).toInt(); if (h > root.height) { h = root.height; w = (h * ratio).toInt() }; gameFrame.layoutParams = FrameLayout.LayoutParams(w, h, Gravity.CENTER) }
  private fun errorMessage(e: Int, name: String) = when (e) { GLRetroView.ERROR_LOAD_LIBRARY -> "Could not load ${definition.coreName}. Reinstall the complete APK."; GLRetroView.ERROR_LOAD_GAME -> "Could not open $name. Check that it is compatible with ${definition.title}."; GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "This device does not support the graphics configuration required by this emulator."; else -> "${definition.coreName} stopped while starting the game (code $e)." }
  private fun showError(m: String) { setContentView(TextView(this).apply { text = m; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(3, 8, 18)); textSize = 16f; setPadding(dp(28), dp(28), dp(28), dp(28)); setOnClickListener { finish() } }) }
  private fun showToast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
  private fun bg(fill: Int, stroke: Int, radius: Int) = GradientDrawable().apply { shape = GradientDrawable.RECTANGLE; cornerRadius = dp(radius).toFloat(); setColor(fill); setStroke(dp(1), stroke) }
}
