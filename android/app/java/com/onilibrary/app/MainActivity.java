package com.onilibrary.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.database.Cursor;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executor;

/**
 * oniLibrary — offline WebView shell.
 * Serves the bundled static app from assets/www over a virtual https origin
 * so that localStorage / IndexedDB work with a secure context.
 *
 * Native bridges (window.OniAndroid):
 *  - setOverlayDepth / tts* / exportFile            (original)
 *  - setVolumeKeyMode      → reader page turns via volume keys
 *  - pendingImportInfo / readImportChunk / clearPendingImport
 *                          → files received via Share / Open-With
 *                          or the in-app picker (pickImportFile)
 *  - pickImportFile        → deterministic native file picker (LOC-001):
 *                            Android WebView only honours <input type=file>
 *                            when a WebChromeClient implements
 *                            onShowFileChooser — and that support is flaky
 *                            across WebView builds, so the library import
 *                            button calls this bridge instead and receives
 *                            the picked file through the same chunk channel
 *  - httpGetString / fetchToCache
 *                          → OPDS catalogs: CORS-free GET of feeds and
 *                            staged binary downloads (v1.2.0)
 *  - vaultBiometric        → platform biometric unlock for the Vault
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/index.html";
    private static final String ASSET_PREFIX = "/assets/";
    private static final int IMPORT_CHUNK = 96 * 1024; // base64-safe chunk size

    private static final int REQ_FILE_CHOOSER = 4001; // <input type=file>
    private static final int REQ_PICK_IMPORT  = 4002; // pickImportFile() bridge

    private WebView webView;
    private volatile int overlayDepth = 0;
    private volatile boolean volumeKeysActive = false;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // pending file received from another app (Share / Open-With) or the
    // in-app picker — both feed the same chunked transfer channel
    private final Object importLock = new Object();
    private File pendingImportFile = null;
    private String pendingImportName = null;
    private String pendingImportMime = "application/octet-stream";

    // Phase 4 (finding A2): fetchToCache stages into its OWN token-addressed
    // slot instead of stealing the single import slot — a background cover
    // fetch can no longer destroy an in-flight user import
    private static final class StagedFile {
        final File file;
        final String name;
        final String mime;
        final long createdAt;
        StagedFile(File f, String n, String m, long ts) { file = f; name = n; mime = m; createdAt = ts; }
    }
    private final Object stagedLock = new Object();
    private final java.util.LinkedHashMap<String, StagedFile> stagedFiles = new java.util.LinkedHashMap<>();

    // Phase 4 (finding A1): real app version in the HTTP UA (was hardcoded 1.3,
    // a value uploads.mangadex.org is known to refuse in some WebView flows)
    private String httpUserAgent = null;

    // in-flight <input type=file> callback (must be answered exactly once)
    private ValueCallback<Uri[]> pendingFileChooser = null;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
        MIME.put("txt", "text/plain");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("map", "application/json");
        MIME.put("pdf", "application/pdf");
        MIME.put("wasm", "application/wasm");
        MIME.put("epub", "application/epub+zip");
        MIME.put("cbz", "application/vnd.comicbook+zip");
        MIME.put("m4a", "audio/mp4");
        MIME.put("mp3", "audio/mpeg");
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(0xFFF7F1E8);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        createWebView();
        setContentView(webView);

        CookieManager.getInstance().setAcceptCookie(true);

        // native text-to-speech for the read-aloud feature (APK fallback —
        // WebView builds usually ship no browser voices)
        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) { }
                    @Override public void onDone(String utteranceId) {
                        notifyTtsDone();
                    }
                    @Override public void onError(String utteranceId) {
                        notifyTtsDone();
                    }
                });
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }

        handleIncomingIntent(getIntent());
    }

    /** open a non-virtual-host link outside the app; silently no-op if impossible */
    private void openExternally(Uri u) {
        if (u == null) return;
        String scheme = u.getScheme();
        if (scheme == null || !("http".equals(scheme) || "https".equals(scheme))) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) { /* no browser — drop the link */ }
    }

    /**
     * Rebuild the WebView after a renderer crash (or other unrecoverable
     * state): the old instance is destroyed and a fresh one loads START_URL.
     * The web app rehydrates its persisted store, so library data survives.
     */
    private void rebuildWebView() {
        mainHandler.post(() -> {
            if (webView == null) return;
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            createWebView();
            setContentView(webView);
            webView.loadUrl(START_URL);
            toast("Reader restarted");
        });
    }

    /** full WebView construction — shared by onCreate and rebuildWebView() */
    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(0xFFF7F1E8);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);

        webView.addJavascriptInterface(new Bridge(), "OniAndroid");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (pendingFileChooser != null) {
                    // a previous picker was never resolved — release it
                    pendingFileChooser.onReceiveValue(null);
                }
                pendingFileChooser = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    pendingFileChooser = null;
                    callback.onReceiveValue(null);
                    toast("No file picker available");
                    return true;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                // exact scheme+host match — lookalike hosts and http downgrade
                // are both refused (https is the only trusted scheme here)
                if (u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost())) return false;
                openExternally(u);
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // a crashed renderer must not take the whole app down:
                // rebuild the WebView and reload the shell (true = handled,
                // so the system must not kill the app process)
                rebuildWebView();
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) {
                    String path = u.getPath();
                    return serveAsset(path == null ? "/" : path);
                }
                return null;
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    /* ------------------------------------------------------------------ *
     *  Inbound files (ACTION_VIEW / ACTION_SEND with EXTRA_STREAM)
     * ------------------------------------------------------------------ */

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null) return;
        stageIncomingFile(uri);
    }

    /**
     * Copy a content:// Uri into the incoming cache on a worker thread and
     * publish it through the chunked bridge channel, then ping the web app
     * with `oni-android-import`. Shared by Share/Open-With intents AND the
     * in-app file picker (REQ_PICK_IMPORT).
     */
    private void stageIncomingFile(final Uri src) {
        // copy on a worker thread — streams can be slow
        new Thread(() -> {
            String name = queryName(src);
            String mime = pendingImportMime;
            try {
                String type = getContentResolver().getType(src);
                if (type != null && !type.isEmpty()) mime = type;
            } catch (Exception ignored) { }
            if (name == null || name.isEmpty()) {
                String last = src.getLastPathSegment();
                name = last == null ? "import.bin" : last.substring(last.lastIndexOf('/') + 1);
            }
            String safeName = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            File dir = new File(getCacheDir(), "incoming");
            if (!dir.exists()) dir.mkdirs();
            File dst = new File(dir, System.currentTimeMillis() + "-" + safeName);
            try (InputStream is = getContentResolver().openInputStream(src);
                 OutputStream os = new FileOutputStream(dst)) {
                if (is == null) throw new IOException("no stream");
                byte[] buf = new byte[16384];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
                synchronized (importLock) {
                    pendingImportFile = dst;
                    pendingImportName = safeName;
                    pendingImportMime = mime;
                }
                mainHandler.post(() -> {
                    toast("Received: " + safeName);
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('oni-android-import'))", null);
                    }
                });
            } catch (Exception e) {
                dst.delete();
                mainHandler.post(() ->
                        toast("Could not import the shared file"));
            }
        }, "oni-import").start();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            ValueCallback<Uri[]> cb = pendingFileChooser;
            pendingFileChooser = null;
            if (cb != null) {
                Uri[] picked = null;
                try {
                    picked = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                } catch (Exception ignored) { }
                cb.onReceiveValue(picked == null ? new Uri[0] : picked);
            }
            return;
        }
        if (requestCode == REQ_PICK_IMPORT) {
            Uri uri = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getData() != null) {
                    uri = data.getData();
                } else if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    uri = data.getClipData().getItemAt(0).getUri(); // multiple → first file
                }
            }
            if (uri != null) stageIncomingFile(uri);
        }
        // never call super with only-WebView request codes — harmless either way
        super.onActivityResult(requestCode, resultCode, data);
    }

    private String queryName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return c.getString(idx);
            }
        } catch (Exception ignored) { }
        return null;
    }

    /* ------------------------------------------------------------------ *
     *  Volume-key page turns (when the reader opts in)
     * ------------------------------------------------------------------ */

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (volumeKeysActive && event.getAction() == KeyEvent.ACTION_DOWN) {
            int kc = event.getKeyCode();
            if (kc == KeyEvent.KEYCODE_VOLUME_DOWN || kc == KeyEvent.KEYCODE_VOLUME_UP) {
                String dir = kc == KeyEvent.KEYCODE_VOLUME_DOWN ? "down" : "up";
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('oni-volume',{detail:{dir:'" + dir + "'}}))",
                    null);
                return true; // consume — do not change media volume
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private class Bridge {

        /* ------- last network failure reason (honest diagnostics) ------- */

        private volatile String lastHttpError = null;

        /** readable reason of the most recent failed bridge fetch (v1.4.0);
            null when the last fetch succeeded — lets the UI say WHY a source
            failed instead of a generic "connection failed" */
        @JavascriptInterface
        public String lastHttpError() {
            return lastHttpError;
        }
        @JavascriptInterface
        public void setOverlayDepth(int depth) {
            overlayDepth = depth;
        }

        /** reader toggles volume-key page turning on mount / off on unmount */
        @JavascriptInterface
        public void setVolumeKeyMode(boolean active) {
            volumeKeysActive = active;
        }

        @JavascriptInterface
        public int ttsAvailable() {
            return ttsReady ? 1 : 0;
        }

        /** speak one chunk — the JS queue calls this per paragraph chunk */
        @JavascriptInterface
        public void ttsSpeak(String text, String lang, float rate) {
            if (!ttsReady || tts == null || text == null || text.isEmpty()) return;
            Locale loc = (lang == null || lang.isEmpty()) ? Locale.getDefault() : Locale.forLanguageTag(lang);
            try {
                tts.setLanguage(loc);
            } catch (Exception ignored) { }
            tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "oni-" + System.nanoTime());
        }

        @JavascriptInterface
        public void ttsStop() {
            if (tts != null) tts.stop();
        }

        /**
         * Save a file produced by the web app (CSV export / .onibackup) to the
         * user-visible Downloads collection (API 29+) — falls back to the
         * system share sheet on older devices. base64 payload keeps the bridge
         * string-safe for UTF-8 content (Persian CSVs included).
         */
        @JavascriptInterface
        public String exportFile(String base64, String fileName, String mime) {
            if (base64 == null || fileName == null || fileName.isEmpty()) return "error";
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return "error";
            }
            final String safeName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, mime == null ? "application/octet-stream" : mime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "error";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) throw new IOException("no stream");
                        os.write(bytes);
                    }
                    toast("Saved to Downloads: " + safeName);
                    return "saved";
                }
                // legacy path: write to the public Downloads dir, share sheet on failure
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File out = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    fos.write(bytes);
                }
                toast("Saved to Downloads: " + safeName);
                return "saved";
            } catch (Exception e) {
                // permission-denied or full disk → offer the share sheet instead
                shareBytes(bytes, safeName, mime);
                return "shared";
            }
        }

        /* ------- inbound file transfer (chunked, survives large PDFs) ------- */

        /** JSON {name, mime, size} for the pending shared file, or "null" */
        @JavascriptInterface
        public String pendingImportInfo() {
            synchronized (importLock) {
                if (pendingImportFile == null || !pendingImportFile.exists()) return "null";
                return "{\"name\":" + jsonStr(pendingImportName)
                        + ",\"mime\":" + jsonStr(pendingImportMime)
                        + ",\"size\":" + pendingImportFile.length() + "}";
            }
        }

        /** base64 chunk of the pending file, or "" when out of range */
        @JavascriptInterface
        public String readImportChunk(int offset, int length) {
            synchronized (importLock) {
                if (pendingImportFile == null || !pendingImportFile.exists()) return "";
                try (RandomAccessFile raf = new RandomAccessFile(pendingImportFile, "r")) {
                    int len = Math.max(0, Math.min(length, IMPORT_CHUNK));
                    if (offset < 0 || offset >= raf.length()) return "";
                    len = (int) Math.min(len, raf.length() - offset);
                    byte[] buf = new byte[len];
                    raf.seek(offset);
                    raf.readFully(buf);
                    return Base64.encodeToString(buf, Base64.NO_WRAP);
                } catch (Exception e) {
                    return "";
                }
            }
        }

        @JavascriptInterface
        public void clearPendingImport() {
            synchronized (importLock) {
                if (pendingImportFile != null) pendingImportFile.delete();
                pendingImportFile = null;
                pendingImportName = null;
            }
        }

        /* ------------------- OPDS catalog transport (v1.2.0) ---------------- */

        private HttpURLConnection openGet(String urlStr) throws IOException {
            // callers enforce https-only (cleartext is disabled manifest-wide)
            lastHttpError = null;
            URL url = new URL(urlStr);
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(20000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("User-Agent", httpUa());
            return c;
        }

        /** "oniLibrary/<versionName> (Android)" — computed once from the
            package info so the UA can never drift from the manifest again */
        private String httpUa() {
            String ua = httpUserAgent;
            if (ua == null) {
                String v = "1.4";
                try {
                    v = MainActivity.this.getPackageManager()
                            .getPackageInfo(MainActivity.this.getPackageName(), 0).versionName;
                } catch (Exception ignored) { /* keep the safe fallback */ }
                ua = "oniLibrary/" + v + " (Android)";
                httpUserAgent = ua;
            }
            return ua;
        }

        /** CORS-free GET of a text document (OPDS feeds); null on failure */
        @JavascriptInterface
        public String httpGetString(String url, String headersJson) {
            // https only — the manifest forbids cleartext traffic, so a plain-
            // http request would fail at the platform level anyway
            if (url == null || !url.startsWith("https://")) return null;
            try {
                HttpURLConnection c = openGet(url);
                c.connect();
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) return null;
                    c = openGet(loc);
                    c.connect();
                    code = c.getResponseCode();
                }
                if (code < 200 || code >= 300) { lastHttpError = "HTTP " + code; c.disconnect(); return null; }
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(in, "UTF-8"))) {
                    char[] buf = new char[8192];
                    int n;
                    while ((n = r.read(buf)) > 0) sb.append(buf, 0, n);
                }
                c.disconnect();
                return sb.toString();
            } catch (Exception e) {
                lastHttpError = String.valueOf(e.getMessage());
                return null;
            }
        }

        /** CORS-free download of a binary (cover / acquisition file): stages it
            into its own token-addressed slot (Phase 4 finding A2 — this used
            to steal the shared import slot, destroying in-flight imports) so
            the JS side pulls it with readStagedChunk and clears it with
            clearStagedFile. Returns the JSON manifest {name,mime,size,token},
            or "null" on failure. */
        @JavascriptInterface
        public String fetchToCache(String url) {
            return stageDownload(url, null);
        }

        /** fetchToCache with extra request headers (v1.3.0) — Standard Ebooks
            OPDS gates acquisition files behind HTTP Basic auth; WebView JS
            calls this 2-arg overload, older call sites keep the 1-arg one. */
        @JavascriptInterface
        public String fetchToCache(String url, String headersJson) {
            return stageDownload(url, headersJson);
        }

        private String stageDownload(String url, String headersJson) {
            // https only — cleartext is disabled at the manifest level
            if (url == null || !url.startsWith("https://")) { lastHttpError = "insecure url"; return "null"; }
            InputStream in = null;
            try {
                HttpURLConnection c = openGet(url);
                if (headersJson != null && headersJson.length() > 2) {
                    try {
                        org.json.JSONObject h = new org.json.JSONObject(headersJson);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            c.setRequestProperty(k, h.optString(k));
                        }
                    } catch (Exception ignored) { /* bad header json → plain GET */ }
                }
                c.connect();
                int code = c.getResponseCode();
                if (code < 200 || code >= 300) { c.disconnect(); return "null"; }
                in = c.getInputStream();
                String mime = c.getContentType();
                if (mime != null) { int i = mime.indexOf(';'); if (i > 0) mime = mime.substring(0, i).trim(); }

                String rawName = url.substring(url.lastIndexOf('/') + 1);
                int q = rawName.indexOf('?');
                if (q >= 0) rawName = rawName.substring(0, q);
                if (rawName.isEmpty()) rawName = "opds-download";
                rawName = rawName.replaceAll("[\\\\/:*?\"<>|]", "_");

                File dir = new File(getCacheDir(), "oniImport");
                if (!dir.exists()) dir.mkdirs();
                final String token = java.util.UUID.randomUUID().toString().replace("-", "");
                File out = new File(dir, "fetch-" + token + "-" + rawName);
                long total = 0;
                try (OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        total += n;
                        if (total > 1024L * 1024L * 1024L) throw new IOException("too large");
                    }
                }
                String mimeOut = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
                synchronized (stagedLock) {
                    long now = System.currentTimeMillis();
                    stagedFiles.put(token, new StagedFile(out, rawName, mimeOut, now));
                    // evict slots nobody consumed (10 min) and keep the map small
                    java.util.Iterator<java.util.Map.Entry<String, StagedFile>> it = stagedFiles.entrySet().iterator();
                    while (it.hasNext()) {
                        StagedFile sf = it.next().getValue();
                        if (now - sf.createdAt > 10 * 60 * 1000L) { sf.file.delete(); it.remove(); }
                    }
                    while (stagedFiles.size() > 8) {
                        String oldestKey = null;
                        long oldest = Long.MAX_VALUE;
                        for (java.util.Map.Entry<String, StagedFile> e : stagedFiles.entrySet()) {
                            if (e.getValue().createdAt < oldest) { oldest = e.getValue().createdAt; oldestKey = e.getKey(); }
                        }
                        if (oldestKey == null) break;
                        StagedFile sf = stagedFiles.remove(oldestKey);
                        if (sf != null) sf.file.delete();
                    }
                }
                return "{\"name\":" + jsonStr(rawName)
                        + ",\"mime\":" + jsonStr(mimeOut)
                        + ",\"size\":" + total
                        + ",\"token\":" + jsonStr(token) + "}";
            } catch (Exception e) {
                return "null";
            } finally {
                if (in != null) { try { in.close(); } catch (IOException ignored) { } }
            }
        }

        /** base64 chunk of a token-addressed staged download (Phase 4 A2);
            "" when the slot is gone (consumed/evicted) or out of range */
        @JavascriptInterface
        public String readStagedChunk(String token, int offset, int length) {
            if (token == null) return "";
            synchronized (stagedLock) {
                StagedFile sf = stagedFiles.get(token);
                if (sf == null || !sf.file.exists()) return "";
                try (RandomAccessFile raf = new RandomAccessFile(sf.file, "r")) {
                    int len = Math.max(0, Math.min(length, IMPORT_CHUNK));
                    if (offset < 0 || offset >= raf.length()) return "";
                    len = (int) Math.min(len, raf.length() - offset);
                    byte[] buf = new byte[len];
                    raf.seek(offset);
                    raf.readFully(buf);
                    return Base64.encodeToString(buf, Base64.NO_WRAP);
                } catch (Exception e) {
                    return "";
                }
            }
        }

        /** delete the staged download that belongs to this token */
        @JavascriptInterface
        public void clearStagedFile(String token) {
            if (token == null) return;
            synchronized (stagedLock) {
                StagedFile sf = stagedFiles.remove(token);
                if (sf != null) sf.file.delete();
            }
        }

        /** Phase 4 (finding B6): true when the active network is metered —
            lets the Wi-Fi-only download policy work without guessing from
            the web Network Information API. Unknown → false (never block). */
        @JavascriptInterface
        public boolean isMetered() {
            try {
                android.net.ConnectivityManager cm =
                        (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (cm == null) return false;
                android.net.Network n = cm.getActiveNetwork();
                if (n == null) return false;
                android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                if (caps == null) return false;
                return !caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
            } catch (Exception e) {
                return false;
            }
        }

        /* ------------------------- in-app file picker ----------------------- */

        /**
         * Deterministic import path: opens the system document picker and
         * delivers the picked file through pendingImportInfo/readImportChunk
         * + an `oni-android-import` ping — identical to the Share-in flow the
         * web app already handles. Used by the library import button because
         * WebView file-chooser support is unreliable across devices.
         */
        @JavascriptInterface
        public void pickImportFile() {
            mainHandler.post(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(intent, REQ_PICK_IMPORT);
                } catch (Exception e) {
                    toast("No file picker available");
                }
            });
        }

        /* ---------------------------- biometrics ---------------------------- */

        /**
         * Platform biometric unlock for the Vault (API 28+). Biometric-only —
         * cancelling falls back to the JS PIN keypad. Reports through
         * window.OniNativeVaultAuth.done(ok:boolean).
         * Returns 1 when the prompt was started, 0 when unavailable.
         */
        @JavascriptInterface
        public int vaultBiometric() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return 0;
            try {
                CancellationSignal signal = new CancellationSignal();
                Executor exec = mainHandler::post;
                BiometricPrompt prompt = new BiometricPrompt.Builder(MainActivity.this)
                        .setTitle("oniLibrary")
                        .setSubtitle("Unlock your Vault")
                        .setNegativeButton("Cancel", exec,
                                (DialogInterface.OnClickListener) (dialog, which) -> notifyVaultAuth(false))
                        .build();
                prompt.authenticate(signal, exec, new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        notifyVaultAuth(true);
                    }
                    @Override
                    public void onAuthenticationFailed() { /* keep prompting */ }
                    @Override
                    public void onAuthenticationError(int code, CharSequence errString) {
                        notifyVaultAuth(false);
                    }
                    @Override
                    public void onAuthenticationHelp(int helpCode, CharSequence helpString) {
                        /* transient hint — keep prompting */ }
                });
                return 1;
            } catch (Exception e) {
                return 0;
            }
        }

        private String jsonStr(String v) {
            if (v == null) return "\"\"";
            return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        }

        /** system share sheet (ACTION_SEND) via FileProvider — universal fallback */
        private void shareBytes(byte[] bytes, String fileName, String mime) {
            try {
                File f = new File(getCacheDir(), "share/" + fileName);
                File parent = f.getParentFile();
                if (parent != null) parent.mkdirs();
                try (FileOutputStream fos = new FileOutputStream(f)) {
                    fos.write(bytes);
                }
                Uri uri = Uri.parse("content://" + ShareProvider.AUTH + "/" + fileName);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime == null ? "application/octet-stream" : mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_TITLE, fileName);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(send, "Share " + fileName));
            } catch (Exception ignored) { }
        }

    }

    private void toast(final String msg) {
        mainHandler.post(() ->
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
    }

    /** report chunk completion back into the JS read-aloud queue */
    private void notifyTtsDone() {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.OniNativeTts&&window.OniNativeTts.done()", null);
            }
        });
    }

    /** report biometric result back into the JS vault gate */
    private void notifyVaultAuth(boolean ok) {
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.OniNativeVaultAuth&&window.OniNativeVaultAuth.done(" + (ok ? "true" : "false") + ")",
                    null);
            }
        });
    }

    /**
     * Map a virtual-host URL path onto assets/www/ and serve it.
     * Accepts: "/", "/index.html", the legacy "/assets/…" prefix,
     * root-absolute asset paths ("/_next/static/chunks/x.js"), and
     * extension-less page paths ("/x" → "/x/index.html" or "/x.html").
     */
    private WebResourceResponse serveAsset(String rawPath) {
        String path = rawPath == null || rawPath.isEmpty() ? "/" : rawPath;
        if (path.startsWith(ASSET_PREFIX)) path = path.substring(ASSET_PREFIX.length());
        while (path.startsWith("/")) path = path.substring(1);
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        // SECURITY: reject traversal segments before touching AssetManager
        if (path.contains("..") || path.contains("\u0000")) {
            byte[] empty = new byte[0];
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(empty));
        }

        boolean looksLikePage = path.isEmpty() || !path.contains(".");
        String resolved = resolveAsset(path, looksLikePage);
        if (resolved == null && looksLikePage) resolved = "404.html"; // SPA not-found shell
        if (resolved == null) {
            // missing binary/static resource → empty 200 keeps the app alive
            byte[] empty = new byte[0];
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(empty));
        }

        try {
            InputStream is = getAssets().open("www/" + resolved);
            String ext = resolved.substring(resolved.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.get(ext);
            if (mime == null) mime = "application/octet-stream";
            boolean textual = mime.startsWith("text/") || mime.contains("javascript")
                    || mime.contains("json") || mime.contains("svg+xml") || mime.contains("wasm");
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            // immutable build output → cache hard; everything else revalidates
            headers.put("Cache-Control", resolved.startsWith("_next/")
                    ? "max-age=31536000, immutable" : "no-cache");
            WebResourceResponse resp = new WebResourceResponse(
                    mime, textual ? "utf-8" : null, is);
            resp.setResponseHeaders(headers);
            return resp;
        } catch (IOException e) {
            byte[] empty = new byte[0];
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(empty));
        }
    }

    /** try the exact path first, then directory/page-style fallbacks */
    private String resolveAsset(String path, boolean looksLikePage) {
        if (path.isEmpty()) return assetExists("index.html") ? "index.html" : null;
        if (assetExists(path)) return path;
        if (looksLikePage) {
            if (assetExists(path + "/index.html")) return path + "/index.html";
            if (assetExists(path + ".html")) return path + ".html";
        }
        return null;
    }

    private boolean assetExists(String p) {
        try {
            getAssets().open("www/" + p).close();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    @Override
    public void onBackPressed() {
        if (overlayDepth > 0) {
            // pop the SPA overlay stack
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))", null);
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tts != null) tts.stop(); // silence read-aloud when the app backgrounds
        webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) { }
            tts = null;
        }
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }
}
