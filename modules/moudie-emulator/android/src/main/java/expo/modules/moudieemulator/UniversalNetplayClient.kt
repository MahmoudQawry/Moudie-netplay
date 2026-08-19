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
 * Authenticated lockstep relay for Libretro systems other than PS1. It transmits
 * only button masks and compressed emulator snapshots; game files remain local.
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
) {
  private var socket: Socket? = null

  fun connect() {
    val options = IO.Options().apply {
      path = "/api/netplay"
      transports = arrayOf("websocket", "polling")
      reconnection = true
      timeout = 5_000
      reconnectionAttempts = 1
      reconnectionDelay = 300
      reconnectionDelayMax = 500
      randomizationFactor = 0.0
      auth = hashMapOf(
        "roomId" to config.roomId.toString(),
        "memberId" to config.memberId.toString(),
        "memberToken" to config.memberToken,
        "clientKind" to "universal-player",
      )
    }
    socket = IO.socket(config.serverUrl, options).apply {
      on(Socket.EVENT_CONNECT) {
        emit("netplay:universal-ready", JSONObject()
          .put("system", config.system)
          .put("fingerprint", config.fingerprint)
          .put("coreVersion", config.coreVersion))
        onStatus("${config.system.uppercase()} room channel connected. Waiting for both devices to verify the same game.")
      }
      on("netplay:universal-session-bootstrap") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        onBootstrap(payload.playerMemberIds())
      }
      on("netplay:universal-waiting") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "Waiting for every active player to open the matching game." } ?: "Waiting for every active player to open the matching game.")
      }
      on("netplay:session-start-refused") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "The room refused this session start." } ?: "The room refused this session start.")
      }
      on("room:error") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "The room reported an error." } ?: "The room reported an error.")
      }
      on("netplay:universal-session-go") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val startAt = payload.optLong("startAt", -1L)
        if (startAt > 0L) onSessionGo(startAt, payload.playerMemberIds())
      }
      on("netplay:universal-state-request") { onStateRequest() }
      on("netplay:universal-input") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val remoteMemberId = payload.optInt("memberId", 0)
        val frame = payload.optLong("frame", -1L)
        val mask = payload.optInt("mask", -1)
        if (remoteMemberId > 0 && frame >= 0L && mask >= 0) onRemoteInput(remoteMemberId, frame, mask)
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
        if (text.isNotEmpty()) onChat(payload.optString("displayName", "Other player"), text)
      }
      on(Socket.EVENT_CONNECT_ERROR) { onStatus("This emulator did not connect in the fast-start window. Check the room connection and restart the session.") }
      on(Socket.EVENT_DISCONNECT) { onStatus("Room channel disconnected. This device continues local play until the channel reconnects.") }
      connect()
    }
  }

  fun sendInputFrame(frame: Long, mask: Int) {
    socket?.emit("netplay:universal-input", JSONObject().put("frame", frame).put("mask", mask))
  }

  fun sendState(encodedState: String, syncId: Long, encoding: String) {
    socket?.emit("netplay:universal-state", JSONObject().put("snapshot", encodedState).put("syncId", syncId).put("encoding", encoding))
  }

  fun requestState(minimumSyncId: Long = -1L) {
    socket?.emit("netplay:universal-state-request", JSONObject().put("minimumSyncId", minimumSyncId))
  }

  fun acknowledgeState(syncId: Long) {
    socket?.emit("netplay:universal-sync-ack", JSONObject().put("syncId", syncId))
  }

  fun sendChat(text: String) {
    val safeText = text.trim().take(400)
    if (safeText.isNotEmpty()) socket?.emit("netplay:chat", JSONObject().put("text", safeText))
  }

  fun close() {
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
