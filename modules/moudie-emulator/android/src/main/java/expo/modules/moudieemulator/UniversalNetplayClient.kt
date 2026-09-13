package expo.modules.moudieemulator

import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

data class UniversalNetplayConfig(
  val serverUrl: String,
  val roomId: Int,
  val memberId: Int,
  val memberToken: String,
  val system: String,
  val fingerprint: String,
  val coreVersion: String,
  val playerIndex: Int,
)

/** Dedicated low-latency emulator transport for PSP and Sega with adaptive improvements */
class UniversalNetplayClient(
  private val config: UniversalNetplayConfig,
  private val onBootstrap: (playerMemberIds: List<Int>) -> Unit,
  private val onSessionGo: (startAt: Long, playerMemberIds: List<Int>) -> Unit,
  private val onStateRequest: () -> Unit,
  private val onRemoteInput: (remoteMemberId: Int, frame: Long, mask: Int) -> Unit,
  private val onRemoteState: (encodedState: String, syncId: Long, encoding: String) -> Unit,
  private val onChat: (displayName: String, text: String) -> Unit,
  private val onStatus: (String) -> Unit,
  private val onQuality: (NetplayQuality) -> Unit,
  private val onDelayUpdate: ((delay: Long) -> Unit)? = null,
) {
  companion object {
    private const val MIN_ACTIVE_PLAYERS = 2
    private const val MAX_ACTIVE_PLAYERS = 4
  }

  private var socket: Socket? = null
  private var qualityMonitor: NetplayQualityMonitor? = null

  fun connect() {
    val options = IO.Options().apply {
      path = "/api/netplay"
      transports = arrayOf("websocket")
      reconnection = true
      timeout = 5_000
      reconnectionAttempts = 20
      reconnectionDelay = 300
      reconnectionDelayMax = 2_000
      randomizationFactor = 0.3
      auth = hashMapOf(
        "roomId" to config.roomId.toString(),
        "memberId" to config.memberId.toString(),
        "memberToken" to config.memberToken,
        "clientKind" to "universal-player",
      )
    }
    val connectedSocket = IO.socket(config.serverUrl, options)
    qualityMonitor = NetplayQualityMonitor(connectedSocket, onQuality, "netplay:quality-probe", "netplay:quality-pong")
    socket = connectedSocket.apply {
      on(Socket.EVENT_CONNECT) {
        emit("netplay:universal-ready", JSONObject()
          .put("system", config.system)
          .put("fingerprint", config.fingerprint)
          .put("coreVersion", config.coreVersion))
        qualityMonitor?.resume()
        onStatus("${config.system.uppercase()} channel connected - adaptive sync active")
      }
      on("netplay:universal-session-bootstrap") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val inputDelay = payload.optLong("inputDelay", 3L)
        onDelayUpdate?.invoke(inputDelay)
        val ids = payload.playerMemberIds()
        if (ids.size in MIN_ACTIVE_PLAYERS..8) onBootstrap(ids)
        else onStatus("Invalid player list, waiting for valid session")
      }
      on("netplay:universal-waiting") { args ->
        val payload = args.firstOrNull() as? JSONObject
        val connected = payload?.optInt("connectedCount", 0) ?: 0
        val required = payload?.optInt("requiredCount", 0) ?: 0
        val msg = if (required > 0) "Waiting $connected/$required players - open same file"
        else payload?.optString("message")?.ifBlank { "Waiting for every active player to verify the same game." } ?: "Waiting for every active player to verify the same game."
        onStatus(msg)
      }
      on("netplay:session-start-refused") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "The emulator session was refused." } ?: "The emulator session was refused.")
      }
      on("netplay:universal-session-go") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val startAt = payload.optLong("startAt", -1L)
        val inputDelay = payload.optLong("inputDelay", 3L)
        onDelayUpdate?.invoke(inputDelay)
        val ids = payload.playerMemberIds()
        if (startAt > 0L && ids.size in MIN_ACTIVE_PLAYERS..8) onSessionGo(startAt, ids)
        else if (startAt > 0L) onStatus("Invalid player count, start ignored")
      }
      on("netplay:delay-update") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val delay = payload.optLong("delay", -1L)
        if (delay in 2..8) {
          onDelayUpdate?.invoke(delay)
          onStatus("Network adapting: buffer ${delay} frames")
        }
      }
      on("netplay:frame-rejected") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        if (payload.optString("reason", "") == "frame too far ahead") {
          onStatus("Sync: device ahead, slowing down")
        }
      }
      on("netplay:desync-detected") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        onStatus(payload.optString("message", "Desync detected - resyncing"))
      }
      on("netplay:universal-state-request") { onStateRequest() }
      on("netplay:universal-input") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val remoteMemberId = payload.optInt("memberId", 0)
        val frame = payload.optLong("frame", -1L)
        val mask = payload.optInt("mask", -1)
        if (remoteMemberId > 0 && frame >= 0L && mask in 0..0xffff) onRemoteInput(remoteMemberId, frame, mask)
      }
      on("netplay:universal-state") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val state = payload.optString("snapshot", "")
        val syncId = payload.optLong("syncId", -1L)
        val encoding = payload.optString("encoding", "")
        if (state.isNotBlank() && syncId >= 0L && (encoding == "gzip-base64" || encoding == "base64")) onRemoteState(state, syncId, encoding)
      }
      on("netplay:chat") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val text = payload.optString("text", "").trim()
        if (text.isNotEmpty()) onChat(payload.optString("displayName", "Player"), text)
      }
      on(Socket.EVENT_CONNECT_ERROR) { onStatus("Emulator channel reconnecting - adaptive recovery") }
      on(Socket.EVENT_DISCONNECT) { qualityMonitor?.pause(); onStatus("Game channel paused; auto-reconnecting...") }
      connect()
    }
  }

  fun sendInputFrame(frame: Long, mask: Int) {
    if (frame < 0L || mask !in 0..0xffff || socket?.connected() != true) return
    // Inputs are ephemeral. The connected check prevents stale reconnect queues.
    socket?.emit("netplay:universal-input", JSONObject().put("frame", frame).put("mask", mask))
  }

  fun sendState(encodedState: String, syncId: Long, encoding: String) {
    if (encodedState.isBlank() || syncId < 0L) return
    socket?.emit("netplay:universal-state", JSONObject().put("snapshot", encodedState).put("syncId", syncId).put("encoding", encoding))
  }

  fun requestState(minimumSyncId: Long = -1L) {
    socket?.emit("netplay:universal-state-request", JSONObject().put("minimumSyncId", minimumSyncId))
  }

  fun acknowledgeState(syncId: Long) {
    if (syncId >= 0L) socket?.emit("netplay:universal-sync-ack", JSONObject().put("syncId", syncId))
  }

  fun sendChat(text: String) {
    val safeText = text.trim().take(400)
    if (safeText.isNotEmpty()) socket?.emit("netplay:chat", JSONObject().put("text", safeText))
  }

  fun requestDelayIncrease(delay: Long, reason: String) {
    if (delay in 2..8) {
      socket?.emit("netplay:delay-request", JSONObject().put("delay", delay).put("reason", reason))
    }
  }

  fun reportDesync(frame: Long, predictedFrames: Int) {
    socket?.emit("netplay:desync-report", JSONObject().put("frame", frame).put("predictedFrames", predictedFrames))
  }

  fun close() {
    qualityMonitor?.close()
    qualityMonitor = null
    socket?.off()
    socket?.disconnect()
    socket = null
  }

  private fun JSONObject.playerMemberIds(): List<Int> {
    val values = optJSONArray("playerMemberIds") ?: return emptyList()
    return buildList {
      for (index in 0 until values.length()) {
        val memberId = values.optInt(index, 0)
        if (memberId > 0) add(memberId)
      }
    }.distinct()
  }
}
