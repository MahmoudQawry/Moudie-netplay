package expo.modules.moudieemulator

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream

/**
 * One source of truth for the Android cores bundled with Moudie. A core is only
 * advertised when its shared library exists in the installed APK.
 */
object NativeCoreCatalog {
  data class Definition(
    val system: String,
    val title: String,
    val coreName: String,
    val libraryNames: List<String>,
    val extensions: Set<String>,
    val netplay: String,
    val maxControllerSlots: Int,
    val profile: EmulatorControlProfile,
    val systemDirectory: String,
    val downloadUrl: String? = null,
  )

  private val definitions = listOf(
    Definition(
      system = "nes",
      title = "Famicom / NES",
      coreName = "FCEUmm",
      libraryNames = listOf("fceumm_libretro_android.so"),
      extensions = setOf("nes", "fds", "zip"),
      netplay = "retroarch",
      maxControllerSlots = 4,
      profile = EmulatorControlProfiles.FAMICOM,
      systemDirectory = "moudie-nes/system",
    ),
    Definition(
      system = "ps1",
      title = "PlayStation 1",
      coreName = "PCSX-ReARMed",
      libraryNames = listOf("pcsx_rearmed_libretro_android.so", "libpcsx_rearmed_libretro_android.so"),
      extensions = setOf("bin", "cue", "iso", "chd", "pbp"),
      netplay = "retroarch",
      maxControllerSlots = 8,
      profile = EmulatorControlProfiles.PS1,
      systemDirectory = "moudie-ps1/system",
    ),
    Definition(
      system = "psp",
      title = "PlayStation Portable",
      coreName = "PPSSPP",
      libraryNames = listOf("ppsspp_libretro_android.so"),
      extensions = setOf("iso", "cso", "chd", "pbp"),
      netplay = "psp-network",
      maxControllerSlots = 4,
      profile = EmulatorControlProfiles.PSP,
      systemDirectory = "moudie-psp/system",
    ),
    Definition(
      system = "sega",
      title = "Sega Genesis / Mega Drive",
      coreName = "Genesis Plus GX",
      libraryNames = listOf("genesis_plus_gx_libretro_android.so"),
      extensions = setOf("bin", "md", "gen", "smd", "sms", "gg", "zip"),
      netplay = "retroarch",
      maxControllerSlots = 4,
      profile = EmulatorControlProfiles.SEGA,
      systemDirectory = "moudie-sega/system",
    ),
    Definition(
      system = "arcade",
      title = "Arcade",
      coreName = "MAME Arcade",
      libraryNames = listOf("mamearcade_libretro_android.so"),
      extensions = setOf("zip", "7z", "chd"),
      netplay = "retroarch",
      maxControllerSlots = 4,
      profile = EmulatorControlProfiles.ARCADE,
      systemDirectory = "moudie-arcade/system",
      downloadUrl = "https://buildbot.libretro.com/nightly/android/latest/arm64-v8a/mamearcade_libretro_android.so.zip",
    ),
  )

  fun all(): List<Definition> = definitions
  fun forSystem(system: String): Definition = definitions.firstOrNull { it.system == system }
    ?: throw IllegalArgumentException("Unsupported emulator system.")

  fun isDownloadable(definition: Definition): Boolean = !definition.downloadUrl.isNullOrBlank()

  /** Finds a packaged or already-downloaded core. It never opens the network. */
  fun findCore(context: Context, definition: Definition): File? {
    val nativeDirectory = File(context.applicationInfo.nativeLibraryDir)
    definition.libraryNames.asSequence()
      .map { File(nativeDirectory, it) }
      .firstOrNull(::isUsableCore)
      ?.let { return it }

    val targetDirectory = coreDirectory(context)
    definition.libraryNames.asSequence()
      .map { File(targetDirectory, it) }
      .firstOrNull(::isUsableCore)
      ?.let { return it }

    return extractPackagedCore(context, definition, targetDirectory)
  }

  /**
   * Downloads the optional Arcade core on a worker thread. The archive is HTTPS
   * only, unpacked atomically, and the resulting file must be an ELF library.
   */
  fun downloadCore(context: Context, definition: Definition): File? {
    findCore(context, definition)?.let { return it }
    val sourceUrl = definition.downloadUrl ?: return null
    val targetDirectory = coreDirectory(context)
    val target = File(targetDirectory, definition.libraryNames.first())
    val temporary = File(targetDirectory, "${target.name}.download")

    return runCatching {
      val connection = (URL(sourceUrl).openConnection() as HttpsURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 120_000
        instanceFollowRedirects = true
        useCaches = false
        requestMethod = "GET"
      }
      try {
        require(connection.responseCode in 200..299) { "Could not reach the ${definition.coreName} core source." }
        ZipInputStream(connection.inputStream.buffered()).use { archive ->
          var entry = archive.nextEntry
          var extracted = false
          while (entry != null) {
            if (!entry.isDirectory && definition.libraryNames.any { entry.name.endsWith(it) }) {
              FileOutputStream(temporary).use { output ->
                archive.copyTo(output)
                output.fd.sync()
              }
              extracted = true
              break
            }
            entry = archive.nextEntry
          }
          require(extracted) { "The ${definition.coreName} archive does not contain the required core file." }
        }
        require(isUsableCore(temporary)) { "An invalid core file was downloaded." }
        if (!temporary.renameTo(target)) {
          temporary.copyTo(target, overwrite = true)
          temporary.delete()
        }
        target.setReadable(true, true)
        target.setExecutable(true, true)
        target.takeIf(::isUsableCore)
      } finally {
        connection.disconnect()
        if (temporary.exists()) temporary.delete()
      }
    }.getOrNull()
  }

  private fun coreDirectory(context: Context): File = File(context.filesDir, "moudie-cores").apply { mkdirs() }

  private fun extractPackagedCore(context: Context, definition: Definition, targetDirectory: File): File? {
    val target = File(targetDirectory, definition.libraryNames.first())
    return runCatching {
      ZipFile(context.applicationInfo.sourceDir).use { apk ->
        val entry = Build.SUPPORTED_ABIS.asSequence()
          .flatMap { abi -> definition.libraryNames.asSequence().map { library -> "lib/$abi/$library" } }
          .mapNotNull { entryName -> apk.getEntry(entryName) }
          .firstOrNull() ?: return@use null
        val temporary = File(targetDirectory, "${target.name}.tmp")
        apk.getInputStream(entry).use { input ->
          FileOutputStream(temporary).use { output ->
            input.copyTo(output)
            output.fd.sync()
          }
        }
        if (!temporary.renameTo(target)) {
          temporary.copyTo(target, overwrite = true)
          temporary.delete()
        }
        target.setReadable(true, true)
        target.setExecutable(true, true)
        target.takeIf(::isUsableCore)
      }
    }.getOrNull()
  }

  private fun isUsableCore(file: File): Boolean {
    if (!file.isFile || file.length() < 4L) return false
    return runCatching {
      file.inputStream().use { input ->
        val header = ByteArray(4)
        input.read(header) == 4 && header.contentEquals(byteArrayOf(0x7f, 0x45, 0x4c, 0x46))
      }
    }.getOrDefault(false)
  }
}
