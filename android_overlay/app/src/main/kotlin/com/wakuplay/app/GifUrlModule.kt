package com.wakuplay.app

import android.app.Activity
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.net.http.SslError
import android.provider.OpenableColumns
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

/** Dulu GifUrlPlugin.java: jendela WebView "GIF ke Link" (picturetolink.com) + tangkap link .gif. */
class GifUrlModule(private val act: Activity, private val em: Emitter) {
    private companion object {
        const val REQ_FILE = 9417
        const val MAX_BYTES = 5L * 1024 * 1024
        val GIF_URL = Regex("""^https://[^\s"'<>()\\]+\.gif(\?[^\s"'<>()\\]*)?$""", RegexOption.IGNORE_CASE)
    }

    private var dialog: Dialog? = null
    private var web: WebView? = null
    private var copyBtn: TextView? = null
    private var status: TextView? = null
    private var foundUrl: String? = null
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var script: String? = null

    private fun dp(v: Int): Int = Math.round(v * act.resources.displayMetrics.density)

    private fun loadScript(): String {
        script?.let { return it }
        val s = try { act.assets.open("wp-gifurl.js").bufferedReader(Charsets.UTF_8).use { it.readText() } } catch (_: Exception) { "" }
        script = s
        return s
    }

    private fun allowed(url: String?): Boolean = try {
        val u = Uri.parse(url ?: "")
        val h = u.host
        "https" == u.scheme && h != null && (h == "picturetolink.com" || h.endsWith(".picturetolink.com"))
    } catch (_: Exception) { false }

    private inner class Bridge {
        @JavascriptInterface
        fun url(u: String?) {
            if (u == null || u.length > 500 || !GIF_URL.matches(u)) return
            act.runOnUiThread {
                try {
                    val w = web ?: return@runOnUiThread
                    if (!allowed(w.url)) return@runOnUiThread
                    foundUrl = u
                    copyBtn?.let { it.alpha = 1f; it.isEnabled = true }
                    status?.text = "Link siap, tekan Salin"
                    em.emit("GifUrl", "gifUrl", JSONObject().put("url", u).toString())
                } catch (_: Exception) { }
            }
        }
    }

    private fun injectScript(v: WebView, url: String?) {
        if (url == null || !allowed(url)) return
        val s = loadScript()
        if (s.isNotEmpty()) v.evaluateJavascript(s, null)
    }

    private fun cancelChooser() {
        fileCb?.let { try { it.onReceiveValue(null) } catch (_: Exception) { } }
        fileCb = null
    }

