package expo.modules.moudieemulator

import android.content.Context
import android.app.AlertDialog
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig
import com.swordfish.libretrodroid.Variable
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.TreeMap
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

/**
 * Full-screen native PS1 player. The game file arrives from the system picker and stays in
 * the app's private storage; it is never uploaded or sent through the room service.
 */
class PS1PlayerActivity : ComponentActivity() {
  companion object {
    const val EXTRA_GAME_PATH = "expo.modules.moudieemulator.GAME_PATH"
    const val EXTRA_GAME_NAME = "expo.modules.moudieemulator.GAME_NAME"
    const val EXTRA_NETPLAY_SERVER_URL = "expo.modules.moudieemulator.NETPLAY_SERVER_URL"
    const val EXTRA_NETPLAY_ROOM_ID = "expo.modules.moudieemulator.NETPLAY_ROOM_ID"
    const val EXTRA_NETPLAY_MEMBER_ID = "expo.modules.moudieemulator.NETPLAY_MEMBER_ID"
    const val EXTRA_NETPLAY_MEMBER_TOKEN = "expo.modules.moudieemulator.NETPLAY_MEMBER_TOKEN"
    const val EXTRA_NETPLAY_FINGERPRINT = "expo.modules.moudieemulator.NETPLAY_FINGERPRINT"
    const val EXTRA_NETPLAY_PLAYER = "expo.modules.moudieemulator.NETPLAY_PLAYER"
    const val EXTRA_PLAYER_ORIENTATION = "expo.modules.moudieemulator.PLAYER_ORIENTATION"
    const val EXTRA_PLAYER_ASPECT_RATIO = "expo.modules.moudieemulator.PLAYER_ASPECT_RATIO"
    const val EXTRA_PLAYER_SETTINGS_MODE = "expo.modules.moudieemulator.PLAYER_SETTINGS_MODE"
    private const val NETPLAY_CORE_VERSION = "pcsx-rearmed-0.13.2-lockstep-v1"
    private const val NETPLAY_INPUT_DELAY_FRAMES = 3L
    private const val NETPLAY_FRAME_INTERVAL_MS = 17L
    private val PS1_LOCKSTEP_KEYS = intArrayOf(
      KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
      KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
      KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_B,
      KeyEvent.KEYCODE_BUTTON_X, KeyEvent.KEYCODE_BUTTON_Y,
      KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1,
      KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_R2,
      KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BUTTON_START,
    )
    @Volatile var onOverlayAction: ((action: String, muted: Boolean) -> Unit)? = null
  }

