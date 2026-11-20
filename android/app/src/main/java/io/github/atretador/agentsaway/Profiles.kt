package io.github.atretador.agentsaway

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * One PC running Agents Away. A PC can be reachable at several addresses (LAN, VPN); they share the same CA
 * (identified by its fingerprint) and the same device sign-in cookie.
 */
data class Profile(
    val id: String,
    var name: String,
    val addresses: MutableList<String>, // origins: "https://192.168.1.10:7443"
    val caPem: String,
    val fingerprint: String, // SHA-256 of the CA certificate, lowercase hex
    var cookie: String, // "away_dev=…" — the device sign-in
    var lastAddress: String? = null,
    var color: Int = 0,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("name", name).put("addresses", JSONArray(addresses))
        .put("caPem", caPem).put("fingerprint", fingerprint).put("cookie", cookie)
        .put("lastAddress", lastAddress).put("color", color)

    /** Addresses to try, the one that worked last time first. */
    fun addressOrder(): List<String> = (listOfNotNull(lastAddress) + addresses).distinct().filter { it in addresses }

    fun owns(url: String?): Boolean = url != null && addresses.any { url == it || url.startsWith("$it/") }

    companion object {
        fun fromJson(o: JSONObject) = Profile(
            id = o.getString("id"),
            name = o.optString("name", "PC"),
            addresses = o.getJSONArray("addresses").let { a -> MutableList(a.length()) { a.getString(it) } },
            caPem = o.getString("caPem"),
            fingerprint = o.getString("fingerprint"),
            cookie = o.optString("cookie", ""),
            lastAddress = o.optString("lastAddress").ifEmpty { null }.takeIf { !o.isNull("lastAddress") },
            color = o.optInt("color", 0),
        )
        fun newId(): String = UUID.randomUUID().toString().take(8)
    }
}

/** Profiles live in the app's private storage (only this app can read them). */
class ProfileStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("profiles", Context.MODE_PRIVATE)

    fun all(): List<Profile> = try {
        val a = JSONArray(prefs.getString("list", "[]"))
        List(a.length()) { Profile.fromJson(a.getJSONObject(it)) }
    } catch (e: Exception) { emptyList() }

    fun get(id: String?): Profile? = all().firstOrNull { it.id == id }
    fun byFingerprint(fp: String): Profile? = all().firstOrNull { it.fingerprint.equals(fp, ignoreCase = true) }

    fun save(p: Profile) {
        val list = all().toMutableList()
        val i = list.indexOfFirst { it.id == p.id }
        if (i >= 0) list[i] = p else list.add(p)
        write(list)
    }

    fun remove(id: String) {
        write(all().filter { it.id != id })
        if (currentId == id) currentId = all().firstOrNull()?.id
    }

    var currentId: String?
        get() = prefs.getString("current", null)
        set(v) { prefs.edit().putString("current", v).apply() }

    private fun write(list: List<Profile>) {
        prefs.edit().putString("list", JSONArray(list.map { it.toJson() }).toString()).apply()
    }

    companion object {
        /** Accent colours for profiles (notification colour, switcher dot), assigned in order. */
        val COLORS = intArrayOf(0xFFC8582E.toInt(), 0xFF2F6FD0.toInt(), 0xFF2F8550.toInt(), 0xFF7448D0.toInt(), 0xFFC13A6B.toInt(), 0xFF4B5563.toInt())
    }
}
