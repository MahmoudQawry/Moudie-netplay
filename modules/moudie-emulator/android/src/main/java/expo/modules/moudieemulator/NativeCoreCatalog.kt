package expo.modules.moudieemulator

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipFile

/**
 * One source of truth for Android emulator capabilities.
 *
 * A core is considered available only when it is packaged with the APK (or was
 * installed by a trusted app update). Gameplay never downloads executable native
 * code at runtime: that would make the runtime version non-reproducible and can
 * turn a successful lobby into a different emulator on another device.
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
    val maxRoomPlayers: Int,
    val maxRoomSpectators: Int,
    val profile: EmulatorControlProfile,
    val systemDirectory: String,
  ) {
    val maxRoomMembers: Int get() = maxRoomPlayers + maxRoomSpectators
  }

  private val definitions = listOf(
    Definition("nes", "Famicom / NES", "FCEUmm", listOf("fceumm_libretro_android.so"), setOf("nes", "fds", "zip"), "retroarch", 2, 2, 6, EmulatorControlProfiles.FAMICOM, "moudie-nes/system"),
    Definition("ps1", "PlayStation 1", "PCSX-ReARMed", listOf("pcsx_rearmed_libretro_android.so", "libpcsx_rearmed_libretro_android.so"), setOf("bin", "cue", "iso", "chd", "pbp"), "retroarch", 8, 6, 4, EmulatorControlProfiles.PS1, "moudie-ps1/system"),
    Definition("psp", "PlayStation Portable", "PPSSPP", listOf("ppsspp_libretro_android.so"), setOf("iso", "cso", "chd", "pbp"), "psp-network", 4, 6, 4, EmulatorControlProfiles.PSP, "moudie-psp/system"),
    Definition("sega", "Sega Genesis / Mega Drive", "Genesis Plus GX", listOf("genesis_plus_gx_libretro_android.so"), setOf("bin", "md", "gen", "smd", "sms", "gg", "zip"), "retroarch", 4, 6, 4, EmulatorControlProfiles.SEGA, "moudie-sega/system"),
    Definition("arcade", "Arcade", "MAME Arcade", listOf("mamearcade_libretro_android.so"), setOf("zip", "7z", "chd"), "retroarch", 4, 6, 4, EmulatorControlProfiles.ARCADE, "moudie-arcade/system"),
  )

  fun all(): List<Definition> = definitions
  fun forSystem(system: String): Definition = definitions.firstOrNull { it.system == system }
    ?: throw IllegalArgumentException("Unsupported emulator system.")
  fun isDownloadable(definition: Definition): Boolean = false

  /** Finds a packaged or previously extracted core. It never opens the network. */
  fun findCore(context: Context, definition: Definition): File? {
    val nativeDirectory = File(context.applicationInfo.nativeLibraryDir)
    definition.libraryNames.asSequence().map { File(nativeDirectory, it) }.firstOrNull(::isUsableCore)?.let { return it }
    val targetDirectory = coreDirectory(context)
    definition.libraryNames.asSequence().map { File(targetDirectory, it) }.firstOrNull(::isUsableCore)?.let { return it }
    return extractPackagedCore(context, definition, targetDirectory)
  }

  /** Installs required non-executable core system data. PPSSPP needs its bundled
   * font/UI assets and compatibility files in system/PPSSPP; without them the core
   * can start in a degraded state or fail when games access the memory-stick UI. */
  fun prepareSystemDirectory(context: Context, definition: Definition, systemDirectory: File): File {
    if (definition.system != "psp") return systemDirectory
    val targetRoot = File(systemDirectory, "PPSSPP")
    val marker = File(targetRoot, "ppge_atlas.zim")
    if (marker.isFile && marker.length() > 0L) return systemDirectory
    targetRoot.mkdirs()
    copyAssetTree(context, "ppsspp", targetRoot)
    return systemDirectory
  }

  private fun copyAssetTree(context: Context, assetPath: String, destination: File) {
    val children = context.assets.list(assetPath).orEmpty()
    if (children.isEmpty()) {
      destination.parentFile?.mkdirs()
      context.assets.open(assetPath).use { input -> FileOutputStream(destination).use { output -> input.copyTo(output); output.fd.sync() } }
      return
    }
    destination.mkdirs()
    for (child in children) {
      val childAsset = "$assetPath/$child"
      val childDestination = File(destination, child)
      copyAssetTree(context, childAsset, childDestination)
    }
  }

  /** Runtime core downloads are deliberately forbidden; use a signed app build instead. */
  fun downloadCore(context: Context, definition: Definition): File? = findCore(context, definition)

  private fun coreDirectory(context: Context): File = File(context.filesDir, "moudie-cores").apply { mkdirs() }
  private fun extractPackagedCore(context: Context, definition: Definition, targetDirectory: File): File? {
    val target = File(targetDirectory, definition.libraryNames.first())
    return runCatching {
      ZipFile(context.applicationInfo.sourceDir).use { apk ->
        val entry = Build.SUPPORTED_ABIS.asSequence()
          .flatMap { abi -> definition.libraryNames.asSequence().map { "lib/$abi/$it" } }
          .mapNotNull { apk.getEntry(it) }.firstOrNull() ?: return@use null
        val temporary = File(targetDirectory, "${target.name}.tmp")
        apk.getInputStream(entry).use { input -> FileOutputStream(temporary).use { output -> input.copyTo(output); output.fd.sync() } }
        if (!temporary.renameTo(target)) { temporary.copyTo(target, overwrite = true); temporary.delete() }
        target.setReadable(true, true); target.setExecutable(true, true); target.takeIf(::isUsableCore)
      }
    }.getOrNull()
  }

  private fun isUsableCore(file: File): Boolean = file.isFile && file.length() >= 4L && runCatching {
    file.inputStream().use { input ->
      val header = ByteArray(4)
      input.read(header) == 4 && header.contentEquals(byteArrayOf(0x7f, 0x45, 0x4c, 0x46))
    }
  }.getOrDefault(false)
}
