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

/**
 * Dedicated low-latency emulator transport for PSP, Sega and Arcade.
 * It is isolated from lobby/chat traffic so UI events cannot block frame input.
 */
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
) {
  private var socket: Socket? = null
  private var qualityMonitor: NetplayQualityMonitor? = null

  fun connect() {
    val options = IO.Options().apply {
      path = "/api/universal-netplay"
      transports = arrayOf("websocket", "polling")
      reconnection = true
      timeout = 5_000
      reconnectionAttempts = 20
      reconnectionDelay = 500
      reconnectionDelayMax = 4_000
      randomizationFactor = 0.25
      auth = hashMapOf(
        "roomId" to config.roomId.toString(),
        "memberId" to config.memberId.toString(),
        "memberToken" to config.memberToken,
      )
    }
    val connectedSocket = IO.socket(config.serverUrl, options)
    qualityMonitor = NetplayQualityMonitor(connectedSocket, onQuality)
    socket = connectedSocket.apply {
      on(Socket.EVENT_CONNECT) {
        emit("universal:ready", JSONObject()
          .put("system", config.system)
          .put("fingerprint", config.fingerprint)
          .put("coreVersion", config.coreVersion))
        qualityMonitor?.resume()
        onStatus("${config.system.uppercase()} dedicated game channel connected.")
      }
      on("universal:bootstrap") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val ids = payload.playerMemberIds()
        if (ids.size in 2..8) onBootstrap(ids)
      }
      on("universal:waiting") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "Waiting for every active player to verify the same game." } ?: "Waiting for every active player to verify the same game.")
      }
      on("universal:session-refused") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "The emulator session was refused." } ?: "The emulator session was refused.")
      }
      on("universal:session-go") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val startAt = payload.optLong("startAt", -1L)
        val ids = payload.playerMemberIds()
        if (startAt > 0L && ids.size in 2..8) onSessionGo(startAt, ids)
      }
      on("universal:state-request") { onStateRequest() }
      on("universal:input") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val remoteMemberId = payload.optInt("memberId", 0)
        val frame = payload.optLong("frame", -1L)
        val mask = payload.optInt("mask", -1)
        if (remoteMemberId > 0 && frame >= 0L && mask in 0..0xffff) onRemoteInput(remoteMemberId, frame, mask)
      }
      on("universal:state") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val state = payload.optString("snapshot", "")
        val syncId = payload.optLong("syncId", -1L)
        val encoding = payload.optString("encoding", "")
        if (state.isNotBlank() && syncId >= 0L && (encoding == "gzip-base64" || encoding == "base64")) onRemoteState(state, syncId, encoding)
      }
      on("universal:quality-pong") { /* NetplayQualityMonitor owns this event. */ }
      on(Socket.EVENT_CONNECT_ERROR) { onStatus("Dedicated emulator channel is retrying…") }
      on(Socket.EVENT_DISCONNECT) { qualityMonitor?.pause(); onStatus("Dedicated game channel paused; reconnecting automatically…") }
      connect()
    }
  }

  fun sendInputFrame(frame: Long, mask: Int) {
    if (frame < 0L || mask !in 0..0xffff) return
    socket?.emit("universal:input", JSONObject().put("frame", frame).put("mask", mask))
  }

  fun sendState(encodedState: String, syncId: Long, encoding: String) {
    if (encodedState.isBlank() || syncId < 0L) return
    socket?.emit("universal:state", JSONObject().put("snapshot", encodedState).put("syncId", syncId).put("encoding", encoding))
  }

  fun requestState(minimumSyncId: Long = -1L) {
    socket?.emit("universal:state-request", JSONObject().put("minimumSyncId", minimumSyncId))
  }

  fun acknowledgeState(syncId: Long) {
    socket?.emit("universal:state-ack", JSONObject().put("syncId", syncId))
  }

  fun sendChat(text: String) {
    // Chat remains on the lobby Socket.IO endpoint; this dedicated channel intentionally carries no chat traffic.
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
    }
  }
}
