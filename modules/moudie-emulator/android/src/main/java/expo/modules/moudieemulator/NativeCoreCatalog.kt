package expo.modules.moudieemulator

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipFile

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
      extensions = setOf("bin", "cue", "chd", "pbp"),
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
    ),
  )

  fun all(): List<Definition> = definitions
  fun forSystem(system: String): Definition = definitions.firstOrNull { it.system == system }
    ?: throw IllegalArgumentException("نظام المحاكاة غير مدعوم.")

  fun findCore(context: Context, definition: Definition): File? {
    val nativeDirectory = File(context.applicationInfo.nativeLibraryDir)
    definition.libraryNames.asSequence()
      .map { File(nativeDirectory, it) }
      .firstOrNull { it.isFile && it.length() > 0L }
      ?.let { return it }

    val targetDirectory = File(context.filesDir, "moudie-cores").apply { mkdirs() }
    val target = File(targetDirectory, definition.libraryNames.first())
    if (target.isFile && target.length() > 0L) return target

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
        target.takeIf { it.isFile && it.length() > 0L }
      }
    }.getOrNull()
  }
}
