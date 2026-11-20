package io.github.atretador.agentsaway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import okhttp3.Request
import org.json.JSONObject

/** Turns the PC's notification events (the same payloads it sends as Web Push) into Android notifications. */
object Notifier {
    const val CH_ATTENTION = "attention"
    const val CH_DONE = "done"
    const val CH_REVIEW = "review"
    const val CH_INFO = "info"
    const val CH_SERVICE = "connection"
    const val SERVICE_ID = 1

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannels(listOf(
            NotificationChannel(CH_ATTENTION, ctx.getString(R.string.ch_attention), NotificationManager.IMPORTANCE_HIGH),
            NotificationChannel(CH_REVIEW, ctx.getString(R.string.ch_review), NotificationManager.IMPORTANCE_HIGH),
            NotificationChannel(CH_DONE, ctx.getString(R.string.ch_done), NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(CH_INFO, ctx.getString(R.string.ch_info), NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(CH_SERVICE, ctx.getString(R.string.ch_service), NotificationManager.IMPORTANCE_MIN).apply {
                description = ctx.getString(R.string.ch_service_desc); setShowBadge(false)
            },
        ))
    }

    /** Opens the app on a profile, at a path inside the web app (e.g. "/#/s/<id>"). */
    fun openIntent(ctx: Context, profileId: String, path: String?, req: Int): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).apply {
            action = MainActivity.ACTION_OPEN
            putExtra(MainActivity.EXTRA_PROFILE, profileId)
            putExtra(MainActivity.EXTRA_PATH, path ?: "/")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun notifTag(p: Profile, tag: String) = "${p.id}:$tag"
    fun notifId(p: Profile, tag: String) = notifTag(p, tag).hashCode()

    /**
     * Shows one notification event. `replay` events are what was still pending when the connection (re)opened:
     * those are skipped if the same notification was already shown, so reconnecting doesn't re-alert.
     */
    fun show(ctx: Context, p: Profile, m: JSONObject, address: String?) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val tag = m.optString("tag").ifEmpty { "n-" + System.currentTimeMillis() }
        val title = m.optString("title", "Agents Away")
        val body = m.optString("body")
        val key = listOf(title, body, m.optString("promptKey")).joinToString("\u0001")
        val seen = ctx.getSharedPreferences("shown", Context.MODE_PRIVATE)
        val nt = notifTag(p, tag)
        if (m.optBoolean("replay") && seen.getString(nt, null) == key) return
        seen.edit().putString(nt, key).apply()
        if (seen.all.size > 300) seen.edit().clear().putString(nt, key).apply()

        val channel = when (m.optString("kind")) { "attention" -> CH_ATTENTION; "review" -> CH_REVIEW; "done" -> CH_DONE; else -> CH_INFO }
        val id = notifId(p, tag)
        val path = m.optString("url").ifEmpty { "/" }
        val b = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSubText(p.name)
            .setColor(p.color)
            .setAutoCancel(true)
            .setContentIntent(openIntent(ctx, p.id, path, id))
            .setCategory(if (channel == CH_ATTENTION) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_STATUS)
            .setGroup(p.id)
        val actions = m.optJSONArray("actions")
        for (i in 0 until (actions?.length() ?: 0)) {
            val a = actions!!.getJSONObject(i)
            when (val act = a.optString("action")) {
                "open" -> b.addAction(0, a.optString("title", ctx.getString(R.string.action_open)), openIntent(ctx, p.id, path, id + 1))
                "approve", "review-approve" -> {
                    val ai = Intent(ctx, ActionReceiver::class.java).apply {
                        action = act
                        putExtra("profile", p.id); putExtra("tag", tag); putExtra("title", title)
                        putExtra("sessionId", m.optString("sessionId")); putExtra("promptKey", m.optString("promptKey"))
                        putExtra("reviewId", m.optString("reviewId"))
                    }
                    val pi = PendingIntent.getBroadcast(ctx, id + 2 + i, ai, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    b.addAction(0, ctx.getString(if (act == "approve") R.string.action_allow else R.string.action_approve), pi)
                }
            }
        }
        // Review image: fetched over the pinned connection (best effort; the text notification shows regardless).
        val image = m.optString("image")
        if (image.isNotEmpty() && address != null) runCatching {
            Trust.client(p.caPem).newCall(Request.Builder().url(address + image).header("cookie", p.cookie).build()).execute().use { r ->
                if (r.isSuccessful) BitmapFactory.decodeStream(r.body.byteStream())?.let { bmp ->
                    b.setLargeIcon(bmp).setStyle(NotificationCompat.BigPictureStyle().bigPicture(bmp).bigLargeIcon(null as android.graphics.Bitmap?).setSummaryText(body))
                }
            }
        }
        post(ctx, nt, id, b.build())
    }

    /** A short-lived confirmation (Allowed / Approved) or an error in place of the original notification. */
    fun status(ctx: Context, p: Profile, tag: String, title: String, text: String, error: Boolean) {
        val id = notifId(p, tag)
        val n = NotificationCompat.Builder(ctx, if (error) CH_ATTENTION else CH_INFO)
            .setSmallIcon(R.drawable.ic_notify).setContentTitle(title).setContentText(text).setSubText(p.name)
            .setColor(p.color).setSilent(!error).setAutoCancel(true)
            .setContentIntent(openIntent(ctx, p.id, "/", id))
            .setTimeoutAfter(if (error) 0 else 2500)
            .build()
        post(ctx, notifTag(p, tag), id, n)
    }

    private fun post(ctx: Context, tag: String, id: Int, n: Notification) {
        try { NotificationManagerCompat.from(ctx).notify(tag, id, n) } catch (e: SecurityException) { /* permission revoked */ }
    }
}
