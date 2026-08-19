package expo.modules.moudieemulator

import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

data class Ps1NetplayConfig(
  val serverUrl: String,
  val roomId: Int,
  val memberId: Int,
  val memberToken: String,
  val fingerprint: String,
  val coreVersion: String,
  val playerIndex: Int,
)

/** Authenticated relay used only for control inputs and save-state bootstrap, never game files. */
class Ps1NetplayClient(
  private val config: Ps1NetplayConfig,
  private val onBootstrap: () -> Unit,
  private val onSessionGo: (startAt: Long, playerMemberIds: List<Int>) -> Unit,
  private val onStateRequest: () -> Unit,
  private val onRemoteInput: (memberId: Int, frame: Long, mask: Int) -> Unit,
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
        "clientKind" to "ps1-player",
      )
    }
    socket = IO.socket(config.serverUrl, options).apply {
      on(Socket.EVENT_CONNECT) {
        emit("netplay:ps1-ready", JSONObject().put("fingerprint", config.fingerprint).put("coreVersion", config.coreVersion))
        onStatus("PS1 channel connected. Wait for room readiness confirmation before starting the player.")
      }
      on("netplay:ps1-session-bootstrap") { onBootstrap() }
      on("netplay:ps1-waiting") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "Waiting for the other active player to open the matching game." } ?: "Waiting for the other active player to open the matching game.")
      }
      on("netplay:session-start-refused") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "The room refused this session start." } ?: "The room refused this session start.")
      }
      on("room:error") { args ->
        val payload = args.firstOrNull() as? JSONObject
        onStatus(payload?.optString("message")?.ifBlank { "The room reported an error." } ?: "The room reported an error.")
      }
      on("netplay:ps1-session-go") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val startAt = payload.optLong("startAt", -1L)
        val members = payload.optJSONArray("playerMemberIds")
        val playerMemberIds = buildList {
          if (members != null) for (index in 0 until members.length()) {
            val memberId = members.optInt(index, -1)
            if (memberId > 0) add(memberId)
          }
        }
        if (startAt > 0L && playerMemberIds.size in 2..8) onSessionGo(startAt, playerMemberIds)
      }
      on("netplay:ps1-state-request") { onStateRequest() }
      on("netplay:ps1-input") { args ->
        val payload = args.firstOrNull() as? JSONObject ?: return@on
        val memberId = payload.optInt("memberId", -1)
        val frame = payload.optLong("frame", -1L)
        val mask = payload.optInt("mask", -1)
        if (memberId > 0 && frame >= 0L && mask in 0..0xffff) onRemoteInput(memberId, frame, mask)
      }
      on("netplay:ps1-state") { args ->
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
      on(Socket.EVENT_CONNECT_ERROR) { onStatus("PS1 channel did not connect in the fast-start window. Check the room connection and restart the session.") }
      on(Socket.EVENT_DISCONNECT) { onStatus("PS1 room connection closed; this device continues local play until the channel returns.") }
      connect()
    }
  }

  fun sendInputFrame(frame: Long, mask: Int) {
    socket?.emit("netplay:ps1-input", JSONObject().put("frame", frame).put("mask", mask))
  }

  fun sendState(encodedState: String, syncId: Long, encoding: String) {
    socket?.emit("netplay:ps1-state", JSONObject().put("snapshot", encodedState).put("syncId", syncId).put("encoding", encoding))
  }

  fun requestState(minimumSyncId: Long = -1L) {
    socket?.emit("netplay:ps1-state-request", JSONObject().put("minimumSyncId", minimumSyncId))
  }

  fun acknowledgeState(syncId: Long) {
    socket?.emit("netplay:ps1-sync-ack", JSONObject().put("syncId", syncId))
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
}
