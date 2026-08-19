package expo.modules.moudieemulator

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import io.socket.client.Socket
import io.socket.emitter.Emitter
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.LinkedHashMap
import kotlin.math.abs

data class NetplayQuality(
  val rttMs: Long? = null,
  val jitterMs: Long? = null,
  val probeLossPercent: Int? = null,
  val grade: String = "CONNECTING",
) {
  fun compactLabel(): String = rttMs?.let { "PING ${it}ms · $grade" } ?: "PING — · $grade"

  /** Apply only before lockstep begins; changing a live frame schedule would desynchronize peers. */
  fun recommendedInputDelayFrames(): Long = when (grade) {
    "STABLE" -> 3L
    "FAIR" -> 5L
    else -> 7L
  }
}

/**
 * Measures a real application round trip to the authenticated room server.
 * It deliberately never estimates another player's network path and reports
 * an unknown value until a server response has actually arrived.
 */
class NetplayQualityMonitor(
  private val socket: Socket,
  private val onQuality: (NetplayQuality) -> Unit,
) {
  private val handler = Handler(Looper.getMainLooper())
  private val pending = LinkedHashMap<Long, Long>()
  private val outcomes = ArrayDeque<Boolean>()
  private var nextSequence = 0L
  private var previousRtt: Long? = null
  private var smoothedRtt: Double? = null
  private var smoothedJitter: Double? = null
  private var running = false
  private var listenerInstalled = false

  private val pongListener = Emitter.Listener { args ->
    val payload = args.firstOrNull() as? JSONObject ?: return@Listener
    val sequence = payload.optLong("sequence", -1L)
    if (sequence < 0L) return@Listener
    handler.post { receivePong(sequence) }
  }

  private val probe = object : Runnable {
    override fun run() {
      if (!running) return
      val now = SystemClock.elapsedRealtime()
      expireOldProbes(now)
      val sequence = nextSequence++
      pending[sequence] = now
      socket.emit("netplay:quality-probe", JSONObject().put("sequence", sequence))
      handler.postDelayed(this, PROBE_INTERVAL_MS)
    }
  }

  fun resume() {
    if (!listenerInstalled) {
      socket.on("netplay:quality-pong", pongListener)
      listenerInstalled = true
    }
    if (running) return
    running = true
    handler.post(probe)
  }

  fun pause() {
    running = false
    handler.removeCallbacks(probe)
  }

  fun close() {
    pause()
    if (listenerInstalled) socket.off("netplay:quality-pong", pongListener)
    listenerInstalled = false
    pending.clear()
  }

  private fun receivePong(sequence: Long) {
    val sentAt = pending.remove(sequence) ?: return
    val rtt = (SystemClock.elapsedRealtime() - sentAt).coerceAtLeast(0L)
    val delta = previousRtt?.let { abs(rtt - it) } ?: 0L
    previousRtt = rtt
    smoothedRtt = smoothedRtt?.let { (it * 0.7) + (rtt * 0.3) } ?: rtt.toDouble()
    smoothedJitter = smoothedJitter?.let { (it * 0.7) + (delta * 0.3) } ?: delta.toDouble()
    recordOutcome(true)
    publish()
  }

  private fun expireOldProbes(now: Long) {
    val expired = pending.entries.filter { now - it.value >= PROBE_TIMEOUT_MS }.map { it.key }
    expired.forEach { pending.remove(it); recordOutcome(false) }
    if (expired.isNotEmpty()) publish()
  }

  private fun recordOutcome(received: Boolean) {
    outcomes.addLast(received)
    while (outcomes.size > OUTCOME_WINDOW) outcomes.removeFirst()
  }

  private fun publish() {
    val rtt = smoothedRtt?.toLong()
    val jitter = smoothedJitter?.toLong()
    val loss = outcomes.takeIf { it.isNotEmpty() }?.let { samples ->
      ((samples.count { !it } * 100.0) / samples.size).toInt()
    }
    val grade = when {
      rtt == null -> "CONNECTING"
      rtt <= 75L && (jitter ?: 0L) <= 15L && (loss ?: 0) < 1 -> "STABLE"
      rtt <= 150L && (jitter ?: 0L) <= 35L && (loss ?: 0) <= 4 -> "FAIR"
      else -> "UNSTABLE"
    }
    onQuality(NetplayQuality(rtt, jitter, loss, grade))
  }

  private companion object {
    const val PROBE_INTERVAL_MS = 1_000L
    const val PROBE_TIMEOUT_MS = 2_500L
    const val OUTCOME_WINDOW = 20
  }
}