    private fun sizeOf(u: Uri): Long {
        try {
            act.contentResolver.query(u, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) return c.getLong(0)
            }
        } catch (_: Exception) { }
        return -1
    }

    private fun typeOf(u: Uri): String? = try { act.contentResolver.getType(u) } catch (_: Exception) { null }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQ_FILE) return
        val cb = fileCb
        fileCb = null
        if (cb == null) return
        val r = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        if (r == null || r.isEmpty()) { cb.onReceiveValue(null); return }
        val u = r[0]
        val t = typeOf(u)
        val sz = sizeOf(u)
        if (t == null || t != "image/gif") { Toast.makeText(act, "File harus berformat .gif", Toast.LENGTH_LONG).show(); cb.onReceiveValue(null); return }
        if (sz < 0 || sz >= MAX_BYTES) { Toast.makeText(act, "GIF harus di bawah 5 MB", Toast.LENGTH_LONG).show(); cb.onReceiveValue(null); return }
        foundUrl = null
        copyBtn?.let { it.alpha = .4f; it.isEnabled = false }
        status?.text = "Mengunggah…"
        web?.evaluateJavascript("window.__wpUploaded=true", null)
        cb.onReceiveValue(arrayOf(u))
    }

    fun handle(method: String, args: Map<String, Any?>, result: MethodChannel.Result) {
        when (method) {
            "open" -> open(args["url"]?.toString(), args["title"]?.toString() ?: "GIF ke Link", result)
            "close" -> act.runOnUiThread { closeInternal(false); result.success(null) }
            else -> result.notImplemented()
        }
    }

    private fun open(url: String?, title: String, result: MethodChannel.Result) {
        if (url == null || !allowed(url)) { result.error("BAD", "Alamat tidak valid", null); return }
        act.runOnUiThread {
            try {
                closeInternal(false)
                foundUrl = null
                val dlg = Dialog(act, android.R.style.Theme_Black_NoTitleBar)
                dialog = dlg
                dlg.window?.let { w ->
                    w.statusBarColor = Color.parseColor("#0a0b0d")
                    w.navigationBarColor = Color.parseColor("#0a0b0d")
                    w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
                }
                val root = LinearLayout(act)
                root.orientation = LinearLayout.VERTICAL
                root.setBackgroundColor(Color.parseColor("#111214"))

                val bar = LinearLayout(act)
                bar.orientation = LinearLayout.HORIZONTAL
                bar.gravity = Gravity.CENTER_VERTICAL
                bar.setBackgroundColor(Color.parseColor("#0a0b0d"))
                bar.setPadding(dp(16), 0, dp(4), 0)

                val titles = LinearLayout(act)
                titles.orientation = LinearLayout.VERTICAL
                val tv = TextView(act)
                tv.text = title; tv.setTextColor(Color.WHITE); tv.textSize = 16f
                tv.setTypeface(null, Typeface.BOLD); tv.isSingleLine = true
                titles.addView(tv)
                val st = TextView(act)
                st.text = "Pilih GIF (di bawah 5 MB), tunggu link muncul"; st.setTextColor(Color.parseColor("#9aa4b8")); st.textSize = 11f; st.isSingleLine = true
                st.ellipsize = TextUtils.TruncateAt.END
                titles.addView(st)
                status = st
                bar.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

                val cb = TextView(act)
                cb.text = "Salin"; cb.setTextColor(Color.parseColor("#3a2500")); cb.textSize = 14f
                cb.setTypeface(null, Typeface.BOLD); cb.gravity = Gravity.CENTER
                cb.setBackgroundColor(Color.parseColor("#ffd45a"))
                cb.setPadding(dp(16), 0, dp(16), 0)
                cb.alpha = .4f; cb.isEnabled = false
                cb.setOnClickListener {
                    val f = foundUrl ?: return@setOnClickListener
                    try {
                        val cm = act.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newPlainText("GIF", f))
                        Toast.makeText(act, "Link .gif disalin", Toast.LENGTH_SHORT).show()
                    } catch (_: Exception) { }
                }
                copyBtn = cb
                val clp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(36))
                clp.rightMargin = dp(4)
                bar.addView(cb, clp)

                val x = TextView(act)
                x.text = "\u2715"; x.setTextColor(Color.WHITE); x.textSize = 22f; x.gravity = Gravity.CENTER
                x.contentDescription = "Tutup"
                x.setOnClickListener { closeInternal(true) }
                bar.addView(x, LinearLayout.LayoutParams(dp(52), dp(52)))
                root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))

                val pb = ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal)
                pb.max = 100
                root.addView(pb, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))

                val wv = WebView(act)
                web = wv
                wv.setBackgroundColor(Color.parseColor("#111214"))
                wv.addJavascriptInterface(Bridge(), "WPGif")
                val s = wv.settings
                s.javaScriptEnabled = true
                s.domStorageEnabled = true
                s.allowFileAccess = false
                s.allowContentAccess = true
                s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                s.setSupportMultipleWindows(false)
                s.javaScriptCanOpenWindowsAutomatically = false
                val cookies = CookieManager.getInstance()
                cookies.setAcceptCookie(true)
                cookies.setAcceptThirdPartyCookies(wv, true)

                wv.webChromeClient = object : WebChromeClient() {
                    override fun onProgressChanged(view: WebView?, p: Int) {
                        pb.progress = p
                        pb.visibility = if (p >= 100) View.GONE else View.VISIBLE
                    }

                    override fun onShowFileChooser(v: WebView?, cb: ValueCallback<Array<Uri>>?, params: WebChromeClient.FileChooserParams?): Boolean {
                        cancelChooser()
                        fileCb = cb
                        return try {
                            val it = Intent(Intent.ACTION_GET_CONTENT)
                            it.addCategory(Intent.CATEGORY_OPENABLE)
                            it.type = "image/gif"
                            it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
                            act.startActivityForResult(Intent.createChooser(it, "Pilih GIF"), REQ_FILE)
                            true
                        } catch (_: Exception) { cancelChooser(); false }
                    }
                }
                wv.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView?, r: WebResourceRequest?): Boolean = !allowed(r?.url?.toString())
                    override fun onPageStarted(v: WebView?, u: String?, f: Bitmap?) { if (v != null) injectScript(v, u) }
                    override fun onPageFinished(v: WebView?, u: String?) {
                        if (v == null) return
                        injectScript(v, u)
                        v.evaluateJavascript("window.__wpGifApply&&window.__wpGifApply()", null)
                    }
                    override fun onReceivedSslError(v: WebView?, h: SslErrorHandler?, e: SslError?) { h?.cancel() }
                }

                root.addView(wv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
                dlg.setContentView(root)
                dlg.setOnKeyListener { _, code, ev ->
                    if (code == KeyEvent.KEYCODE_BACK && ev.action == KeyEvent.ACTION_UP) { closeInternal(true); true }
                    else code == KeyEvent.KEYCODE_BACK
                }
                dlg.setCancelable(false)
                dlg.show()
                wv.loadUrl(url)
                result.success(null)
            } catch (_: Exception) {
                result.error("OPEN", "Gagal membuka GIF ke Link", null)
            }
        }
    }

    private fun closeInternal(notify: Boolean) {
        try {
            cancelChooser()
            web?.let { it.stopLoading(); it.destroy() }
            web = null
            dialog?.dismiss()
            dialog = null
        } catch (_: Exception) { }
        copyBtn = null
        status = null
        if (notify) em.emit("GifUrl", "closed", "{}")
    }

    fun dispose() { closeInternal(false) }
}
