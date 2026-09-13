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
  val recommendedDelay: Long = 3L,
) {
  fun compactLabel(): String {
    val delayInfo = if (rttMs != null) " D${recommendedDelay}" else ""
    return rttMs?.let { "PING ${it}ms · $grade$delayInfo" } ?: "PING — · $grade"
  }

  /** adaptive adaptive delay calculation */
  fun recommendedInputDelayFrames(): Long = when {
    grade == "STABLE" && (rttMs ?: 100L) <= 50L && (jitterMs ?: 0L) <= 10L -> 2L
    grade == "STABLE" -> 3L
    grade == "FAIR" && (rttMs ?: 150L) <= 100L -> 3L
    grade == "FAIR" -> 4L
    grade == "UNSTABLE" && (rttMs ?: 250L) <= 180L -> 5L
    grade == "UNSTABLE" -> 6L
    else -> 3L
  }
}

/** adaptive improved quality monitor with faster probing and adaptive delay */
class NetplayQualityMonitor(
  private val socket: Socket,
  private val onQuality: (NetplayQuality) -> Unit,
  private val probeEvent: String = "netplay:quality-probe",
  private val pongEvent: String = "netplay:quality-pong",
) {
  private val handler = Handler(Looper.getMainLooper())
  private val pending = LinkedHashMap<Long, Long>()
  private val outcomes = ArrayDeque<Boolean>()
  private var nextSequence = 0L
  private var previousRtt: Long? = null
  private var smoothedRtt: Double? = null
  private var smoothedJitter: Double? = null
  private var running = false
  private var hasRun = false
  private var listenerInstalled = false
  private var lossStreak = 0
  private var maxLossStreak = 0

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
      socket.emit(probeEvent, JSONObject().put("sequence", sequence))
      // adaptive: faster probing 600ms
      handler.postDelayed(this, PROBE_INTERVAL_MS)
    }
  }

  fun resume() {
    if (!listenerInstalled) {
      socket.on(pongEvent, pongListener)
      listenerInstalled = true
    }
    if (running) return
    if (hasRun) resetAfterReconnect()
    hasRun = true
    running = true
    handler.post(probe)
  }

  fun pause() {
    running = false
    handler.removeCallbacks(probe)
  }

  fun close() {
    pause()
    if (listenerInstalled) socket.off(pongEvent, pongListener)
    listenerInstalled = false
    pending.clear()
  }

  private fun resetAfterReconnect() {
    pending.clear()
    outcomes.clear()
    previousRtt = null
    smoothedRtt = null
    smoothedJitter = null
    lossStreak = 0
    maxLossStreak = 0
    onQuality(NetplayQuality())
  }

  private fun receivePong(sequence: Long) {
    val sentAt = pending.remove(sequence) ?: return
    val rtt = (SystemClock.elapsedRealtime() - sentAt).coerceAtLeast(0L)
    val delta = previousRtt?.let { abs(rtt - it) } ?: 0L
    previousRtt = rtt
    // adaptive: adapt faster when jitter high
    val rttAlpha = if (delta > 30) 0.5 else 0.3
    smoothedRtt = smoothedRtt?.let { (it * (1 - rttAlpha)) + (rtt * rttAlpha) } ?: rtt.toDouble()
    smoothedJitter = smoothedJitter?.let { (it * 0.65) + (delta * 0.35) } ?: delta.toDouble()
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
    if (!received) {
      lossStreak++
      maxLossStreak = maxOf(maxLossStreak, lossStreak)
    } else {
      lossStreak = 0
    }
  }

  private fun publish() {
    val rtt = smoothedRtt?.toLong()
    val jitter = smoothedJitter?.toLong()
    val loss = outcomes.takeIf { it.isNotEmpty() }?.let { samples ->
      ((samples.count { !it } * 100.0) / samples.size).toInt()
    }
    // adaptive grading with more granular thresholds
    val grade = when {
      rtt == null -> "CONNECTING"
      rtt <= 60L && (jitter ?: 0L) <= 12L && (loss ?: 0) < 1 -> "STABLE"
      rtt <= 100L && (jitter ?: 0L) <= 25L && (loss ?: 0) <= 2 -> "STABLE"
      rtt <= 150L && (jitter ?: 0L) <= 35L && (loss ?: 0) <= 4 -> "FAIR"
      rtt <= 220L && (jitter ?: 0L) <= 50L && (loss ?: 0) <= 7 -> "FAIR"
      else -> "UNSTABLE"
    }
    val recommendedDelay = when {
      rtt == null -> 3L
      rtt <= 50L && (jitter ?: 0L) <= 10L && (loss ?: 0) < 1 -> 2L
      rtt <= 80L && (jitter ?: 0L) <= 20L && (loss ?: 0) < 2 -> 3L
      rtt <= 120L && (jitter ?: 0L) <= 30L && (loss ?: 0) <= 3 -> 4L
      rtt <= 180L && (jitter ?: 0L) <= 45L && (loss ?: 0) <= 5 -> 5L
      rtt <= 250L -> 6L
      else -> 7L
    }
    onQuality(NetplayQuality(rtt, jitter, loss, grade, recommendedDelay))
  }

  private companion object {
    const val PROBE_INTERVAL_MS = 600L // adaptive faster probing
    const val PROBE_TIMEOUT_MS = 2000L // Reduced timeout
    const val OUTCOME_WINDOW = 30 // Larger window for stability
  }
}
