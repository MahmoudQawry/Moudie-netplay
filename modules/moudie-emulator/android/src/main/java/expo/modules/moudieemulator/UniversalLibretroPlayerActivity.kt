package expo.modules.moudieemulator

import android.app.AlertDialog
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Choreographer
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
    const val EXTRA_PLAYER_SETTINGS_MODE = "expo.modules.moudieemulator.PLAYER_SETTINGS_MODE"
    const val EXTRA_NETPLAY_SERVER_URL = "expo.modules.moudieemulator.NETPLAY_SERVER_URL"
    const val EXTRA_NETPLAY_ROOM_ID = "expo.modules.moudieemulator.NETPLAY_ROOM_ID"
    const val EXTRA_NETPLAY_MEMBER_ID = "expo.modules.moudieemulator.NETPLAY_MEMBER_ID"
    const val EXTRA_NETPLAY_MEMBER_TOKEN = "expo.modules.moudieemulator.NETPLAY_MEMBER_TOKEN"
    const val EXTRA_NETPLAY_FINGERPRINT = "expo.modules.moudieemulator.NETPLAY_FINGERPRINT"
    const val EXTRA_NETPLAY_CORE_VERSION = "expo.modules.moudieemulator.NETPLAY_CORE_VERSION"
    const val EXTRA_NETPLAY_PLAYER = "expo.modules.moudieemulator.NETPLAY_PLAYER"
    private const val NETPLAY_INPUT_DELAY_FRAMES = 3L
    private const val NETPLAY_FRAME_INTERVAL_MS = 17L
  }

  private lateinit var retroView: GLRetroView
  private lateinit var root: FrameLayout
  private lateinit var gameFrame: FrameLayout
  private lateinit var definition: NativeCoreCatalog.Definition
  private lateinit var stateFile: File
  private lateinit var preferences: android.content.SharedPreferences
  private var customizationEnabled = false
  private var settingsMode = false
  private val controlButtons = mutableListOf<MovableControlButton>()
  private var selectedControl: MovableControlButton? = null
  private var selectedHud: DraggableHudButton? = null
  private var aspectMode = "fit"
  private var micMuted = true
  private var micOverlayButton: TextView? = null
  private var speakerEnabled = false
  private var speakerOverlayButton: TextView? = null
  private lateinit var headerView: LinearLayout
  private val gameplayHud = mutableListOf<View>()
  private var stateActionInProgress = false
  private var universalNetplayClient: UniversalNetplayClient? = null
  private var localPlayerIndex = 0
  private var lockstepNetplay = false
  private var netplayInputDelayFrames = NETPLAY_INPUT_DELAY_FRAMES
  private var netplayQuality = NetplayQuality()
  @Volatile private var lastNetplaySyncId = -1L
  private val lockstepActive = AtomicBoolean(false)
  private val lockstepHandler = Handler(Looper.getMainLooper())
  private val bootstrapHandler = Handler(Looper.getMainLooper())
  private var bootstrapRequestAttempts = 0
  private val remoteFrameMasks = TreeMap<Long, MutableMap<Int, Int>>()
  private val localFrameMasks = TreeMap<Long, Int>()
  private val localPressedKeys = mutableSetOf<Int>()
  private var nextLockstepFrame = 0L
  private var appliedLocalMask = 0
  private val appliedMasksByPort = mutableMapOf<Int, Int>()
  private var localMemberId = 0
  private var sessionPlayerMemberIds: List<Int> = emptyList()
  private lateinit var netplayKeyCodes: IntArray
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
    netplayKeyCodes = controlKeyCodes(definition.profile)
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
    settingsMode = intent.getBooleanExtra(EXTRA_PLAYER_SETTINGS_MODE, false)
    customizationEnabled = settingsMode
    aspectMode = intent.getStringExtra(EXTRA_PLAYER_ASPECT_RATIO)
      ?.takeIf { it in setOf("fit", "4:3", "16:9") }
      ?: preferences.getString("${definition.system}.aspect", "fit") ?: "fit"
    val savesDirectory = File(filesDir, "moudie-${definition.system}/saves").apply { mkdirs() }
    val statesDirectory = File(filesDir, "moudie-${definition.system}/states").apply { mkdirs() }
    val systemDirectory = NativeCoreCatalog.prepareSystemDirectory(
      this,
      definition,
      File(filesDir, definition.systemDirectory).apply { mkdirs() },
    )
    stateFile = File(statesDirectory, "${stableStateKey(gameFile)}.state")

    val gameData = GLRetroViewData(this).apply {
      coreFilePath = coreFile.absolutePath
      gameFilePath = gameFile.absolutePath
      this.systemDirectory = systemDirectory.absolutePath
      this.savesDirectory = savesDirectory.absolutePath
      // Sharp is intentionally retained for pixel-native 8/16-bit systems. PPSSPP
      // renders through its own hardware pipeline, so system assets and the core's
      // internal resolution determine PSP clarity rather than a bitmap upscale.
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
    headerView = createHeader().also { it.tag = "moudie-player-header" }
    if (settingsMode) root.addView(headerView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(48), Gravity.TOP))
    metricPill = createMetricPill()
    root.addView(metricPill, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      dp(32),
      Gravity.TOP or Gravity.CENTER_HORIZONTAL,
    ).apply { topMargin = dp(14) })
    updateMetricPill(null)
    addController()
    attachGameplaySocialOverlay()
    setContentView(root)
    root.post { applyAspectRatio(); restoreScreenLayout(); enableScreenEditor() }
    if (!settingsMode) connectNetplayIfConfigured()
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) sendLocalKey(KeyEvent.ACTION_DOWN, keyCode)
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (::retroView.isInitialized) sendLocalKey(KeyEvent.ACTION_UP, keyCode)
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
