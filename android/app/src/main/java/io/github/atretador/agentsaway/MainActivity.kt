package io.github.atretador.agentsaway

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * The app: one WebView per PC (profile) showing that PC's own Agents Away web app, plus what a web page
 * can't do itself — switching PCs, trusting each PC's private CA, pairing by QR code, and notifications
 * (NotifyService). The web app finds this side through `window.AwayNative` (see Bridge).
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val ACTION_OPEN = "io.github.atretador.agentsaway.OPEN"
        const val EXTRA_PROFILE = "profile"
        const val EXTRA_PATH = "path"
        private const val MAX_WEBVIEWS = 3 // recently used PCs stay loaded, so switching back is instant
    }

    private lateinit var store: ProfileStore
    private lateinit var root: FrameLayout
    private val webViews = LinkedHashMap<String, WebView>() // profile id → its WebView, least recently used first
    private var current: Profile? = null
    private val reloadedSignIn = HashSet<String>() // profiles whose page was reloaded once after an "unpaired" page
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val scan = registerForActivityResult(ScanContract()) { r -> r.contents?.let { pairWith(it) } }
    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }
    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { askBatteryOnce() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = ProfileStore(this)
        Notifier.channels(this)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        root = FrameLayout(this)
        setContentView(root)
        // Edge to edge (required from Android 15): keep content clear of the system bars and the keyboard.
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsets.CONSUMED
        }
        setBarColor(if (isNight()) 0xFF16130F.toInt() else 0xFFF6F2EC.toInt())
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val wv = current?.let { webViews[it.id] }
                if (wv != null && wv.parent != null && wv.canGoBack()) wv.goBack() else moveTaskToBack(true)
            }
        })
        if (!handleIntent(intent)) {
            val p = store.get(store.currentId) ?: store.all().firstOrNull()
            if (p != null) openProfile(p) else showWelcome()
        }
        if (store.all().isNotEmpty()) NotifyService.start(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (store.all().isNotEmpty()) NotifyService.start(this) // in case the system stopped it
    }

    /** Notification taps and launcher shortcuts: open a profile, optionally at a path ("/#/s/<id>"). */
    private fun handleIntent(i: Intent?): Boolean {
        if (i?.action != ACTION_OPEN) return false
        val p = store.get(i.getStringExtra(EXTRA_PROFILE)) ?: return false
        openProfile(p, i.getStringExtra(EXTRA_PATH))
        return true
    }

    private fun isNight() = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES

    /** Match the system bars to the page (the web app reports its background colour through the bridge). */
    fun setBarColor(color: Int) {
        root.setBackgroundColor(color)
        val light = Color.luminance(color) > 0.5f
        WindowInsetsControllerCompat(window, root).apply { isAppearanceLightStatusBars = light; isAppearanceLightNavigationBars = light }
    }

    // ───────── profiles ─────────

    private fun openProfile(p: Profile, path: String? = null) {
        current = p
        store.currentId = p.id
        useCookie(p)
        val wv = webViews[p.id]
        // Already loaded: show it right away (and navigate inside it if asked).
        if (wv != null && wv.url != null && p.owns(wv.url)) {
            show(wv)
            if (path != null) navigate(wv, p, path)
            return
        }
        showMessage(getString(R.string.connecting, p.name), progress = true)
        thread {
            val addr = Pairing.reachable(p)
            runOnUiThread {
                if (current?.id != p.id) return@runOnUiThread
                if (addr == null) showUnreachable(p) else load(p, addr, path)
            }
        }
    }

    private fun load(p: Profile, addr: String, path: String?) {
        if (p.lastAddress != addr) { p.lastAddress = addr; store.save(p) }
        useCookie(p)
        val wv = webViews.remove(p.id) ?: newWebView(p)
        webViews[p.id] = wv
        trimWebViews()
        show(wv)
        wv.loadUrl(addr + (path ?: "/"))
        updateShortcuts()
    }

    /**
     * The PC's sign-in is one device cookie; give it to every address of this PC. WebView cookies belong to
     * a host, not a host and port, so two PCs reached at the same IP (different ports) would share one
     * cookie: set it again whenever a PC is opened, and drop any loaded page of another PC on the same host.
     */
    private fun useCookie(p: Profile) {
        val hosts = p.addresses.map { Trust.host(it) }.toSet()
        for (other in store.all()) {
            if (other.id == p.id || other.addresses.none { Trust.host(it) in hosts }) continue
            webViews.remove(other.id)?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
        }
        val cm = CookieManager.getInstance()
        for (a in p.addresses) cm.setCookie(a, "${p.cookie}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000")
        cm.flush()
    }

    private fun navigate(wv: WebView, p: Profile, path: String) {
        val origin = p.addresses.firstOrNull { wv.url?.startsWith(it) == true } ?: return
        wv.loadUrl(origin + path)
    }

    private fun trimWebViews() {
        while (webViews.size > MAX_WEBVIEWS) {
            val oldest = webViews.keys.first { it != current?.id }
            webViews.remove(oldest)?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
        }
    }

    private fun show(v: View) {
        root.removeAllViews()
        (v.parent as? ViewGroup)?.removeView(v)
        root.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun profileOf(view: WebView): Profile? = webViews.entries.firstOrNull { it.value === view }?.key?.let { id -> store.get(id) }

    @SuppressLint("SetJavaScriptEnabled")
    private fun newWebView(p: Profile): WebView = WebView(this).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportMultipleWindows(false)
        settings.mediaPlaybackRequiresUserGesture = true
        settings.userAgentString = settings.userAgentString + " AgentsAwayApp/" + BuildConfig.VERSION_NAME
        setBackgroundColor(Color.TRANSPARENT)
        addJavascriptInterface(Bridge(p.id, this), "AwayNative")
        webViewClient = object : WebViewClient() {
            // Each PC's own CA, pinned: accept only certificates it signed, for this PC's addresses.
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                val prof = profileOf(view)
                val u = Uri.parse(error.url)
                val origin = "https://${u.host}${if (u.port > 0) ":${u.port}" else ""}"
                val leaf = error.certificate.x509Certificate
                val ok = prof != null && origin in prof.addresses && leaf != null &&
                    Trust.verifyServer(leaf, Trust.parseCert(prof.caPem), u.host ?: "")
                if (ok) handler.proceed() else handler.cancel()
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val prof = profileOf(view) ?: return true
                val url = request.url.toString()
                if (prof.owns(url)) return false
                // Anything else (links in chats, docs) opens in the browser, outside the PC's app.
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) profileOf(view)?.let { if (it.id == current?.id) showUnreachable(it) }
            }
            override fun onPageFinished(view: WebView, url: String) {
                // The PC no longer knows this phone (signed out from ⚙ → Paired devices, or expired).
                view.evaluateJavascript("!!document.querySelector('[data-i18n=\"unpaired\"]')") { r ->
                    val p = profileOf(view) ?: return@evaluateJavascript
                    if (r != "true") reloadedSignIn.remove(p.id)
                    else if (reloadedSignIn.add(p.id)) checkSignedOut(p, view) else signedOutDialog(p)
                }
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try { pickFiles.launch(params.createIntent()); true } catch (e: Exception) { fileCallback = null; false }
            }
        }
    }

    /** What the web app can call. Every call is checked against the WebView's current page: only this
     *  PC's own pages may use it (the interface is visible to any script the WebView runs). */
    inner class Bridge(private val profileId: String, private val view: WebView) {
        private fun onUi(block: (Profile) -> Unit) = runOnUiThread {
            val p = store.get(profileId) ?: return@runOnUiThread
            if (p.owns(view.url)) block(p)
        }
        @JavascriptInterface fun openProfiles() = onUi { showSwitcher() }
        @JavascriptInterface fun openNotificationSettings() = onUi {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        /** {profile, version}: the PC's name is the profile's name. */
        @JavascriptInterface fun serverInfo(json: String) = onUi { p ->
            val name = runCatching { JSONObject(json).optString("profile") }.getOrNull()?.trim().orEmpty()
            if (name.isNotEmpty() && name != p.name) { p.name = name; store.save(p); updateShortcuts(); NotifyService.start(this@MainActivity) }
        }
        @JavascriptInterface fun themeColor(css: String) = onUi { p ->
            if (current?.id == p.id) parseCssColor(css)?.let { setBarColor(it) }
        }
    }

    private fun parseCssColor(css: String): Int? {
        val m = Regex("""rgba?\((\d+),\s*(\d+),\s*(\d+)""").find(css) ?: return runCatching { Color.parseColor(css.trim()) }.getOrNull()
        val (r, g, b) = m.destructured
        return Color.rgb(r.toInt(), g.toInt(), b.toInt())
    }

    // ───────── switcher, pairing, removal ─────────

    fun showSwitcher() {
        val profiles = store.all()
        val labels = profiles.map { (if (it.id == current?.id) "● " else "○ ") + it.name } +
            getString(R.string.add_pc) + getString(R.string.remove_pc)
        AlertDialog.Builder(this).setTitle(R.string.switch_title)
            .setItems(labels.toTypedArray()) { _, i ->
                when {
                    i < profiles.size -> openProfile(profiles[i])
                    i == profiles.size -> addPcDialog()
                    else -> removeDialog()
                }
            }.show()
    }

    private fun addPcDialog() {
        AlertDialog.Builder(this).setTitle(R.string.add_pc)
            .setMessage(R.string.add_pc_text)
            .setPositiveButton(R.string.scan_qr) { _, _ -> startScan() }
            .setNeutralButton(R.string.paste_link) { _, _ -> pasteDialog() }
            .setNegativeButton(android.R.string.cancel, null).show()
    }

    private fun startScan() {
        scan.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt(getString(R.string.scan_prompt))
            .setBeepEnabled(false).setOrientationLocked(false))
    }

    private fun pasteDialog() {
        val input = EditText(this).apply {
            hint = "https://…/pair?t=…"
            val clip = getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text?.toString()
            if (clip != null && clip.contains("/pair?")) setText(clip)
        }
        val box = FrameLayout(this).apply { setPadding(dp(20), dp(8), dp(20), 0); addView(input) }
        AlertDialog.Builder(this).setTitle(R.string.paste_link).setView(box)
            .setPositiveButton(R.string.pair) { _, _ -> pairWith(input.text.toString()) }
            .setNegativeButton(android.R.string.cancel, null).show()
    }

    private fun pairWith(text: String) {
        val link = try { Pairing.parse(text) } catch (e: PairError) { errorDialog(getString(e.messageRes), null); return }
        showMessage(getString(R.string.pairing, link.name ?: Trust.host(link.origin)), progress = true)
        thread {
            try {
                val p = Pairing.pair(store, link)
                runOnUiThread {
                    webViews.remove(p.id)?.destroy() // re-paired: start that PC's page afresh with the new sign-in
                    NotifyService.start(this)
                    setupNotifications()
                    openProfile(p)
                }
            } catch (e: Exception) {
                val msg = if (e is PairError) getString(e.messageRes) else getString(R.string.pair_unreachable)
                val detail = if (e is PairError) e.detail else e.message
                runOnUiThread { errorDialog(msg, detail); current?.let { openProfile(it) } ?: showWelcome() }
            }
        }
    }

    private fun removeDialog() {
        val profiles = store.all()
        AlertDialog.Builder(this).setTitle(R.string.remove_pc)
            .setItems(profiles.map { it.name }.toTypedArray()) { _, i ->
                val p = profiles[i]
                AlertDialog.Builder(this).setTitle(getString(R.string.remove_confirm, p.name)).setMessage(R.string.remove_text)
                    .setPositiveButton(R.string.remove) { _, _ -> remove(p) }
                    .setNegativeButton(android.R.string.cancel, null).show()
            }.show()
    }

    private fun remove(p: Profile) {
        thread { signOutOnPc(p) } // best effort: also removes this phone from the PC's paired devices
        store.remove(p.id)
        webViews.remove(p.id)?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
        val cm = CookieManager.getInstance()
        for (a in p.addresses) cm.setCookie(a, "away_dev=; Path=/; Max-Age=0")
        cm.flush()
        NotifyService.start(this)
        updateShortcuts()
        val next = store.all().firstOrNull()
        if (current?.id == p.id) { current = null; if (next != null) openProfile(next) else showWelcome() }
    }

    private fun signOutOnPc(p: Profile) = runCatching {
        val addr = Pairing.reachable(p) ?: return@runCatching
        val c = Trust.client(p.caPem)
        val id = c.newCall(Request.Builder().url("$addr/api/devices").header("cookie", p.cookie).build()).execute().use { r ->
            val a = JSONObject(r.body.string()).getJSONArray("devices")
            (0 until a.length()).map { a.getJSONObject(it) }.firstOrNull { it.optBoolean("current") }?.optString("id")
        } ?: return@runCatching
        c.newCall(Request.Builder().url("$addr/api/devices/$id/signout").header("cookie", p.cookie).header("x-away", "1")
            .post(ByteArray(0).toRequestBody()).build()).execute().close()
    }

    /** The page says "not signed in": ask the PC directly with this profile's sign-in before believing it. */
    private fun checkSignedOut(p: Profile, view: WebView) = thread {
        val addr = Pairing.reachable(p)
        val ok = addr != null && runCatching {
            Trust.client(p.caPem).newCall(Request.Builder().url("$addr/api/state").header("cookie", p.cookie).build()).execute().use { it.code == 200 }
        }.getOrDefault(false)
        runOnUiThread {
            if (current?.id != p.id) return@runOnUiThread
            if (ok && addr != null) { useCookie(p); view.loadUrl("$addr/") } else if (addr != null) signedOutDialog(p)
        }
    }

    private fun signedOutDialog(p: Profile) {
        AlertDialog.Builder(this).setTitle(getString(R.string.signed_out_title, p.name)).setMessage(R.string.signed_out_text)
            .setPositiveButton(R.string.scan_qr) { _, _ -> startScan() }
            .setNeutralButton(R.string.paste_link) { _, _ -> pasteDialog() }
            .setNegativeButton(android.R.string.cancel, null).show()
    }

    private fun errorDialog(msg: String, detail: String?) {
        AlertDialog.Builder(this).setTitle(R.string.pair_failed).setMessage(if (detail.isNullOrBlank()) msg else "$msg\n\n($detail)")
            .setPositiveButton(android.R.string.ok, null).show()
    }

    // ───────── notifications setup ─────────

    /** Notification permission (Android 13+), then — once — the battery optimisation exemption, without which
     *  Android may cut the PC connections while the phone sleeps. */
    private fun setupNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else askBatteryOnce()
    }

    @SuppressLint("BatteryLife")
    private fun askBatteryOnce() {
        val prefs = getSharedPreferences("app", MODE_PRIVATE)
        if (prefs.getBoolean("askedBattery", false)) return
        if (getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)) return
        prefs.edit().putBoolean("askedBattery", true).apply()
        AlertDialog.Builder(this).setTitle(R.string.battery_title).setMessage(R.string.battery_text)
            .setPositiveButton(R.string.battery_allow) { _, _ ->
                runCatching { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
            }
            .setNegativeButton(R.string.not_now, null).show()
    }

    // ───────── native screens (no PC yet / connecting / unreachable) ─────────

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun screen(title: String?, text: String, progress: Boolean, vararg buttons: Pair<String, () -> Unit>): View {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
        }
        val fg = if (isNight()) 0xFFF1EBE2.toInt() else 0xFF221D17.toInt()
        if (title != null) col.addView(TextView(this).apply { this.text = title; textSize = 24f; setTextColor(fg); gravity = Gravity.CENTER; setPadding(0, 0, 0, dp(12)) })
        col.addView(TextView(this).apply { this.text = text; textSize = 16f; setTextColor(fg); alpha = .8f; gravity = Gravity.CENTER })
        if (progress) col.addView(ProgressBar(this).apply { setPadding(0, dp(24), 0, 0) })
        for ((label, action) in buttons) col.addView(Button(this).apply { this.text = label; setOnClickListener { action() } },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
        return col
    }

    private fun showMessage(text: String, progress: Boolean) = show(screen(null, text, progress))

    private fun showWelcome() {
        current = null
        show(screen(getString(R.string.app_name), getString(R.string.welcome_text), false,
            getString(R.string.scan_qr) to { startScan() },
            getString(R.string.paste_link) to { pasteDialog() }))
    }

    private fun showUnreachable(p: Profile) {
        show(screen(getString(R.string.unreachable_title, p.name), getString(R.string.unreachable_text, p.addresses.joinToString("\n")), false,
            getString(R.string.retry) to { openProfile(p) },
            getString(R.string.switch_title) to { showSwitcher() }))
    }

    private fun updateShortcuts() {
        val list = store.all().take(4).map { p ->
            ShortcutInfoCompat.Builder(this, "p-" + p.id).setShortLabel(p.name).setLongLabel(p.name)
                .setIcon(IconCompat.createWithResource(this, R.mipmap.ic_launcher))
                .setIntent(Intent(this, MainActivity::class.java).setAction(ACTION_OPEN).putExtra(EXTRA_PROFILE, p.id))
                .build()
        }
        runCatching { ShortcutManagerCompat.setDynamicShortcuts(this, list) }
    }
}
