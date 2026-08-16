package expo.modules.moudieemulator

import android.content.Context
import android.app.AlertDialog
import android.content.pm.ActivityInfo
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.Paint
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
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
import java.util.concurrent.atomic.AtomicBoolean
import java.util.TreeMap
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

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
  private lateinit var stateFile: File
  private val controlProfile = EmulatorControlProfiles.PS1
  private var netplayClient: Ps1NetplayClient? = null
  private var localPlayerIndex = 0
  @Volatile private var lastNetplaySyncId = -1L
  private val lockstepActive = AtomicBoolean(false)
  private val lockstepHandler = Handler(Looper.getMainLooper())
  private val bootstrapHandler = Handler(Looper.getMainLooper())
  private var bootstrapRequestAttempts = 0
  private val remoteFrameMasks = TreeMap<Long, Int>()
  private val localFrameMasks = TreeMap<Long, Int>()
  private val localPressedKeys = mutableSetOf<Int>()
  private var nextLockstepFrame = 0L
  private var appliedLocalMask = 0
  private var appliedRemoteMask = 0
  private var lockstepNetplay = false
  private var micOverlayMuted = true
  private var micOverlayButton: TextView? = null
  @Volatile
  private var stateActionInProgress = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
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

    val gamePath = intent.getStringExtra(EXTRA_GAME_PATH).orEmpty()
    val gameFile = File(gamePath)
    if (!gameFile.isFile || !gameFile.canRead()) {
      showError("تعذر قراءة ملف لعبة PS1. اختره مجدداً من شاشة الغرفة.")
      return
    }

    val coreFile = NativeCoreLocator.findPs1Core(this)
    if (coreFile == null) {
      showError("تعذر العثور على محرك PS1 داخل التطبيق. ثبّت أحدث ملف APK كاملاً ثم أعد المحاولة.")
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
    retroView.renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
    lifecycle.addObserver(retroView)
    lifecycleScope.launch {
      retroView.getGLRetroErrors().collect { errorCode ->
        showError(ps1ErrorMessage(errorCode, gameFile.name))
      }
    }

    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    root.addView(
      retroView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )
    root.addView(createTopControls(), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.TOP,
    ))
    root.addView(createControls(), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.BOTTOM,
    ))
    root.addView(createInGameOverlay(), FrameLayout.LayoutParams(
      dp(52),
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.RIGHT or Gravity.CENTER_VERTICAL,
    ).apply { rightMargin = dp(12) })
    setContentView(root)
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
    if (serverUrl.isBlank() || roomId <= 0 || memberId <= 0 || memberToken.length < 20 || fingerprint.length != 64 || player !in 1..2) return
    localPlayerIndex = player - 1
    lockstepNetplay = true
    retroView.requestRender()
    netplayClient = Ps1NetplayClient(
      Ps1NetplayConfig(serverUrl, roomId, memberId, memberToken, fingerprint, NETPLAY_CORE_VERSION, localPlayerIndex),
      onBootstrap = {
        runOnUiThread {
          showToast(if (localPlayerIndex == 0) "تم التحقق من الجاهزية. جارٍ إرسال حالة البداية الموحدة." else "تم التحقق من الجاهزية. جارٍ انتظار حالة البداية من المضيف.")
          if (localPlayerIndex == 0) sendInitialNetplayState() else startBootstrapRetry()
        }
      },
      onSessionGo = { startAt -> runOnUiThread { startLockstep(startAt) } },
      onStateRequest = { if (localPlayerIndex == 0) sendInitialNetplayState() },
      onRemoteInput = { frame, mask ->
        synchronized(remoteFrameMasks) { remoteFrameMasks[frame] = mask }
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
      }.onSuccess { encoded ->
        if (encoded.isNotBlank() && encoded.length <= 4_300_000) netplayClient?.sendState(encoded, 0L, "gzip-base64")
      }
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
            if (syncId == 0L) showToast("تمت مطابقة حالة البداية. انتظر إشارة البدء المشتركة.")
          }
          else showToast("وصلت حالة PS1 لكن تعذر تطبيقها؛ أعد طلبها من الغرفة.")
        } }
    }.start()
  }

  private fun gzip(source: ByteArray): ByteArray = ByteArrayOutputStream().use { output ->
    GZIPOutputStream(output).use { it.write(source) }
    output.toByteArray()
  }

  private fun gunzip(source: ByteArray): ByteArray = GZIPInputStream(ByteArrayInputStream(source)).use { it.readBytes() }

  private fun startLockstep(startAt: Long) {
    if (localPlayerIndex == 1 && lastNetplaySyncId < 0L) {
      showToast("لم تصل حالة البداية بعد؛ جارٍ طلبها مجدداً قبل تشغيل الجلسة.")
      startBootstrapRetry()
      return
    }
    if (!lockstepActive.compareAndSet(false, true)) return
    stopBootstrapRetry()
    nextLockstepFrame = 0L
    appliedLocalMask = 0
    appliedRemoteMask = 0
    synchronized(remoteFrameMasks) { remoteFrameMasks.clear() }
    synchronized(localFrameMasks) {
      localFrameMasks.clear()
      repeat(NETPLAY_INPUT_DELAY_FRAMES.toInt()) { frame ->
        localFrameMasks[frame.toLong()] = 0
        netplayClient?.sendInputFrame(frame.toLong(), 0)
      }
    }
    lockstepHandler.postDelayed(lockstepTick, max(0L, startAt - System.currentTimeMillis()))
    showToast("بدأت الجلسة المشتركة دون إعادة تحميل لقطات قديمة.")
  }

  private fun stopLockstep() {
    lockstepActive.set(false)
    lockstepHandler.removeCallbacksAndMessages(null)
  }

  private val bootstrapRetry = object : Runnable {
    override fun run() {
      if (localPlayerIndex != 1 || lastNetplaySyncId >= 0L || lockstepActive.get()) return
      if (bootstrapRequestAttempts >= 20) {
        showToast("تأخر تأكيد حالة البداية. تأكد من بقاء الجهازين داخل اللعبة ثم أعد طلب بدء الجلسة.")
        return
      }
      bootstrapRequestAttempts += 1
      netplayClient?.requestState(-1L)
      bootstrapHandler.postDelayed(this, 1_000L)
    }
  }

  private fun startBootstrapRetry() {
    if (localPlayerIndex != 1 || lastNetplaySyncId >= 0L || lockstepActive.get()) return
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
      val remoteMask = synchronized(remoteFrameMasks) { remoteFrameMasks.remove(nextLockstepFrame) }
      if (remoteMask == null) {
        lockstepHandler.postDelayed(this, 4L)
        return
      }
      appliedLocalMask = applyMask(scheduledLocalMask, localPlayerIndex, appliedLocalMask)
      appliedRemoteMask = applyMask(remoteMask, 1 - localPlayerIndex, appliedRemoteMask)
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
    runStateAction("جارٍ حفظ حالة اللعبة…", silent) {
      val state = retroView.serializeState()
      require(state.isNotEmpty()) { "تعذر إنشاء حالة حفظ لهذه اللعبة." }
      val temporaryFile = File(stateFile.parentFile, "${stateFile.name}.tmp")
      FileOutputStream(temporaryFile).use { output ->
        output.write(state)
        output.fd.sync()
      }
      if (!temporaryFile.renameTo(stateFile)) {
        temporaryFile.copyTo(stateFile, overwrite = true)
        temporaryFile.delete()
      }
      "تم حفظ الحالة محلياً (${formatByteCount(state.size)})."
    }
  }

  /** Restores the most recent locally saved emulation snapshot for this game. */
  private fun loadState() {
    runStateAction("جارٍ استرجاع حالة اللعبة…", silent = false) {
      require(stateFile.isFile() && stateFile.length() > 0L) { "لا توجد حالة محفوظة لهذه اللعبة بعد." }
      val restored = retroView.unserializeState(stateFile.readBytes())
      require(restored) { "تعذر استرجاع الحالة؛ قد تكون غير متوافقة مع إصدار المحرك الحالي." }
      "تم استرجاع آخر حالة محفوظة بنجاح."
    }
  }

  private fun runStateAction(startMessage: String, silent: Boolean, action: () -> String) {
    if (stateActionInProgress) {
      if (!silent) showToast("انتظر حتى تكتمل عملية الحفظ أو الاسترجاع الحالية.")
      return
    }
    stateActionInProgress = true
    if (!silent) showToast(startMessage)
    Thread {
      val result = runCatching(action)
      runOnUiThread {
        stateActionInProgress = false
        if (!silent) showToast(result.getOrElse { error -> error.message ?: "تعذر إكمال عملية الحالة." })
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
    GLRetroView.ERROR_LOAD_LIBRARY -> "تعذر تحميل محرك PCSX ReARMed. أعد تثبيت أحدث APK كاملاً ثم أعد المحاولة."
    GLRetroView.ERROR_LOAD_GAME -> "تعذر فتح $gameName. اختر ملف BIN أو CHD أو PBP كاملاً؛ ملف CUE يحتاج ملف BIN المرافق في المجلد نفسه."
    GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "جهازك لا يدعم إعداد الرسوم المطلوب لتشغيل PS1. حدّث نظام Android أو جرّب جهازاً أحدث."
    else -> "توقف مشغّل PS1 أثناء بدء اللعبة (رمز $errorCode). تأكد من أن الملف كامل، ثم أضف BIOS محلياً متوافقاً إذا استمر الخطأ."
  }

  private fun createHeader(): LinearLayout {
    return LinearLayout(this).apply {
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(14), dp(8), dp(14), dp(8))
      setBackgroundColor(Color.argb(105, 4, 12, 22))
      addView(button("×", KeyEvent.KEYCODE_UNKNOWN, dp(38), onClick = { finish() }))
      addView(TextView(this@PS1PlayerActivity).apply {
        text = "PS1 · تشغيل محلي"
        setTextColor(Color.rgb(210, 241, 255))
        textSize = 13f
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(12), 0, 0, 0)
      }, LinearLayout.LayoutParams(0, dp(38), 1f))
      addView(button("استرجاع", KeyEvent.KEYCODE_UNKNOWN, dp(64), onClick = { loadState() }))
      addView(button("حفظ", KeyEvent.KEYCODE_UNKNOWN, dp(46), onClick = { saveState() }))
    }
  }

  private fun createInGameOverlay(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
    alpha = .9f
    addView(button("▣", KeyEvent.KEYCODE_UNKNOWN, dp(48), dp(48), onClick = { showChatDialog() }), LinearLayout.LayoutParams(dp(48), dp(48)).apply { bottomMargin = dp(10) })
    micOverlayButton = button("MIC×", KeyEvent.KEYCODE_UNKNOWN, dp(48), dp(48), onClick = { toggleOverlayMicrophone() })
    addView(micOverlayButton, LinearLayout.LayoutParams(dp(48), dp(48)))
  }

  private fun toggleOverlayMicrophone() {
    if (netplayClient == null) {
      showToast("الميكروفون داخل اللعب متاح في جلسة NetPlay فقط.")
      return
    }
    micOverlayMuted = !micOverlayMuted
    micOverlayButton?.text = if (micOverlayMuted) "MIC×" else "MIC"
    onOverlayAction?.invoke("toggle-microphone", micOverlayMuted)
    showToast(if (micOverlayMuted) "تم كتم الميكروفون ×" else "تم تشغيل الميكروفون")
  }

  private fun showChatDialog() {
    if (netplayClient == null) {
      showToast("الدردشة داخل اللعب متاحة في جلسة NetPlay فقط.")
      return
    }
    val input = EditText(this).apply {
      hint = "اكتب رسالة للاعب الآخر…"
      setSingleLine(false)
      maxLines = 3
      setTextColor(Color.WHITE)
      setHintTextColor(Color.LTGRAY)
      setPadding(dp(16), dp(10), dp(16), dp(10))
    }
    AlertDialog.Builder(this)
      .setTitle("رسالة الغرفة")
      .setView(input)
      .setNegativeButton("إلغاء", null)
      .setPositiveButton("إرسال") { _, _ ->
        netplayClient?.sendChat(input.text?.toString().orEmpty())
      }
      .show()
  }

  /** Matsu-style functional placement: shoulders above, gamepad controls along the lower edge. */
  private fun createTopControls(): FrameLayout = FrameLayout(this).apply {
    setPadding(dp(14), dp(8), dp(14), dp(4))
    addView(createShoulderPair(controlProfile.shoulderButtons[0], controlProfile.shoulderButtons[1]), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.LEFT or Gravity.TOP,
    ))
    addView(createHeader(), FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL or Gravity.TOP,
    ))
    addView(createShoulderPair(controlProfile.shoulderButtons[3], controlProfile.shoulderButtons[2]), FrameLayout.LayoutParams(
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
    val wrapper = FrameLayout(this).apply {
      setPadding(dp(14), dp(6), dp(14), dp(12))
      setBackgroundColor(Color.argb(25, 4, 12, 22))
    }
    val padSize = dp(58)
    wrapper.addView(createAnalogStick(padSize * 3), FrameLayout.LayoutParams(padSize * 3, padSize * 3, Gravity.LEFT or Gravity.BOTTOM))
    wrapper.addView(createMiddleControls(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM))
    wrapper.addView(createActionButtons(padSize), FrameLayout.LayoutParams(padSize * 3, padSize * 3, Gravity.RIGHT or Gravity.BOTTOM))
    return wrapper
  }

  /** Smooth left analog stick; motion is sent continuously to the libretro analog-left source. */
  private fun createAnalogStick(size: Int): View = AnalogStickView(this).apply {
    layoutParams = FrameLayout.LayoutParams(size, size)
  }

  private inner class AnalogStickView(context: Context) : View(context) {
    private val outerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.argb(44, 7, 22, 35)
    }
    private val outerStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(2).toFloat()
      color = Color.argb(214, 202, 235, 255)
    }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.argb(116, 74, 143, 184)
    }
    private val knobStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(2).toFloat()
      color = Color.argb(230, 220, 243, 255)
    }
    private var knobX = 0f
    private var knobY = 0f
    private var activeDirections = emptySet<Int>()

    override fun onDraw(canvas: Canvas) {
      super.onDraw(canvas)
      val centerX = width / 2f
      val centerY = height / 2f
      val radius = min(width, height) * .38f
      val knobRadius = radius * .42f
      canvas.drawCircle(centerX, centerY, radius, outerPaint)
      canvas.drawCircle(centerX, centerY, radius, outerStroke)
      canvas.drawCircle(centerX + knobX, centerY + knobY, knobRadius, knobPaint)
      canvas.drawCircle(centerX + knobX, centerY + knobY, knobRadius, knobStroke)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
      val centerX = width / 2f
      val centerY = height / 2f
      val radius = min(width, height) * .38f
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
          var deltaX = event.x - centerX
          var deltaY = event.y - centerY
          val distance = sqrt(deltaX * deltaX + deltaY * deltaY)
          if (distance > radius && distance > 0f) {
            val factor = radius / distance
            deltaX *= factor
            deltaY *= factor
          }
          knobX = deltaX
          knobY = deltaY
          updateDigitalDirections(deltaX / radius, deltaY / radius)
          invalidate()
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          knobX = 0f
          knobY = 0f
          updateDigitalDirections(0f, 0f)
          invalidate()
        }
      }
      return true
    }

    /**
     * PCSX ReARMed games commonly expect the digital D-pad. The visible analog stick therefore
     * translates its position to the same key presses as the former arrow buttons.
     */
    private fun updateDigitalDirections(x: Float, y: Float) {
      val threshold = .28f
      val desired = buildSet {
        if (x <= -threshold) add(KeyEvent.KEYCODE_DPAD_LEFT)
        if (x >= threshold) add(KeyEvent.KEYCODE_DPAD_RIGHT)
        if (y <= -threshold) add(KeyEvent.KEYCODE_DPAD_UP)
        if (y >= threshold) add(KeyEvent.KEYCODE_DPAD_DOWN)
      }
      (activeDirections - desired).forEach { keyCode ->
        sendLocalKey(KeyEvent.ACTION_UP, keyCode)
      }
      (desired - activeDirections).forEach { keyCode ->
        sendLocalKey(KeyEvent.ACTION_DOWN, keyCode)
      }
      activeDirections = desired
    }
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

  private enum class TouchButtonShape { CIRCLE }

  private fun button(control: EmulatorTouchButton, width: Int, height: Int = dp(40), shape: TouchButtonShape = TouchButtonShape.CIRCLE): TextView =
    button(control.label, control.keyCode, width, height, shape)

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

  private fun controlBackground(shape: TouchButtonShape): GradientDrawable = GradientDrawable().apply {
    this.shape = GradientDrawable.OVAL
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
