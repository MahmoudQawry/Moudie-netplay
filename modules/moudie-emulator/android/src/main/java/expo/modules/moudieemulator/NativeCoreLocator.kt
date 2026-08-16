package expo.modules.moudieemulator

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipFile

/** Resolves the exact filename Android extracted from the APK for each bundled libretro core. */
object NativeCoreLocator {
  private val ps1CoreNames = listOf(
    "pcsx_rearmed_libretro_android.so",
    "libpcsx_rearmed_libretro_android.so",
  )

  fun findPs1Core(context: Context): File? {
    val nativeDirectory = File(context.applicationInfo.nativeLibraryDir)
    val extractedCore = ps1CoreNames
      .asSequence()
      .map { File(nativeDirectory, it) }
      .firstOrNull { it.isFile && it.length() > 0L }
    return extractedCore ?: extractPs1CoreFromApk(context)
  }

  /**
   * Some Android builds do not expose a non-standard core filename through nativeLibraryDir.
   * Extract it directly from this app's APK into the app-private directory for LibretroDroid.
   */
  private fun extractPs1CoreFromApk(context: Context): File? = runCatching {
    val targetDirectory = File(context.filesDir, "moudie-ps1/cores").apply { mkdirs() }
    val target = File(targetDirectory, "pcsx_rearmed_libretro_android.so")
    if (target.isFile && target.length() > 0L) return@runCatching target

    val supportedAbis = Build.SUPPORTED_ABIS.toList()
    ZipFile(context.applicationInfo.sourceDir).use { apk ->
      val entry = supportedAbis.asSequence()
        .flatMap { abi -> ps1CoreNames.asSequence().map { name -> "lib/$abi/$name" } }
        .mapNotNull { entryName -> apk.getEntry(entryName) }
        .firstOrNull() ?: return@runCatching null
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
