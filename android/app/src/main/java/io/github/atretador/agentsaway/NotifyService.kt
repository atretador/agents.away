package io.github.atretador.agentsaway

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Notifications without any push service or companion app: a foreground service keeps one WebSocket per PC
 * and the PC sends its notification events down it ({type: "listen"} → {type: "notify", …}). On every
 * (re)connect the PC re-sends what is still waiting, so nothing is lost while the phone was offline.
 */
class NotifyService : Service() {
    companion object {
        fun start(ctx: Context) {
            val i = Intent(ctx, NotifyService::class.java)
            if (ProfileStore(ctx).all().isEmpty()) { ctx.stopService(i); return }
            try { ctx.startForegroundService(i) } catch (e: Exception) { /* not allowed right now (background start); the app retries when opened */ }
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val conns = HashMap<String, Conn>()
    private val net = object : ConnectivityManager.NetworkCallback() {
        // A network came up (Wi-Fi, mobile, VPN): retry failed connections now instead of waiting out the backoff.
        override fun onAvailable(network: Network) { main.post { conns.values.forEach { it.kick() } } }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifier.channels(this)
        val n = serviceNotification()
        if (Build.VERSION.SDK_INT >= 34) startForeground(Notifier.SERVICE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(Notifier.SERVICE_ID, n)
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(net)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        reload()
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(net) }
        conns.values.forEach { it.close() }
        conns.clear()
        super.onDestroy()
    }

    /** Sync the connections with the stored profiles (added, removed, re-paired). */
    private fun reload() {
        val profiles = ProfileStore(this).all()
        if (profiles.isEmpty()) { stopSelf(); return }
        val ids = profiles.map { it.id }.toSet()
        conns.keys.filter { it !in ids }.forEach { conns.remove(it)?.close() }
        for (p in profiles) {
            val c = conns[p.id]
            if (c != null && c.sameAs(p)) { c.p.name = p.name; continue }
            c?.close()
            conns[p.id] = Conn(p).also { it.connect() }
        }
        updateNotification()
    }

    private fun serviceNotification(): android.app.Notification {
        val list = conns.values.toList()
        val ok = list.filter { it.state == "ok" }.map { it.p.name }
        val waiting = list.filter { it.state != "ok" }.map { it.p.name }
        val text = when {
            list.isEmpty() -> getString(R.string.svc_starting)
            waiting.isEmpty() -> getString(R.string.svc_connected, ok.joinToString(", "))
            ok.isEmpty() -> getString(R.string.svc_reconnecting, waiting.joinToString(", "))
            else -> getString(R.string.svc_connected, ok.joinToString(", ")) + " · " + getString(R.string.svc_reconnecting, waiting.joinToString(", "))
        }
        val open = Notifier.openIntent(this, ProfileStore(this).currentId ?: "", "/", 0)
        return NotificationCompat.Builder(this, Notifier.CH_SERVICE)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setOngoing(true).setSilent(true).setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(open)
            .build()
    }

    private var lastText = ""
    private fun updateNotification() {
        val n = serviceNotification()
        val t = n.extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: ""
        if (t == lastText) return
        lastText = t
        runCatching { getSystemService(android.app.NotificationManager::class.java).notify(Notifier.SERVICE_ID, n) }
    }

    /** One PC's notification connection. All state changes happen on the main thread. */
    private inner class Conn(var p: Profile) : WebSocketListener() {
        var state = "connecting"
        private var ws: WebSocket? = null
        private var attempt = 0
        private var next = 0 // index into the address list: each retry tries the next address
        private var closed = false
        private var address: String? = null
        private val client: OkHttpClient = Trust.client(p.caPem, readTimeoutSec = 0, pingSec = 45)
        private val retryRun = Runnable { connect() }

        fun sameAs(o: Profile) = o.cookie == p.cookie && o.addresses == p.addresses && o.caPem == p.caPem

        fun connect() {
            if (closed) return
            main.removeCallbacks(retryRun)
            val order = p.addressOrder()
            val addr = order[next % order.size]
            address = addr
            val req = Request.Builder().url(addr.replaceFirst("https://", "wss://") + "/ws")
                .header("cookie", p.cookie).header("origin", addr).build()
            ws?.cancel()
            ws = client.newWebSocket(req, this)
        }

        fun kick() {
            if (closed || state == "ok" || state == "signedout") return
            attempt = 0
            connect()
        }

        fun close() {
            closed = true
            main.removeCallbacks(retryRun)
            ws?.cancel()
        }

        private fun retry() {
            if (closed || state == "signedout") return
            state = "retrying"
            updateNotification()
            next++
            val delay = minOf(60_000L, 1000L shl minOf(attempt, 6))
            attempt++
            main.removeCallbacks(retryRun)
            main.postDelayed(retryRun, delay)
        }

        private fun signedOut() {
            if (state == "signedout") return
            state = "signedout"
            updateNotification()
            Notifier.status(this@NotifyService, p, "signedout", getString(R.string.signed_out_title, p.name), getString(R.string.signed_out_text), error = true)
        }

        override fun onOpen(webSocket: WebSocket, response: Response) {
            main.post {
                if (webSocket !== ws) return@post
                state = "ok"; attempt = 0
                val store = ProfileStore(this@NotifyService)
                store.get(p.id)?.let { if (it.lastAddress != address) { it.lastAddress = address; store.save(it) } }
                updateNotification()
            }
            webSocket.send("""{"type":"listen"}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val m = runCatching { JSONObject(text) }.getOrNull() ?: return
            if (m.optString("type") == "notify") Notifier.show(this@NotifyService, p, m, address)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            main.post { if (webSocket === ws) { if (code == 4401) signedOut() else retry() } }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null) }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            val code = response?.code
            main.post { if (webSocket === ws) { if (code == 401) signedOut() else retry() } }
        }
    }
}