  private lateinit var retroView: GLRetroView
  private lateinit var root: FrameLayout
  private lateinit var gameFrame: FrameLayout
  private lateinit var controlsContainer: FrameLayout
  private lateinit var controlPreferences: android.content.SharedPreferences
  private var controlEditMode = false
  private var settingsMode = false
  private var selectedEditableControl: Pair<TextView, String>? = null
  private var aspectMode = "fit"
  private lateinit var topControls: FrameLayout
  private val gameplayHud = mutableListOf<View>()
  private lateinit var stateFile: File
  private val controlProfile = EmulatorControlProfiles.PS1
  private var netplayClient: Ps1NetplayClient? = null
  private var localPlayerIndex = 0
  @Volatile private var lastNetplaySyncId = -1L
  private val lockstepActive = AtomicBoolean(false)
  private val lockstepHandler = Handler(Looper.getMainLooper())
  private val bootstrapHandler = Handler(Looper.getMainLooper())
  private var bootstrapRequestAttempts = 0
  private val remoteFrameMasks = TreeMap<Long, MutableMap<Int, Int>>()
  private val localFrameMasks = TreeMap<Long, Int>()
  private val localPressedKeys = mutableSetOf<Int>()
  private var localMemberId = 0
  private var sessionPlayerMemberIds: List<Int> = emptyList()
  private var nextLockstepFrame = 0L
  private val appliedMasksByPort = mutableMapOf<Int, Int>()
  private var lockstepNetplay = false
  private var micOverlayMuted = true
  private var micOverlayButton: TextView? = null
  private var speakerOverlayEnabled = false
  private var speakerOverlayButton: TextView? = null
  @Volatile
  private var stateActionInProgress = false

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
      View.SYSTEM_UI_FLAG_FULLSCREEN or
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      )

    controlPreferences = getSharedPreferences("moudie-ps1-controls", Context.MODE_PRIVATE)
    settingsMode = intent.getBooleanExtra(EXTRA_PLAYER_SETTINGS_MODE, false)
    controlEditMode = settingsMode
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)
      ?.takeIf { it in setOf("fit", "4:3", "16:9") }
      ?: controlPreferences.getString("ps1.aspect", "fit") ?: "fit"

    val gamePath = intent.getStringExtra(EXTRA_GAME_PATH).orEmpty()
    val gameFile = File(gamePath)
    if (!gameFile.isFile || !gameFile.canRead()) {
      showError("Could not read the PS1 game file. Choose it again from the room screen.")
      return
    }

    val coreFile = NativeCoreLocator.findPs1Core(this)
    if (coreFile == null) {
      showError("Could not find the PS1 core in this app. Install the latest complete APK and try again.")
      return
    }

    val systemDirectory = File(filesDir, "moudie-ps1/system").apply { mkdirs() }
    val savesDirectory = File(filesDir, "moudie-ps1/saves").apply { mkdirs() }
    val stateDirectory = File(filesDir, "moudie-ps1/states").apply { mkdirs() }
    stateFile = File(stateDirectory, "${stateKeyForGame(gameFile)}.state")
    val gameData = GLRetroViewData(this).apply {
      coreFilePath = coreFile.absolutePath
      gameFilePath = gameFile.absolutePath
      this.systemDirectory = systemDirectory.absolutePath
      this.savesDirectory = savesDirectory.absolutePath
      shader = ShaderConfig.Sharp
      rumbleEventsEnabled = true
      preferLowLatencyAudio = true
    }

    retroView = GLRetroView(this, gameData)
    retroView.renderMode = if (settingsMode) GLSurfaceView.RENDERMODE_CONTINUOUSLY else GLSurfaceView.RENDERMODE_WHEN_DIRTY
    lifecycle.addObserver(retroView)
    lifecycleScope.launch {
      retroView.getGLRetroErrors().collect { errorCode ->
        showError(ps1ErrorMessage(errorCode, gameFile.name))
      }
    }

    root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    gameFrame = FrameLayout(this).apply {
      addView(retroView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
    root.addView(gameFrame, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
    topControls = createTopControls()
    if (settingsMode) root.addView(topControls, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.TOP,
    ))
    controlsContainer = FrameLayout(this).apply { addView(createControls()) }
    root.addView(controlsContainer, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      if (settingsMode) FrameLayout.LayoutParams.MATCH_PARENT else FrameLayout.LayoutParams.WRAP_CONTENT,
      if (settingsMode) Gravity.FILL else Gravity.BOTTOM,
    ))
    attachGameplayOverlay()
    setContentView(root)
    root.post { applyAspectRatio(); restoreScreenLayout(); enableScreenEditor() }
    connectNetplayIfConfigured()
  }

  override fun onGenericMotionEvent(event: MotionEvent?): Boolean {
    if (event != null && ::retroView.isInitialized) {
      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, event.getAxisValue(MotionEvent.AXIS_HAT_X), event.getAxisValue(MotionEvent.AXIS_HAT_Y), localPlayerIndex)
      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, event.getAxisValue(MotionEvent.AXIS_X), event.getAxisValue(MotionEvent.AXIS_Y), localPlayerIndex)
      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, event.getAxisValue(MotionEvent.AXIS_Z), event.getAxisValue(MotionEvent.AXIS_RZ), localPlayerIndex)
    }
    return super.onGenericMotionEvent(event)
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) sendLocalKey(event.action, keyCode)
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) sendLocalKey(event.action, keyCode)
    return super.onKeyUp(keyCode, event)
  }

  override fun onPause() {
    if (::retroView.isInitialized && !isChangingConfigurations) saveState(silent = true)
    super.onPause()
  }

  override fun onDestroy() {
    stopLockstep()
    stopBootstrapRetry()
    netplayClient?.close()
    onOverlayAction = null
    super.onDestroy()
  }

  private fun connectNetplayIfConfigured() {
    val serverUrl = intent.getStringExtra(EXTRA_NETPLAY_SERVER_URL).orEmpty()
    val roomId = intent.getIntExtra(EXTRA_NETPLAY_ROOM_ID, 0)
    val memberId = intent.getIntExtra(EXTRA_NETPLAY_MEMBER_ID, 0)
    val memberToken = intent.getStringExtra(EXTRA_NETPLAY_MEMBER_TOKEN).orEmpty()
    val fingerprint = intent.getStringExtra(EXTRA_NETPLAY_FINGERPRINT).orEmpty()
    val player = intent.getIntExtra(EXTRA_NETPLAY_PLAYER, 1)
    if (serverUrl.isBlank() || roomId <= 0 || memberId <= 0 || memberToken.length < 20 || fingerprint.length != 64 || player !in 1..8) return
    localMemberId = memberId
    localPlayerIndex = player - 1
    lockstepNetplay = true
    retroView.requestRender()
    netplayClient = Ps1NetplayClient(
      Ps1NetplayConfig(serverUrl, roomId, memberId, memberToken, fingerprint, NETPLAY_CORE_VERSION, localPlayerIndex),
      onBootstrap = {
        runOnUiThread {
          showToast(if (localPlayerIndex == 0) "Readiness verified. Sending the shared initial state." else "Readiness verified. Waiting for the host's shared initial state.")
          if (localPlayerIndex == 0) sendInitialNetplayState() else startBootstrapRetry()
        }
      },
      onSessionGo = { startAt, playerMemberIds -> runOnUiThread { startLockstep(startAt, playerMemberIds) } },
      onStateRequest = { if (localPlayerIndex == 0) sendInitialNetplayState() },
      onRemoteInput = { remoteMemberId, frame, mask ->
        synchronized(remoteFrameMasks) { remoteFrameMasks.getOrPut(frame) { mutableMapOf() }[remoteMemberId] = mask }
      },
      onRemoteState = { encoded, syncId, encoding -> restoreNetplayState(encoded, syncId, encoding) },
      onChat = { displayName, text -> runOnUiThread { showToast("$displayName: $text") } },
      onStatus = { message -> runOnUiThread { showToast(message) } },
    ).also { it.connect() }
  }

  private fun sendLocalKey(action: Int, keyCode: Int) {
    if (!lockstepNetplay) {
      retroView.sendKeyEvent(action, keyCode, localPlayerIndex)
      return
    }
    if (action == KeyEvent.ACTION_DOWN) localPressedKeys.add(keyCode) else localPressedKeys.remove(keyCode)
  }

  private fun sendInitialNetplayState() {
    Thread {
      Thread.sleep(300)
      if (!::retroView.isInitialized || localPlayerIndex != 0) return@Thread
      runCatching {
        val compressed = gzip(retroView.serializeState())
        Base64.encodeToString(compressed, Base64.NO_WRAP)
      }.onSuccess { encoded -> runOnUiThread {
        if (encoded.isBlank()) showToast("Could not create the initial PS1 room state.")
        else if (encoded.length > 16_000_000) showToast("The initial PS1 state is too large for this room. Try another game or restart both players.")
        else netplayClient?.sendState(encoded, 0L, "gzip-base64")
      } }.onFailure { runOnUiThread { showToast("Could not prepare the PS1 room state: ${it.message ?: "unknown error"}") } }
    }.start()
  }

  private fun restoreNetplayState(encoded: String, syncId: Long, encoding: String) {
    if (syncId <= lastNetplaySyncId) return
    Thread {
      runCatching {
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        if (encoding == "gzip-base64") gunzip(bytes) else bytes
      }
        .onSuccess { bytes -> runOnUiThread {
          if (syncId <= lastNetplaySyncId) return@runOnUiThread
          if (retroView.unserializeState(bytes)) {
            lastNetplaySyncId = syncId
            netplayClient?.acknowledgeState(syncId)
            stopBootstrapRetry()
            if (syncId == 0L) showToast("Initial state synchronized. Wait for the shared start signal.")
          }
          else showToast("A PS1 state arrived but could not be applied. Request it again from the room.")
        } }
    }.start()
  }

  private fun gzip(source: ByteArray): ByteArray = ByteArrayOutputStream().use { output ->
    GZIPOutputStream(output).use { it.write(source) }
    output.toByteArray()
  }

  private fun gunzip(source: ByteArray): ByteArray = GZIPInputStream(ByteArrayInputStream(source)).use { it.readBytes() }

  private fun startLockstep(startAt: Long, playerMemberIds: List<Int>) {
    if (localMemberId !in playerMemberIds || playerMemberIds.size !in 2..8) {
      showToast("This device is not assigned to the verified PS1 player set.")
      return
    }
    sessionPlayerMemberIds = playerMemberIds
    localPlayerIndex = playerMemberIds.indexOf(localMemberId)
    if (localPlayerIndex != 0 && lastNetplaySyncId < 0L) {
      showToast("The initial state has not arrived yet; requesting it again before starting.")
      startBootstrapRetry()
      return
    }
    if (!lockstepActive.compareAndSet(false, true)) return
    configureMultitapPorts(playerMemberIds.size)
    stopBootstrapRetry()
    nextLockstepFrame = 0L
    appliedMasksByPort.clear()
    synchronized(remoteFrameMasks) { remoteFrameMasks.clear() }
    synchronized(localFrameMasks) {
      localFrameMasks.clear()
      repeat(NETPLAY_INPUT_DELAY_FRAMES.toInt()) { frame ->
        localFrameMasks[frame.toLong()] = 0
        netplayClient?.sendInputFrame(frame.toLong(), 0)
      }
    }
    lockstepHandler.postDelayed(lockstepTick, max(0L, startAt - System.currentTimeMillis()))
    showToast("The shared session started without reloading stale frames.")
  }

  private fun configureMultitapPorts(playerCount: Int) {
    if (playerCount <= 2) return
    val configuredValue = if (playerCount <= 5) "port 1 only" else "both"
    runCatching {
      val variable = retroView.getVariables().firstOrNull { it.key == "pcsx_rearmed_multitap" } ?: return@runCatching
      retroView.updateVariables(Variable(variable.key, configuredValue, variable.description))
    }.onFailure {
      showToast("This PS1 core could not enable multitap automatically; reopen the session after checking the game supports multitap.")
    }
  }

  private fun stopLockstep() {
    lockstepActive.set(false)
    lockstepHandler.removeCallbacksAndMessages(null)
  }

  private val bootstrapRetry = object : Runnable {
    override fun run() {
      if (localPlayerIndex == 0 || lastNetplaySyncId >= 0L || lockstepActive.get()) return
      if (bootstrapRequestAttempts >= 20) {
        showToast("Initial-state confirmation is delayed. Keep both devices in-game and request session start again.")
        return
      }
      bootstrapRequestAttempts += 1
      netplayClient?.requestState(-1L)
      bootstrapHandler.postDelayed(this, 1_000L)
    }
  }

  private fun startBootstrapRetry() {
    if (localPlayerIndex == 0 || lastNetplaySyncId >= 0L || lockstepActive.get()) return
    bootstrapRequestAttempts = 0
    bootstrapHandler.removeCallbacks(bootstrapRetry)
    bootstrapHandler.post(bootstrapRetry)
  }

  private fun stopBootstrapRetry() {
    bootstrapHandler.removeCallbacks(bootstrapRetry)
  }

  private val lockstepTick = object : Runnable {
    override fun run() {
      if (!lockstepActive.get() || !::retroView.isInitialized) return
      val localMask = currentLocalMask()
      val targetFrame = nextLockstepFrame + NETPLAY_INPUT_DELAY_FRAMES
      synchronized(localFrameMasks) { localFrameMasks[targetFrame] = localMask }
      netplayClient?.sendInputFrame(targetFrame, localMask)
      val scheduledLocalMask = synchronized(localFrameMasks) { localFrameMasks.remove(nextLockstepFrame) ?: 0 }
      val remoteMasks = synchronized(remoteFrameMasks) { remoteFrameMasks.remove(nextLockstepFrame) }
      val expectedRemoteMembers = sessionPlayerMemberIds.filter { it != localMemberId }
      if (remoteMasks == null || expectedRemoteMembers.any { it !in remoteMasks }) {
        lockstepHandler.postDelayed(this, 4L)
        return
      }
      appliedMasksByPort[localPlayerIndex] = applyMask(scheduledLocalMask, localPlayerIndex, appliedMasksByPort[localPlayerIndex] ?: 0)
      expectedRemoteMembers.forEach { remoteMemberId ->
        val port = sessionPlayerMemberIds.indexOf(remoteMemberId)
        appliedMasksByPort[port] = applyMask(remoteMasks.getValue(remoteMemberId), port, appliedMasksByPort[port] ?: 0)
      }
      retroView.requestRender()
      nextLockstepFrame += 1L
      lockstepHandler.postDelayed(this, NETPLAY_FRAME_INTERVAL_MS)
    }
  }

  private fun currentLocalMask(): Int = PS1_LOCKSTEP_KEYS.foldIndexed(0) { index, mask, keyCode ->
    if (keyCode in localPressedKeys) mask or (1 shl index) else mask
  }

  private fun applyMask(nextMask: Int, port: Int, previousMask: Int): Int {
    PS1_LOCKSTEP_KEYS.forEachIndexed { index, keyCode ->
      val previousDown = previousMask and (1 shl index) != 0
      val nextDown = nextMask and (1 shl index) != 0
      if (previousDown != nextDown) retroView.sendKeyEvent(if (nextDown) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, keyCode, port)
    }
    return nextMask
  }

  /** Saves a complete emulation snapshot without uploading the game or state to a server. */
  private fun saveState(silent: Boolean = false) {
    runStateAction("Saving game state…", silent) {
      val state = retroView.serializeState()
      require(state.isNotEmpty()) { "Could not create a save state for this game." }
      val temporaryFile = File(stateFile.parentFile, "${stateFile.name}.tmp")
      FileOutputStream(temporaryFile).use { output ->
        output.write(state)
        output.fd.sync()
      }
      if (!temporaryFile.renameTo(stateFile)) {
        temporaryFile.copyTo(stateFile, overwrite = true)
        temporaryFile.delete()
      }
      "State saved locally (${formatByteCount(state.size)})."
    }
  }

  /** Restores the most recent locally saved emulation snapshot for this game. */
  private fun loadState() {
    runStateAction("Loading game state…", silent = false) {
      require(stateFile.isFile() && stateFile.length() > 0L) { "No saved state exists for this game yet." }
      val restored = retroView.unserializeState(stateFile.readBytes())
      require(restored) { "Could not load the state; it may not match the current core version." }
      "Latest saved state loaded successfully."
    }
  }

  private fun runStateAction(startMessage: String, silent: Boolean, action: () -> String) {
    if (stateActionInProgress) {
      if (!silent) showToast("Wait for the current save or load action to finish.")
      return
    }
    stateActionInProgress = true
    if (!silent) showToast(startMessage)
    Thread {
      val result = runCatching(action)
      runOnUiThread {
        stateActionInProgress = false
        if (!silent) showToast(result.getOrElse { error -> error.message ?: "Could not complete the state action." })
      }
    }.start()
  }

  private fun stateKeyForGame(gameFile: File): String {
    val originalName = intent.getStringExtra(EXTRA_GAME_NAME).orEmpty().lowercase()
    val identity = "$originalName:${gameFile.length()}"
    return MessageDigest.getInstance("SHA-256")
      .digest(identity.toByteArray(Charsets.UTF_8))
      .joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
  }

  private fun formatByteCount(bytes: Int): String = when {
    bytes >= 1024 * 1024 -> String.format("%.1f MB", bytes / (1024f * 1024f))
    bytes >= 1024 -> String.format("%.0f KB", bytes / 1024f)
    else -> "$bytes B"
  }

  private fun showToast(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  }

  private fun ps1ErrorMessage(errorCode: Int, gameName: String): String = when (errorCode) {
    GLRetroView.ERROR_LOAD_LIBRARY -> "Could not load the PCSX ReARMed core. Reinstall the latest complete APK and try again."
    GLRetroView.ERROR_LOAD_GAME -> "Could not open $gameName. Choose a complete BIN, ISO, CHD, or PBP file; a CUE file needs its companion BIN in the same folder."
    GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "This device does not support the graphics configuration required for PS1. Update Android or try a newer device."
    else -> "The PS1 player stopped while starting the game (code $errorCode). Check that the file is complete and add a compatible local BIOS if needed."
  }

  private fun createHeader(): LinearLayout {
    return LinearLayout(this).apply {
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(14), dp(8), dp(14), dp(8))
      setBackgroundColor(Color.argb(105, 4, 12, 22))
      addView(button(if (settingsMode) "✓" else "×", KeyEvent.KEYCODE_UNKNOWN, dp(38), onClick = { if (settingsMode) finishControlSetup() else finish() }))
      addView(TextView(this@PS1PlayerActivity).apply {
        text = if (settingsMode) "PS1 · CONTROLLER SETTINGS" else "PS1 · ${if (lockstepNetplay) "NETPLAY" else "LOCAL PLAY"}"
        setTextColor(Color.rgb(210, 241, 255))
        textSize = 13f
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(12), 0, 0, 0)
      }, LinearLayout.LayoutParams(0, dp(38), 1f))
    }
  }

  private fun finishControlSetup() {
    controlEditMode = false
    settingsMode = false
    retroView.renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
    selectedEditableControl = null
    root.removeView(topControls)
    controlsContainer.removeAllViews()
    controlsContainer.addView(createControls(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
    controlsContainer.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM)
    attachGameplayOverlay()
    showToast("PS1 controls were saved for this orientation. You are ready to play.")
  }
  private fun beginGameplayEditor() {
    if (settingsMode) return
    settingsMode = true
    controlEditMode = true
    retroView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    topControls.removeAllViews()
    topControls.addView(createTopControls(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
    root.addView(topControls, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP))
    controlsContainer.removeAllViews()
    controlsContainer.addView(createControls(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    controlsContainer.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.FILL)
    attachGameplayOverlay()
    showToast("Edit mode: drag or pinch every control, CHAT, MIC, SPEAKER, OPTIONS, or the game screen. Tap ✓ when finished.")
  }

  private fun resizeSelectedControl(delta: Float) {
    val selected = selectedEditableControl
    if (selected == null) {
      showToast("Tap a control in EDIT mode, then use − or + to resize that control only.")
      return
    }
    val (view, controlId) = selected
    val next = max(.35f, view.scaleX + delta)
    view.scaleX = next
    view.scaleY = next
    persistControlLayout(view, controlId)
    showToast("$controlId size ${(next * 100).toInt()}% saved.")
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
    if (height > root.height) { height = root.height; width = (height * ratio).toInt() }
    gameFrame.layoutParams = FrameLayout.LayoutParams(width, height, Gravity.CENTER)
  }

  private fun screenLayoutKey(): String {
    val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
    return "ps1.$orientation.screen"
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
    controlPreferences.edit().putFloat("$key.x", gameFrame.translationX).putFloat("$key.y", gameFrame.translationY).putFloat("$key.scale", gameFrame.scaleX).apply()
  }

  private fun enableScreenEditor() {
    var downX = 0f; var downY = 0f; var originX = 0f; var originY = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        if (!settingsMode) return false
        val next = max(.35f, gameFrame.scaleX * detector.scaleFactor)
        gameFrame.scaleX = next; gameFrame.scaleY = next
        return true
      }
    })
    retroView.setOnTouchListener { _, event ->
      if (!settingsMode) return@setOnTouchListener false
      scaler.onTouchEvent(event)
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> { downX = event.rawX; downY = event.rawY; originX = gameFrame.translationX; originY = gameFrame.translationY; showToast("Screen selected. Drag or pinch to resize it for this orientation.") }
        MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) { gameFrame.translationX = originX + event.rawX - downX; gameFrame.translationY = originY + event.rawY - downY }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> persistScreenLayout()
      }
      true
    }
  }

  private fun attachGameplayOverlay() {
    gameplayHud.forEach { root.removeView(it) }
    gameplayHud.clear()
    val actions = listOf(
      Triple("CHAT", "chat") { showChatDialog() },
      Triple(if (micOverlayMuted) "MIC×" else "MIC", "microphone") { toggleOverlayMicrophone() },
      Triple(if (speakerOverlayEnabled) "SPK" else "SPK×", "speaker") { toggleOverlaySpeaker() },
      Triple("OPTIONS", "options") { showGameplayOptions() },
    )
    actions.forEachIndexed { index, (label, id, action) ->
      val button = DraggableHudButton(this, controlPreferences, "ps1", id, label, editing = { settingsMode }, action = action).also { it.restore() }
      if (id == "microphone") micOverlayButton = button
      if (id == "speaker") speakerOverlayButton = button
      root.addView(button, button.layoutParams(Gravity.RIGHT or Gravity.TOP, right = 12 + index * 58, top = 12))
      gameplayHud += button
    }
  }

  private fun toggleOverlayMicrophone() {
    if (netplayClient == null) {
      showToast("In-game microphone is available in a NetPlay session only.")
      return
    }
    micOverlayMuted = !micOverlayMuted
    micOverlayButton?.text = if (micOverlayMuted) "MIC×" else "MIC"
    onOverlayAction?.invoke("toggle-microphone", micOverlayMuted)
    showToast(if (micOverlayMuted) "Microphone muted." else "Microphone enabled.")
  }

  private fun toggleOverlaySpeaker() {
    speakerOverlayEnabled = !speakerOverlayEnabled
    speakerOverlayButton?.text = if (speakerOverlayEnabled) "SPK" else "SPK×"
    onOverlayAction?.invoke("toggle-speaker", !speakerOverlayEnabled)
    showToast(if (speakerOverlayEnabled) "Phone speaker enabled." else "Automatic audio output enabled.")
  }

  private fun showGameplayOptions() {
    android.app.AlertDialog.Builder(this)
      .setItems(arrayOf("EDIT CONTROLS & SCREEN", "SAVE GAME", "LOAD GAME", "EXIT GAME")) { _, index ->
        when (index) { 0 -> beginGameplayEditor(); 1 -> saveState(silent = false); 2 -> loadState(); else -> finish() }
      }
      .show()
  }

  private fun showChatDialog() {
    if (netplayClient == null) {
      showToast("In-game chat is available in a NetPlay session only.")
      return
    }
    val input = EditText(this).apply {
      hint = "Write a message to the other player…"
      setSingleLine(false)
      maxLines = 3
      setTextColor(Color.WHITE)
      setHintTextColor(Color.LTGRAY)
      setPadding(dp(16), dp(10), dp(16), dp(10))
    }
    AlertDialog.Builder(this)
      .setTitle("Room message")
      .setView(input)
      .setNegativeButton("Cancel", null)
      .setPositiveButton("Send") { _, _ ->
        netplayClient?.sendChat(input.text?.toString().orEmpty())
      }
      .show()
  }

  /** Matsu-style functional placement: shoulders above, gamepad controls along the lower edge. */
  private fun createTopControls(): FrameLayout = FrameLayout(this).apply {
    setPadding(dp(14), dp(8), dp(14), dp(4))
    if (!settingsMode) addView(createShoulderPair(controlProfile.shoulderButtons[0], controlProfile.shoulderButtons[1]), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.LEFT or Gravity.TOP,
    ))
    addView(createHeader(), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL or Gravity.TOP,
    ))
    if (!settingsMode) addView(createShoulderPair(controlProfile.shoulderButtons[3], controlProfile.shoulderButtons[2]), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.RIGHT or Gravity.TOP,
    ))
  }

  private fun createShoulderPair(first: EmulatorTouchButton, second: EmulatorTouchButton): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    alpha = .88f
    addView(button(first, dp(56), dp(56), TouchButtonShape.CIRCLE), LinearLayout.LayoutParams(dp(56), dp(56)).apply { setMargins(dp(3), 0, dp(3), 0) })
    addView(button(second, dp(56), dp(56), TouchButtonShape.CIRCLE), LinearLayout.LayoutParams(dp(56), dp(56)).apply { setMargins(dp(3), 0, dp(3), 0) })
  }

  private fun createControls(): FrameLayout {
    if (settingsMode) return createFreeControlCanvas()
    val wrapper = FrameLayout(this).apply {
      setPadding(dp(14), dp(6), dp(14), dp(12))
      setBackgroundColor(Color.argb(25, 4, 12, 22))
    }
    val padSize = dp(58)
    wrapper.addView(createDirectionalPad(padSize), FrameLayout.LayoutParams(padSize * 3, padSize * 3, Gravity.LEFT or Gravity.BOTTOM))
    wrapper.addView(createMiddleControls(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM))
    wrapper.addView(createActionButtons(padSize), FrameLayout.LayoutParams(padSize * 3, padSize * 3, Gravity.RIGHT or Gravity.BOTTOM))
    return wrapper
  }

  private fun createFreeControlCanvas(): FrameLayout = FrameLayout(this).apply {
    val size = dp(58)
    fun add(control: EmulatorTouchButton, gravity: Int, left: Int = 0, top: Int = 0, right: Int = 0, bottom: Int = 0, shape: TouchButtonShape = TouchButtonShape.CIRCLE) {
      addView(button(control, size, size, shape), FrameLayout.LayoutParams(size, size, gravity).apply {
        leftMargin = dp(left); topMargin = dp(top); rightMargin = dp(right); bottomMargin = dp(bottom)
      })
    }
    add(controlProfile.shoulderButtons[0], Gravity.LEFT or Gravity.TOP, left = 16, top = 72)
    add(controlProfile.shoulderButtons[1], Gravity.LEFT or Gravity.TOP, left = 82, top = 72)
    add(controlProfile.shoulderButtons[3], Gravity.RIGHT or Gravity.TOP, right = 82, top = 72)
    add(controlProfile.shoulderButtons[2], Gravity.RIGHT or Gravity.TOP, right = 16, top = 72)
    add(controlProfile.directions.up, Gravity.LEFT or Gravity.BOTTOM, left = 74, bottom = 168, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.directions.left, Gravity.LEFT or Gravity.BOTTOM, left = 16, bottom = 110, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.directions.right, Gravity.LEFT or Gravity.BOTTOM, left = 132, bottom = 110, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.directions.down, Gravity.LEFT or Gravity.BOTTOM, left = 74, bottom = 52, shape = TouchButtonShape.DIRECTION)
    add(controlProfile.actionButtons[0], Gravity.RIGHT or Gravity.BOTTOM, right = 74, bottom = 168)
    add(controlProfile.actionButtons[2], Gravity.RIGHT or Gravity.BOTTOM, right = 132, bottom = 110)
    add(controlProfile.actionButtons[1], Gravity.RIGHT or Gravity.BOTTOM, right = 16, bottom = 110)
    add(controlProfile.actionButtons[3], Gravity.RIGHT or Gravity.BOTTOM, right = 74, bottom = 52)
    add(controlProfile.systemButtons[0], Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, right = 64, bottom = 40)
    add(controlProfile.systemButtons[1], Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM, left = 64, bottom = 40)
  }

  /** A conventional four-way D-pad, matching the reference layout and editable per direction. */
  private fun createDirectionalPad(size: Int): FrameLayout = FrameLayout(this).apply {
    layoutDirection = View.LAYOUT_DIRECTION_LTR
    addView(button(controlProfile.directions.up, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.CENTER_HORIZONTAL))
    addView(button(controlProfile.directions.down, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    addView(button(controlProfile.directions.left, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.LEFT))
    addView(button(controlProfile.directions.right, size, size, TouchButtonShape.DIRECTION), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.RIGHT))
  }

  private fun createMiddleControls(): LinearLayout {
    return LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      alpha = .88f
      layoutDirection = View.LAYOUT_DIRECTION_LTR
      addView(row(
        button(controlProfile.systemButtons[0], dp(56)),
        button(controlProfile.systemButtons[1], dp(56)),
      ))
    }
  }

  private fun createActionButtons(size: Int): FrameLayout {
    return FrameLayout(this).apply {
      layoutDirection = View.LAYOUT_DIRECTION_LTR
      addView(button(controlProfile.actionButtons[0], size, size, TouchButtonShape.CIRCLE), FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.CENTER_HORIZONTAL))
      addView(button(controlProfile.actionButtons[2], size, size, TouchButtonShape.CIRCLE), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.LEFT))
      addView(button(controlProfile.actionButtons[1], size, size, TouchButtonShape.CIRCLE), FrameLayout.LayoutParams(size, size, Gravity.CENTER_VERTICAL or Gravity.RIGHT))
      addView(button(controlProfile.actionButtons[3], size, size, TouchButtonShape.CIRCLE), FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    }
  }

  private fun row(vararg children: View): LinearLayout {
    return LinearLayout(this).apply {
      gravity = Gravity.CENTER
      children.forEach { child ->
        addView(child, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
          setMargins(dp(3), dp(2), dp(3), dp(2))
        })
      }
    }
  }

  private enum class TouchButtonShape { CIRCLE, DIRECTION }

  private fun button(control: EmulatorTouchButton, width: Int, height: Int = dp(40), shape: TouchButtonShape = TouchButtonShape.CIRCLE): TextView =
    button(control.label, control.keyCode, width, height, shape).also { view -> attachEditableControl(view, control.id, control.keyCode) }

  private fun button(label: String, keyCode: Int, width: Int, height: Int = dp(40), shape: TouchButtonShape = TouchButtonShape.CIRCLE, onClick: (() -> Unit)? = null): TextView {
    return TextView(this).apply {
      val side = max(width, height)
      text = label
      textSize = if (label.length == 1) 21f else 10f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = controlBackground(shape)
      isClickable = true
      isFocusable = true
      setPadding(dp(4), 0, dp(4), 0)
      layoutParams = LinearLayout.LayoutParams(side, side)
      if (onClick != null) {
        setOnClickListener { onClick() }
      } else {
        setOnTouchListener { _, event ->
          when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> sendLocalKey(KeyEvent.ACTION_DOWN, keyCode)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> sendLocalKey(KeyEvent.ACTION_UP, keyCode)
          }
          true
        }
      }
    }
  }

  private fun attachEditableControl(view: TextView, controlId: String, keyCode: Int) {
    var downX = 0f
    var downY = 0f
    var originX = 0f
    var originY = 0f
    val scaler = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        if (!controlEditMode) return false
        val next = max(.35f, view.scaleX * detector.scaleFactor)
        view.scaleX = next
        view.scaleY = next
        return true
      }
    })
    view.post {
      val key = controlLayoutKey(controlId)
      view.translationX = controlPreferences.getFloat("$key.x", 0f)
      view.translationY = controlPreferences.getFloat("$key.y", 0f)
      val storedScale = controlPreferences.getFloat("$key.scale", 1f)
      view.scaleX = storedScale
      view.scaleY = storedScale
    }
    view.setOnTouchListener { _, event ->
      scaler.onTouchEvent(event)
      if (controlEditMode) {
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            selectedEditableControl = view to controlId
            showToast("$controlId selected. Drag or pinch to resize it for this orientation.")
            downX = event.rawX
            downY = event.rawY
            originX = view.translationX
            originY = view.translationY
          }
          MotionEvent.ACTION_MOVE -> if (!scaler.isInProgress) {
            view.translationX = originX + event.rawX - downX
            view.translationY = originY + event.rawY - downY
          }
          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> persistControlLayout(view, controlId)
        }
        return@setOnTouchListener true
      }
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> sendLocalKey(KeyEvent.ACTION_DOWN, keyCode)
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> sendLocalKey(KeyEvent.ACTION_UP, keyCode)
      }
      true
    }
  }

  private fun controlLayoutKey(controlId: String): String {
    val orientation = if (resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait"
    return "ps1.$orientation.$controlId"
  }

  private fun persistControlLayout(view: View, controlId: String) {
    val key = controlLayoutKey(controlId)
    controlPreferences.edit()
      .putFloat("$key.x", view.translationX)
      .putFloat("$key.y", view.translationY)
      .putFloat("$key.scale", view.scaleX)
      .apply()
  }

  private fun controlBackground(shape: TouchButtonShape): GradientDrawable = GradientDrawable().apply {
    this.shape = if (shape == TouchButtonShape.CIRCLE) GradientDrawable.OVAL else GradientDrawable.RECTANGLE
    if (shape == TouchButtonShape.DIRECTION) cornerRadius = dp(12).toFloat()
    setColor(Color.argb(38, 4, 12, 22))
    setStroke(dp(2), Color.argb(205, 218, 239, 255))
  }

  private fun showError(message: String) {
    setContentView(TextView(this).apply {
      text = message
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(5, 8, 14))
      textSize = 18f
      setPadding(dp(28), dp(28), dp(28), dp(28))
      setOnClickListener { finish() }
    })
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
