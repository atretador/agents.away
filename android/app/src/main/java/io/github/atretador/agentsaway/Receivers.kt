package io.github.atretador.agentsaway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlin.concurrent.thread

/** "Allow" and "Approve" straight from a notification: the same requests the web app's service worker makes. */
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val p = ProfileStore(ctx).get(intent.getStringExtra("profile")) ?: return
        val tag = intent.getStringExtra("tag") ?: return
        val title = intent.getStringExtra("title") ?: ""
        val (path, body, done) = when (intent.action) {
            "approve" -> Triple("/api/session/${intent.getStringExtra("sessionId")}/approve", JSONObject().put("key", intent.getStringExtra("promptKey") ?: ""), R.string.done_allowed)
            "review-approve" -> Triple("/api/review/${intent.getStringExtra("reviewId")}/respond", JSONObject().put("decision", "approved"), R.string.done_approved)
            else -> return
        }
        val pending = goAsync()
        thread {
            try {
                val addr = Pairing.reachable(p) ?: throw Exception(ctx.getString(R.string.err_unreachable, p.name))
                Trust.client(p.caPem).newCall(
                    Request.Builder().url(addr + path).header("cookie", p.cookie).header("x-away", "1")
                        .post(body.toString().toRequestBody("application/json".toMediaType())).build()
                ).execute().use { r ->
                    if (!r.isSuccessful) throw Exception(runCatching { JSONObject(r.body.string()).optString("error") }.getOrNull()?.ifEmpty { null } ?: "HTTP ${r.code}")
                }
                Notifier.status(ctx, p, tag, ctx.getString(done), title, error = false)
            } catch (e: Exception) {
                Notifier.status(ctx, p, tag, ctx.getString(R.string.err_action), e.message ?: "", error = true)
            } finally { pending.finish() }
        }
    }
}

/** Reconnect to the PCs after a reboot or an app update, so notifications keep arriving. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) NotifyService.start(ctx)
    }
}
