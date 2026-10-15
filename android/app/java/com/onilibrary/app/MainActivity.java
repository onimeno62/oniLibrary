package com.onilibrary.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * oniLibrary — offline WebView shell.
 * Serves the bundled static app from assets/www over a virtual https origin
 * so that localStorage / IndexedDB work with a secure context.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/index.html";
    private static final String ASSET_PREFIX = "/assets/";

    private WebView webView;
    private volatile int overlayDepth = 0;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

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

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFF7F1E8);
        setContentView(webView);

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

        CookieManager.getInstance().setAcceptCookie(true);

        webView.addJavascriptInterface(new Bridge(), "OniAndroid");

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

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // Serve EVERY request made to the virtual host. The bundled
                // index.html references assets at root-absolute paths
                // (/_next/static/..., /logo-mark.svg, /manifest.webmanifest, …)
                // so filtering by the /assets/ prefix would break all of them —
                // the app would render as an unstyled shell (white screen with
                // only the orange logo). Map any host path onto assets/www/.
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) {
                    String path = u.getPath();
                    return serveAsset(path == null ? "/" : path);
                }
                return null;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void setOverlayDepth(int depth) {
            overlayDepth = depth;
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

        private void toast(final String msg) {
            mainHandler.post(() ->
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
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
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }
}
