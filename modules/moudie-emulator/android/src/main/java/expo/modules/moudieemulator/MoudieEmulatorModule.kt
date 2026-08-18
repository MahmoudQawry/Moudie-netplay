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
            available -> "${definition.coreName} is ready for local play."
            NativeCoreCatalog.isDownloadable(definition) -> "The official ${definition.coreName} core downloads when Arcade is launched for the first time. Internet access and storage space are required."
            else -> "The ${definition.coreName} core is not included in this APK."
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
      require(uri.isNotBlank()) { "Choose a local game file first." }
      val available = appContext.reactContext?.let { NativeCoreCatalog.findCore(it, definition) != null } ?: false
      val downloadable = NativeCoreCatalog.isDownloadable(definition)
      mapOf(
        "system" to system,
        "uri" to uri,
        "ready" to (available || downloadable),
        "message" to when {
          available -> "${definition.title} is prepared. You can start local play now."
          downloadable -> "${definition.title} is prepared. The Arcade core downloads automatically when the first game starts."
          else -> "The ${definition.coreName} core is not included in this build."
        },
      )
    }

    AsyncFunction("launchPS1Game") { uri: String, fileName: String, netplay: Map<String, Any>?, playerOptions: Map<String, Any>? ->
      require(uri.isNotBlank()) { "Choose a local PS1 game file first." }
      val activity = appContext.currentActivity ?: throw IllegalStateException("Open the PS1 player from the app after it is visible on screen.")
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
            applyPlayerOptions(playerOptions)
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

    AsyncFunction("launchNativeGame") { system: String, uri: String, fileName: String, playerOptions: Map<String, Any>?, netplay: Map<String, Any>? ->
      val definition = NativeCoreCatalog.forSystem(system)
      require(uri.isNotBlank()) { "Choose a local game file first." }
      val extension = fileName.substringAfterLast('.', "").lowercase()
      require(extension in definition.extensions) { "Choose a ${definition.title} file with a supported extension: ${definition.extensions.sorted().joinToString(", ")}" }
      val activity = appContext.currentActivity ?: throw IllegalStateException("Open the player after the app is visible on screen.")
      // AsyncFunction runs outside the Android UI thread, so optional core
      // retrieval can wait for the HTTPS download without freezing the activity.
      val coreFile = NativeCoreCatalog.findCore(activity, definition)
        ?: NativeCoreCatalog.downloadCore(activity, definition)
        ?: throw IllegalStateException(
          if (NativeCoreCatalog.isDownloadable(definition)) {
            "Could not download ${definition.coreName}. Check internet access and storage space, then try again."
          } else {
            "Could not find ${definition.coreName} inside this APK. Install the complete Android build."
          },
        )
      val gamePath = prepareGameFile(activity.cacheDir, uri, fileName, "moudie-${definition.system}-games")
      activity.runOnUiThread {
        activity.startActivity(Intent(activity, UniversalLibretroPlayerActivity::class.java).apply {
          putExtra(UniversalLibretroPlayerActivity.EXTRA_SYSTEM, definition.system)
          putExtra(UniversalLibretroPlayerActivity.EXTRA_CORE_PATH, coreFile.absolutePath)
          putExtra(UniversalLibretroPlayerActivity.EXTRA_GAME_PATH, gamePath)
          putExtra(UniversalLibretroPlayerActivity.EXTRA_GAME_NAME, fileName)
          applyPlayerOptions(playerOptions)
          netplay?.let { config ->
            val serverUrl = config["serverUrl"] as? String
            val roomId = (config["roomId"] as? Number)?.toInt()
            val memberId = (config["memberId"] as? Number)?.toInt()
            val memberToken = config["memberToken"] as? String
            val sessionSystem = config["system"] as? String
            val fingerprint = config["fingerprint"] as? String
            val player = (config["player"] as? Number)?.toInt()
            val coreVersion = config["coreVersion"] as? String
            if (!serverUrl.isNullOrBlank() && roomId != null && memberId != null && !memberToken.isNullOrBlank() && sessionSystem == definition.system && !fingerprint.isNullOrBlank() && !coreVersion.isNullOrBlank() && player in 1..2) {
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_SERVER_URL, serverUrl)
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_ROOM_ID, roomId)
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_MEMBER_ID, memberId)
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_MEMBER_TOKEN, memberToken)
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_FINGERPRINT, fingerprint)
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_CORE_VERSION, coreVersion)
              putExtra(UniversalLibretroPlayerActivity.EXTRA_NETPLAY_PLAYER, player)
            }
          }
        })
      }
    }

    AsyncFunction("fingerprintNativeGame") { system: String, uri: String, fileName: String ->
      val definition = NativeCoreCatalog.forSystem(system)
      val extension = fileName.substringAfterLast('.', "").lowercase()
      require(extension in definition.extensions) { "Choose a supported ${definition.title} game file." }
      fingerprintGameUri(uri)
    }

    AsyncFunction("fingerprintPS1Game") { uri: String, fileName: String ->
      require(fileName.substringAfterLast('.', "").lowercase() in ps1GameExtensions) { "Choose a PS1 BIN, CUE, ISO, CHD, or PBP file." }
      fingerprintGameUri(uri)
    }

    AsyncFunction("launchFamicomCompatGame") { uri: String, fileName: String, playerOptions: Map<String, Any>? ->
      launchFamicomNativePlayer(uri, fileName, focusMode = false, playerOptions = playerOptions)
    }

    AsyncFunction("launchFamicomFocusGame") { uri: String, fileName: String, playerOptions: Map<String, Any>? ->
      launchFamicomNativePlayer(uri, fileName, focusMode = true, playerOptions = playerOptions)
    }

    AsyncFunction("installPS1Bios") { uri: String, fileName: String ->
      val normalizedName = fileName.trim().lowercase()
      require(normalizedName in ps1BiosCandidates) { "Choose an original BIOS file named scph5500.bin, scph5501.bin, or scph5502.bin." }
      val filesDir = appContext.reactContext?.filesDir ?: throw IllegalStateException("Could not open local storage.")
      val destination = File(File(filesDir, "moudie-ps1/system").apply { mkdirs() }, normalizedName)
      copyUriToFile(uri, destination)
      require(destination.length() > 0) { "The BIOS file is empty or unreadable." }
      getBiosStatus()
    }
  }

  private fun fingerprintGameUri(uri: String): String {
    val parsedUri = Uri.parse(uri)
    val digest = MessageDigest.getInstance("SHA-256")
    val input = if (parsedUri.scheme == "file") {
      val local = File(requireNotNull(parsedUri.path) { "Could not read the game file." })
      require(local.isFile() && local.canRead()) { "Could not read the game file." }
      local.inputStream()
    } else {
      val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException("Could not open device storage.")
      resolver.openInputStream(parsedUri) ?: throw IllegalArgumentException("Could not read the game file.")
    }
    input.use { stream ->
      val buffer = ByteArray(1024 * 128)
      while (true) {
        val bytesRead = stream.read(buffer)
        if (bytesRead <= 0) break
        digest.update(buffer, 0, bytesRead)
      }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
  }

  private val supportedSystems = setOf("nes", "sega", "ps1", "psp", "arcade")
  private val ps1BiosCandidates = setOf("scph5500.bin", "scph5501.bin", "scph5502.bin", "scph1001.bin")
  private val ps1GameExtensions = setOf("bin", "cue", "iso", "chd", "pbp")

  private fun launchFamicomNativePlayer(uri: String, fileName: String, focusMode: Boolean, playerOptions: Map<String, Any>? = null) {
    require(uri.isNotBlank()) { "Choose a local Famicom game file first." }
    require(fileName.lowercase().endsWith(".nes")) { "The native player currently supports .nes files." }
    val activity = appContext.currentActivity ?: throw IllegalStateException("Open the Famicom player from the app after it is visible on screen.")
    val gamePath = prepareGameFile(activity.cacheDir, uri, fileName, "moudie-famicom-games")
    activity.runOnUiThread {
      activity.startActivity(Intent(activity, FamicomCompatPlayerActivity::class.java).apply {
        putExtra(FamicomCompatPlayerActivity.EXTRA_GAME_PATH, gamePath)
        putExtra(FamicomCompatPlayerActivity.EXTRA_GAME_NAME, fileName)
        putExtra(FamicomCompatPlayerActivity.EXTRA_FOCUS_MODE, focusMode)
        applyPlayerOptions(playerOptions)
      })
    }
  }

  private fun Intent.applyPlayerOptions(playerOptions: Map<String, Any>?) {
    val orientation = playerOptions?.get("orientation") as? String
    val aspectRatio = playerOptions?.get("aspectRatio") as? String
    val settingsMode = playerOptions?.get("settingsMode") as? Boolean
    if (orientation in setOf("portrait", "landscape")) putExtra("expo.modules.moudieemulator.PLAYER_ORIENTATION", orientation)
    if (aspectRatio in setOf("fit", "4:3", "16:9")) putExtra("expo.modules.moudieemulator.PLAYER_ASPECT_RATIO", aspectRatio)
    if (settingsMode == true) putExtra("expo.modules.moudieemulator.PLAYER_SETTINGS_MODE", true)
  }

  private fun getPs1LaunchStatus(): Map<String, Any> {
    val context = appContext.reactContext
    val coreFile = context?.let(NativeCoreLocator::findPs1Core)
    val available = coreFile != null
    return mapOf(
      "available" to available,
      "message" to if (available) "PCSX ReARmed core found and ready for local play." else "Could not find PCSX ReARmed inside the app. Install the latest complete APK and try again.",
    )
  }

  private fun getBiosStatus(): Map<String, Any> {
    val filesDir = appContext.reactContext?.filesDir
    val systemDirectory = filesDir?.let { File(it, "moudie-ps1/system") }
    val installedPs1Bios = ps1BiosCandidates.filter { candidate -> File(systemDirectory, candidate).isFile }
    return mapOf(
      "nes" to mapOf("required" to false, "available" to true, "message" to "Famicom/NES does not require a BIOS; output quality depends on the game file and pixel precision."),
      "ps1" to mapOf(
        "required" to false,
        "available" to installedPs1Bios.isNotEmpty(),
        "files" to installedPs1Bios,
        "message" to if (installedPs1Bios.isNotEmpty()) "Local BIOS found: ${installedPs1Bios.joinToString()}" else "No local BIOS was added. Some PS1 games run through HLE, but a compatible legal dump may improve compatibility."
      ),
      "sega" to mapOf("required" to false, "available" to false, "message" to "No Sega player is bundled in this build, so BIOS status cannot be checked before core integration."),
      "psp" to mapOf("required" to false, "available" to false, "message" to "No PSP player is bundled in this build, so system files cannot be checked before core integration."),
    )
  }

  private fun preparePS1GameFile(cacheDir: File, rawUri: String, fileName: String): String {
    val extension = fileName.substringAfterLast('.', "").lowercase()
    require(extension in ps1GameExtensions) { "Choose a PS1 BIN, CUE, ISO, CHD, or PBP file." }
    val gamePath = prepareGameFile(cacheDir, rawUri, fileName, "moudie-ps1-games")
    val gameFile = File(gamePath)
    require(gameFile.length() > 1024L) { "The PS1 game file is too small or incomplete." }
    if (extension == "cue") validateCueCompanion(gameFile)
    return gamePath
  }

  private fun validateCueCompanion(cueFile: File) {
    val referencedFile = Regex("(?im)^\\s*FILE\\s+\\\"([^\\\"]+)\\\"").find(cueFile.readText())?.groupValues?.getOrNull(1)
    require(!referencedFile.isNullOrBlank()) { "The CUE file does not define a companion BIN/IMG. Choose BIN, ISO, CHD, or PBP directly." }
    val companion = File(cueFile.parentFile, referencedFile)
    require(companion.isFile && companion.canRead()) { "The CUE file needs companion file $referencedFile in the same folder. Choose BIN, ISO, CHD, or PBP directly if the file picker does not preserve folders." }
  }

  private fun prepareGameFile(cacheDir: File, rawUri: String, fileName: String, directoryName: String): String {
    val parsedUri = Uri.parse(rawUri)
    if (parsedUri.scheme == "file") {
      val local = File(requireNotNull(parsedUri.path) { "Could not determine the game file path." })
      if (local.isFile && local.canRead()) return local.absolutePath
    }

    val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").takeLast(100).ifBlank { "ps1-game.bin" }
    val gameDirectory = File(cacheDir, directoryName).apply { mkdirs() }
    val copiedGame = File(gameDirectory, "${System.currentTimeMillis()}-$safeName")
    val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException("Could not open the device file provider.")
    resolver.openInputStream(parsedUri)?.use { input ->
      FileOutputStream(copiedGame).use { output -> input.copyTo(output) }
    } ?: throw IllegalArgumentException("Could not read the PS1 game file.")
    require(copiedGame.length() > 0) { "The PS1 game file is empty or unreadable." }
    return copiedGame.absolutePath
  }

  private fun copyUriToFile(rawUri: String, destination: File) {
    val parsedUri = Uri.parse(rawUri)
    if (parsedUri.scheme == "file") {
      val local = File(requireNotNull(parsedUri.path) { "Could not determine the file path." })
      if (local.isFile && local.canRead()) {
        local.copyTo(destination, overwrite = true)
        return
      }
    }
    val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException("Could not open the device file provider.")
    resolver.openInputStream(parsedUri)?.use { input ->
      FileOutputStream(destination).use { output -> input.copyTo(output) }
    } ?: throw IllegalArgumentException("Could not read the file from storage.")
  }
}
