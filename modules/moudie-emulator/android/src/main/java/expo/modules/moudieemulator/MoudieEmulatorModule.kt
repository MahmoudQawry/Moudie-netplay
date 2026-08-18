package expo.modules.moudieemulator

import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/** Android entry point for the native Moudie emulator runtime. */
class MoudieEmulatorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MoudieEmulator")
    Events("nativeOverlayAction")

    Function("getRuntimeStatus") {
      val context = appContext.reactContext
      val availablePlayers = context?.let { runtimeContext ->
        NativeCoreCatalog.all().filter { definition -> NativeCoreCatalog.findCore(runtimeContext, definition) != null }.map { it.system }
      }.orEmpty()
      mapOf(
        "runtime" to "android-native",
        "supportedSystems" to NativeCoreCatalog.all().map { it.system },
        "availablePlayers" to availablePlayers,
        "nativeBuildRequired" to true,
      )
    }

    Function("getCoreCatalog") {
      val context = appContext.reactContext
      NativeCoreCatalog.all().map { definition ->
        val available = context?.let { NativeCoreCatalog.findCore(it, definition) != null } ?: false
        mapOf(
          "system" to definition.system,
          "title" to definition.title,
          "coreName" to definition.coreName,
          "available" to available,
          "downloadable" to NativeCoreCatalog.isDownloadable(definition),
          "localPlay" to (available || NativeCoreCatalog.isDownloadable(definition)),
          "netplay" to definition.netplay,
          "maxRoomMembers" to 10,
          "maxControllerSlots" to definition.maxControllerSlots,
          "acceptedExtensions" to definition.extensions.sorted(),
          "message" to when {
            available -> "${definition.coreName} جاهز للتشغيل المحلي."
            NativeCoreCatalog.isDownloadable(definition) -> "سيُنزل محرك ${definition.coreName} الرسمي عند أول تشغيل للآركيد؛ يلزم اتصال إنترنت ومساحة تخزين كافية."
            else -> "محرك ${definition.coreName} غير موجود داخل APK الحالي."
          },
        )
      }
    }

    Function("getBiosStatus") {
      getBiosStatus()
    }

    Function("getPs1LaunchStatus") {
      getPs1LaunchStatus()
    }

    AsyncFunction("setFamicomFocusLandscape") { active: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      activity.runOnUiThread {
        activity.requestedOrientation = if (active) {
          ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
          ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
      }
    }

    Function("prepareLocalGame") { system: String, uri: String ->
      val definition = NativeCoreCatalog.forSystem(system)
      require(uri.isNotBlank()) { "اختر ملف لعبة محلياً أولاً." }
      val available = appContext.reactContext?.let { NativeCoreCatalog.findCore(it, definition) != null } ?: false
      val downloadable = NativeCoreCatalog.isDownloadable(definition)
      mapOf(
        "system" to system,
        "uri" to uri,
        "ready" to (available || downloadable),
        "message" to when {
          available -> "تم تجهيز ملف ${definition.title}. يمكنك بدء اللعب المحلي الآن."
          downloadable -> "تم تجهيز ملف ${definition.title}. سيُنزل محرك الآركيد تلقائياً عند بدء أول لعبة."
          else -> "محرك ${definition.coreName} غير مضمّن في هذه النسخة."
        },
      )
    }

    AsyncFunction("launchPS1Game") { uri: String, fileName: String, netplay: Map<String, Any>? ->
      require(uri.isNotBlank()) { "اختر ملف لعبة PS1 محلياً أولاً." }
      val activity = appContext.currentActivity ?: throw IllegalStateException("افتح مشغّل PS1 من التطبيق بعد ظهوره على الشاشة.")
      val launchStatus = getPs1LaunchStatus()
      require(launchStatus["available"] == true) { launchStatus["message"] as String }
      val gamePath = preparePS1GameFile(activity.cacheDir, uri, fileName)
      activity.runOnUiThread {
        PS1PlayerActivity.onOverlayAction = { action, muted ->
          sendEvent("nativeOverlayAction", mapOf("action" to action, "muted" to muted))
        }
        activity.startActivity(
          Intent(activity, PS1PlayerActivity::class.java).apply {
            putExtra(PS1PlayerActivity.EXTRA_GAME_PATH, gamePath)
            putExtra(PS1PlayerActivity.EXTRA_GAME_NAME, fileName)
            netplay?.let { config ->
              val serverUrl = config["serverUrl"] as? String
              val roomId = (config["roomId"] as? Number)?.toInt()
              val memberId = (config["memberId"] as? Number)?.toInt()
              val memberToken = config["memberToken"] as? String
              val fingerprint = config["fingerprint"] as? String
              val player = (config["player"] as? Number)?.toInt()
              if (!serverUrl.isNullOrBlank() && roomId != null && memberId != null && !memberToken.isNullOrBlank() && !fingerprint.isNullOrBlank() && player in 1..2) {
                putExtra(PS1PlayerActivity.EXTRA_NETPLAY_SERVER_URL, serverUrl)
                putExtra(PS1PlayerActivity.EXTRA_NETPLAY_ROOM_ID, roomId)
                putExtra(PS1PlayerActivity.EXTRA_NETPLAY_MEMBER_ID, memberId)
                putExtra(PS1PlayerActivity.EXTRA_NETPLAY_MEMBER_TOKEN, memberToken)
                putExtra(PS1PlayerActivity.EXTRA_NETPLAY_FINGERPRINT, fingerprint)
                putExtra(PS1PlayerActivity.EXTRA_NETPLAY_PLAYER, player)
              }
            }
          },
        )
      }
    }

    AsyncFunction("launchNativeGame") { system: String, uri: String, fileName: String ->
      val definition = NativeCoreCatalog.forSystem(system)
      require(uri.isNotBlank()) { "اختر ملف لعبة محلياً أولاً." }
      val extension = fileName.substringAfterLast('.', "").lowercase()
      require(extension in definition.extensions) { "اختر ملف ${definition.title} بامتداد مدعوم: ${definition.extensions.sorted().joinToString(", ")}" }
      val activity = appContext.currentActivity ?: throw IllegalStateException("افتح المشغّل بعد ظهور التطبيق على الشاشة.")
      // AsyncFunction runs outside the Android UI thread, so optional core
      // retrieval can wait for the HTTPS download without freezing the activity.
      val coreFile = NativeCoreCatalog.findCore(activity, definition)
        ?: NativeCoreCatalog.downloadCore(activity, definition)
        ?: throw IllegalStateException(
          if (NativeCoreCatalog.isDownloadable(definition)) {
            "تعذر تنزيل محرك ${definition.coreName}. تحقق من الإنترنت والمساحة المتاحة ثم أعد المحاولة."
          } else {
            "تعذر العثور على ${definition.coreName} داخل APK. ثبّت نسخة Android الكاملة."
          },
        )
      val gamePath = prepareGameFile(activity.cacheDir, uri, fileName, "moudie-${definition.system}-games")
      activity.runOnUiThread {
        activity.startActivity(Intent(activity, UniversalLibretroPlayerActivity::class.java).apply {
          putExtra(UniversalLibretroPlayerActivity.EXTRA_SYSTEM, definition.system)
          putExtra(UniversalLibretroPlayerActivity.EXTRA_CORE_PATH, coreFile.absolutePath)
          putExtra(UniversalLibretroPlayerActivity.EXTRA_GAME_PATH, gamePath)
          putExtra(UniversalLibretroPlayerActivity.EXTRA_GAME_NAME, fileName)
        })
      }
    }

    AsyncFunction("fingerprintPS1Game") { uri: String, fileName: String ->
      require(fileName.substringAfterLast('.', "").lowercase() in ps1GameExtensions) { "اختر ملف PS1 بامتداد BIN أو CHD أو PBP." }
      val parsedUri = Uri.parse(uri)
      val digest = MessageDigest.getInstance("SHA-256")
      val input = if (parsedUri.scheme == "file") {
        val local = File(requireNotNull(parsedUri.path) { "تعذر قراءة ملف اللعبة." })
        require(local.isFile() && local.canRead()) { "تعذر قراءة ملف اللعبة." }
        local.inputStream()
      } else {
        val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException("تعذر فتح تخزين الهاتف.")
        resolver.openInputStream(parsedUri) ?: throw IllegalArgumentException("تعذر قراءة ملف اللعبة.")
      }
      input.use { stream ->
        val buffer = ByteArray(1024 * 128)
        while (true) {
          val bytesRead = stream.read(buffer)
          if (bytesRead <= 0) break
          digest.update(buffer, 0, bytesRead)
        }
      }
      digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }

    AsyncFunction("launchFamicomCompatGame") { uri: String, fileName: String ->
      launchFamicomNativePlayer(uri, fileName, focusMode = false)
    }

    AsyncFunction("launchFamicomFocusGame") { uri: String, fileName: String ->
      launchFamicomNativePlayer(uri, fileName, focusMode = true)
    }

    AsyncFunction("installPS1Bios") { uri: String, fileName: String ->
      val normalizedName = fileName.trim().lowercase()
      require(normalizedName in ps1BiosCandidates) { "اختر ملف BIOS أصلياً باسم scph5500.bin أو scph5501.bin أو scph5502.bin." }
      val filesDir = appContext.reactContext?.filesDir ?: throw IllegalStateException("تعذر فتح مساحة التخزين المحلية.")
      val destination = File(File(filesDir, "moudie-ps1/system").apply { mkdirs() }, normalizedName)
      copyUriToFile(uri, destination)
      require(destination.length() > 0) { "ملف BIOS فارغ أو غير قابل للقراءة." }
      getBiosStatus()
    }
  }

  private val supportedSystems = setOf("nes", "sega", "ps1", "psp", "arcade")
  private val ps1BiosCandidates = setOf("scph5500.bin", "scph5501.bin", "scph5502.bin", "scph1001.bin")
  private val ps1GameExtensions = setOf("bin", "cue", "chd", "pbp")

  private fun launchFamicomNativePlayer(uri: String, fileName: String, focusMode: Boolean) {
    require(uri.isNotBlank()) { "اختر ملف Famicom محلياً أولاً." }
    require(fileName.lowercase().endsWith(".nes")) { "المشغّل الأصلي يدعم ملفات .nes حالياً." }
    val activity = appContext.currentActivity ?: throw IllegalStateException("افتح مشغّل Famicom من التطبيق بعد ظهوره على الشاشة.")
    val gamePath = prepareGameFile(activity.cacheDir, uri, fileName, "moudie-famicom-games")
    activity.runOnUiThread {
      activity.startActivity(Intent(activity, FamicomCompatPlayerActivity::class.java).apply {
        putExtra(FamicomCompatPlayerActivity.EXTRA_GAME_PATH, gamePath)
        putExtra(FamicomCompatPlayerActivity.EXTRA_GAME_NAME, fileName)
        putExtra(FamicomCompatPlayerActivity.EXTRA_FOCUS_MODE, focusMode)
      })
    }
  }

  private fun getPs1LaunchStatus(): Map<String, Any> {
    val context = appContext.reactContext
    val coreFile = context?.let(NativeCoreLocator::findPs1Core)
    val available = coreFile != null
    return mapOf(
      "available" to available,
      "message" to if (available) "تم العثور على core PCSX ReARMed وهو جاهز للتشغيل المحلي." else "تعذر العثور على core PCSX ReARMed داخل التطبيق. ثبّت أحدث APK كاملاً ثم أعد المحاولة.",
    )
  }

  private fun getBiosStatus(): Map<String, Any> {
    val filesDir = appContext.reactContext?.filesDir
    val systemDirectory = filesDir?.let { File(it, "moudie-ps1/system") }
    val installedPs1Bios = ps1BiosCandidates.filter { candidate -> File(systemDirectory, candidate).isFile }
    return mapOf(
      "nes" to mapOf("required" to false, "available" to true, "message" to "Famicom/NES لا يحتاج BIOS؛ جودة العرض تعتمد على ملف اللعبة ودقة البكسلات."),
      "ps1" to mapOf(
        "required" to false,
        "available" to installedPs1Bios.isNotEmpty(),
        "files" to installedPs1Bios,
        "message" to if (installedPs1Bios.isNotEmpty()) "تم العثور على BIOS محلي: ${installedPs1Bios.joinToString()}" else "لم يُضف BIOS محلي. بعض ألعاب PS1 تعمل عبر HLE، لكن dump قانوني متوافق قد يحسن التوافق."
      ),
      "sega" to mapOf("required" to false, "available" to false, "message" to "لا يوجد مشغّل Sega مدمج في هذه النسخة بعد؛ لا يمكن فحص BIOS قبل دمج الـcore."),
      "psp" to mapOf("required" to false, "available" to false, "message" to "لا يوجد مشغّل PSP مدمج في هذه النسخة بعد؛ لا يمكن فحص ملفات النظام قبل دمج الـcore."),
    )
  }

  private fun preparePS1GameFile(cacheDir: File, rawUri: String, fileName: String): String {
    val extension = fileName.substringAfterLast('.', "").lowercase()
    require(extension in ps1GameExtensions) { "اختر ملف PS1 بامتداد BIN أو CUE أو CHD أو PBP." }
    val gamePath = prepareGameFile(cacheDir, rawUri, fileName, "moudie-ps1-games")
    val gameFile = File(gamePath)
    require(gameFile.length() > 1024L) { "ملف لعبة PS1 صغير جداً أو غير مكتمل." }
    if (extension == "cue") validateCueCompanion(gameFile)
    return gamePath
  }

  private fun validateCueCompanion(cueFile: File) {
    val referencedFile = Regex("(?im)^\\s*FILE\\s+\\\"([^\\\"]+)\\\"").find(cueFile.readText())?.groupValues?.getOrNull(1)
    require(!referencedFile.isNullOrBlank()) { "ملف CUE لا يعرّف ملف BIN/IMG مرافقاً. اختر BIN أو CHD أو PBP مباشرةً." }
    val companion = File(cueFile.parentFile, referencedFile)
    require(companion.isFile && companion.canRead()) { "ملف CUE يحتاج الملف المرافق $referencedFile في المجلد نفسه. اختر BIN أو CHD أو PBP مباشرةً إذا كان منتقي الملفات لا يحافظ على المجلد." }
  }

  private fun prepareGameFile(cacheDir: File, rawUri: String, fileName: String, directoryName: String): String {
    val parsedUri = Uri.parse(rawUri)
    if (parsedUri.scheme == "file") {
      val local = File(requireNotNull(parsedUri.path) { "تعذر تحديد مسار ملف اللعبة." })
      if (local.isFile && local.canRead()) return local.absolutePath
    }

    val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").takeLast(100).ifBlank { "ps1-game.bin" }
    val gameDirectory = File(cacheDir, directoryName).apply { mkdirs() }
    val copiedGame = File(gameDirectory, "${System.currentTimeMillis()}-$safeName")
    val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException("تعذر فتح مزود ملفات الهاتف.")
    resolver.openInputStream(parsedUri)?.use { input ->
      FileOutputStream(copiedGame).use { output -> input.copyTo(output) }
    } ?: throw IllegalArgumentException("تعذر قراءة ملف لعبة PS1.")
    require(copiedGame.length() > 0) { "ملف لعبة PS1 فارغ أو غير قابل للقراءة." }
    return copiedGame.absolutePath
  }

  private fun copyUriToFile(rawUri: String, destination: File) {
    val parsedUri = Uri.parse(rawUri)
    if (parsedUri.scheme == "file") {
      val local = File(requireNotNull(parsedUri.path) { "تعذر تحديد مسار الملف." })
      if (local.isFile && local.canRead()) {
        local.copyTo(destination, overwrite = true)
        return
      }
    }
    val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException("تعذر فتح مزود ملفات الهاتف.")
    resolver.openInputStream(parsedUri)?.use { input ->
      FileOutputStream(destination).use { output -> input.copyTo(output) }
    } ?: throw IllegalArgumentException("تعذر قراءة الملف من التخزين.")
  }
}
