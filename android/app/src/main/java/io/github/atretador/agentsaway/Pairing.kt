package io.github.atretador.agentsaway

import android.net.Uri
import okhttp3.Request

/** A pairing link from `agents-away pair`: https://<ip>:<port>/pair?t=<code>&fp=<CA sha256>&n=<PC name> */
data class PairLink(val origin: String, val code: String, val fingerprint: String, val name: String?)

class PairError(val messageRes: Int, val detail: String? = null) : Exception(detail)

object Pairing {
    fun parse(text: String): PairLink {
        val u = runCatching { Uri.parse(text.trim()) }.getOrNull()
        if (u == null || u.scheme != "https" || u.host.isNullOrEmpty() || u.path != "/pair") throw PairError(R.string.pair_not_a_link)
        val code = u.getQueryParameter("t").orEmpty()
        val fp = u.getQueryParameter("fp").orEmpty().lowercase()
        if (code.isEmpty()) throw PairError(R.string.pair_not_a_link)
        if (!Regex("^[0-9a-f]{64}$").matches(fp)) throw PairError(R.string.pair_no_fingerprint)
        val origin = "https://${u.host}${if (u.port > 0) ":${u.port}" else ""}"
        return PairLink(origin, code, fp, u.getQueryParameter("n")?.takeIf { it.isNotBlank() })
    }

    /**
     * Pairs with the PC (network: call off the main thread). Returns the new or updated profile, already saved.
     * - downloads the PC's CA and checks it against the fingerprint from the QR code;
     * - checks the server's certificate is signed by that CA and names this address;
     * - if a profile for the same PC (same CA) exists and its sign-in still works, just adds this address
     *   (no second device on the PC); otherwise redeems the one-time code for a new sign-in.
     */
    fun pair(store: ProfileStore, link: PairLink): Profile {
        val caBytes = try {
            Trust.bootstrapClient().newCall(Request.Builder().url("${link.origin}/agents-away-ca.crt").build()).execute().use { r ->
                if (!r.isSuccessful) throw PairError(R.string.pair_no_ca, "HTTP ${r.code}")
                r.body.bytes()
            }
        } catch (e: PairError) { throw e } catch (e: Exception) { throw PairError(R.string.pair_unreachable, e.message) }
        val ca = runCatching { Trust.parseCert(caBytes) }.getOrElse { throw PairError(R.string.pair_no_ca, it.message) }
        if (Trust.fingerprint(ca) != link.fingerprint) throw PairError(R.string.pair_fingerprint_mismatch)
        val caPem = Trust.toPem(ca)
        val client = Trust.client(caPem)
        // The server must present a certificate from this CA for this address (also proves the address is right).
        try {
            client.newCall(Request.Builder().url("${link.origin}/manifest.webmanifest").build()).execute().use { r ->
                if (!r.isSuccessful) throw PairError(R.string.pair_unreachable, "HTTP ${r.code}")
            }
        } catch (e: PairError) { throw e } catch (e: Exception) { throw PairError(R.string.pair_cert_mismatch, e.message) }

        val existing = store.byFingerprint(link.fingerprint)
        if (existing != null && existing.cookie.isNotEmpty() && signedIn(client, link.origin, existing.cookie)) {
            if (link.origin !in existing.addresses) existing.addresses.add(link.origin)
            existing.lastAddress = link.origin
            store.save(existing)
            return existing
        }
        val cookie = client.newCall(Request.Builder().url("${link.origin}/pair?t=${Uri.encode(link.code)}").build()).execute().use { r ->
            if (r.code == 403) throw PairError(R.string.pair_expired)
            if (r.code != 302) throw PairError(R.string.pair_unreachable, "HTTP ${r.code}")
            r.headers("set-cookie").firstOrNull { it.startsWith("away_dev=") }?.substringBefore(';') ?: throw PairError(R.string.pair_unreachable, "no sign-in")
        }
        val p = existing?.apply {
            if (link.origin !in addresses) addresses.add(link.origin)
            this.cookie = cookie
            lastAddress = link.origin
        } ?: Profile(
            id = Profile.newId(), name = link.name ?: Trust.host(link.origin), addresses = mutableListOf(link.origin),
            caPem = caPem, fingerprint = link.fingerprint, cookie = cookie, lastAddress = link.origin,
            color = ProfileStore.COLORS[store.all().size % ProfileStore.COLORS.size],
        )
        store.save(p)
        return p
    }

    private fun signedIn(client: okhttp3.OkHttpClient, origin: String, cookie: String): Boolean = runCatching {
        client.newCall(Request.Builder().url("$origin/api/state").header("cookie", cookie).build()).execute().use { it.code == 200 }
    }.getOrDefault(false)

    /** First address of the profile that answers with its pinned certificate (LAN at home, VPN away). */
    fun reachable(p: Profile): String? {
        val client = Trust.client(p.caPem, readTimeoutSec = 4).newBuilder().connectTimeout(3, java.util.concurrent.TimeUnit.SECONDS).build()
        for (a in p.addressOrder()) {
            val ok = runCatching { client.newCall(Request.Builder().url("$a/manifest.webmanifest").build()).execute().use { it.isSuccessful } }.getOrDefault(false)
            if (ok) return a
        }
        return null
    }
}
