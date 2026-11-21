package app.craft.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Standalone native preview: a fullscreen WebView with no Capacitor bridge that renders
 * a stored draft or release build from {@link CraftStore}. HTML is assembled with an
 * https app-local base URL, the bundled runtime script inlined before the app JS, and
 * CRAFT_CONTEXT injected before everything else.
 */
public class PreviewActivity extends Activity {

    /** Single-argument async callback for screenshot/evaluate results. */
    public interface StringCallback {
        void onResult(String value);
    }

    public static final String EXTRA_APP_ID = "appId";
    public static final String EXTRA_ENVIRONMENT = "environment";
    public static final String EXTRA_TITLE = "title";

    private static final String BASE_URL = "https://craft.local/";
    private static final String RUNTIME_ASSET = "public/craft-runtime.js";
    private static final int MAX_LOGS = 500;

    private static WeakReference<PreviewActivity> currentRef;

    private WebView webView;
    private CraftStore store;
    private String appId;
    private String environment;

    private final Object logLock = new Object();
    private final ArrayList<String> logs = new ArrayList<>();

    /** Current preview instance, or null while none is open. */
    public static PreviewActivity peek() {
        return currentRef == null ? null : currentRef.get();
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentRef = new WeakReference<>(this);
        store = new CraftStore(getApplicationContext());

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadsImagesAutomatically(true);
        webView.setBackgroundColor(0xFF101418);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                addLog(formatConsole(message));
                return true;
            }
        });
        setContentView(webView);
        applyIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIntent(intent);
    }

    @Override
    protected void onDestroy() {
        if (currentRef != null && currentRef.get() == this) {
            currentRef.clear();
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** Loads (or reloads) the build described by the intent extras. */
    public void applyIntent(Intent intent) {
        appId = intent.getStringExtra(EXTRA_APP_ID);
        environment = intent.getStringExtra(EXTRA_ENVIRONMENT);
        String title = intent.getStringExtra(EXTRA_TITLE);
        setTitle(title == null || title.trim().isEmpty() ? "Craft Preview" : title.trim());
        loadCurrentBuild();
    }

    private void loadCurrentBuild() {
        CraftStore.Build build;
        try {
            build = store.getBuildFor(appId, environment);
        } catch (Exception e) {
            String message = e.getMessage() == null ? "Unknown error" : e.getMessage();
            addLog("[preview] " + message);
            webView.loadDataWithBaseURL(BASE_URL, errorHtml(message), "text/html", "utf-8", null);
            return;
        }
        webView.loadDataWithBaseURL(BASE_URL, buildHtml(build), "text/html", "utf-8", null);
    }

    // ---------------------------------------------------------------- html

    private String buildHtml(CraftStore.Build build) {
        String runtimeJs = readAsset(RUNTIME_ASSET);
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
        sb.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">");
        sb.append("<style>").append(escapeScript(BASE_CSS)).append("</style>");
        sb.append("<style>").append(escapeScript(build.css)).append("</style>");
        sb.append("</head><body><div id=\"root\"></div>");
        sb.append("<script>window.CRAFT_CONTEXT=").append(escapeScript(contextJson())).append(";</script>");
        sb.append("<script>").append(escapeScript(ERROR_HOOKS_JS)).append("</script>");
        sb.append("<script>").append(escapeScript(runtimeJs)).append("</script>");
        sb.append("<script>").append(escapeScript(build.js)).append("</script>");
        sb.append("</body></html>");
        return sb.toString();
    }

    private String errorHtml(String message) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
        sb.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">");
        sb.append("<style>body{background:#101418;color:#f28b82;font-family:monospace;padding:24px;white-space:pre-wrap;}</style>");
        sb.append("</head><body><div id=\"root\"></div>");
        sb.append("<script>window.CRAFT_CONTEXT=").append(escapeScript(contextJson())).append(";</script>");
        sb.append("<pre id=\"craft-error\">").append(escapeHtml(message)).append("</pre>");
        sb.append("</body></html>");
        return sb.toString();
    }

    private String contextJson() {
        JSONObject ctx = new JSONObject();
        try {
            ctx.put("appId", appId == null ? "" : appId);
            ctx.put("environment", environment == null ? "draft" : environment);
        } catch (Exception ignored) {
            // appId/environment are plain strings; put cannot fail
        }
        return ctx.toString();
    }

    /**
     * Prevents </script> (and HTML comment) breakout when inlining untrusted JS/CSS/JSON
     * into a <script> block.
     */
    private static String escapeScript(String source) {
        if (source == null || source.isEmpty()) {
            return "";
        }
        return source
                .replaceAll("(?i)</script", "<\\\\/script")
                .replaceAll("(?i)<!--", "<\\\\!--");
    }

    private static String escapeHtml(String source) {
        if (source == null) {
            return "";
        }
        return source
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private String readAsset(String path) {
        InputStream is = null;
        try {
            is = getAssets().open(path);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) != -1) {
                bos.write(buffer, 0, read);
            }
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            addLog("[preview] runtime script not found in android assets: " + path + " (run cap sync)");
            return "";
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (Exception ignored) {
                    // ignore close failures
                }
            }
        }
    }

    // ------------------------------------------------------ driver helpers

    /** Must be called on the UI thread. Captures the actual rendered WebView pixels. */
    public void captureScreenshot(StringCallback callback) {
        if (webView == null) {
            callback.onResult(null);
            return;
        }
        int width = webView.getWidth();
        int height = webView.getHeight();
        if (width <= 0 || height <= 0) {
            callback.onResult(null);
            return;
        }
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        webView.draw(canvas);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, bos);
        bitmap.recycle();
        callback.onResult("data:image/png;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
    }

    /** Must be called on the UI thread. Resolves with the raw JSON result text. */
    public void evaluateJs(String script, final StringCallback callback) {
        if (webView == null) {
            callback.onResult(null);
            return;
        }
        webView.evaluateJavascript(script, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                callback.onResult(value);
            }
        });
    }

    /** Bounded copy of captured console + runtime error logs. */
    public List<String> getLogsSnapshot() {
        synchronized (logLock) {
            return new ArrayList<>(logs);
        }
    }

    private void addLog(String line) {
        synchronized (logLock) {
            if (logs.size() >= MAX_LOGS) {
                logs.remove(0);
            }
            logs.add(line);
        }
    }

    private String formatConsole(ConsoleMessage message) {
        ConsoleMessage.MessageLevel level = message.messageLevel();
        String levelName = level == null ? "log" : level.toString().toLowerCase(Locale.US);
        String line = "[" + levelName + "] " + (message.message() == null ? "" : message.message());
        if (level == ConsoleMessage.MessageLevel.ERROR
                && message.sourceId() != null && !message.sourceId().isEmpty()) {
            line += " (" + shortSource(message.sourceId()) + ":" + message.lineNumber() + ")";
        }
        return line;
    }

    private static String shortSource(String sourceId) {
        int slash = Math.max(sourceId.lastIndexOf('/'), sourceId.lastIndexOf('\\'));
        return slash >= 0 ? sourceId.substring(slash + 1) : sourceId;
    }

    // --------------------------------------------------------- page assets

    private static final String BASE_CSS =
            "html,body{margin:0;padding:0;min-height:100%;background:#f2f4ee;color:#19251f;"
            + "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
            + "-webkit-tap-highlight-color:transparent;}"
            + "*{box-sizing:border-box;}"
            + "body{touch-action:manipulation;}"
            + "#root{min-height:100vh;}";

    /** Forwards window errors and unhandled rejections into console.error for capture. */
    private static final String ERROR_HOOKS_JS =
            "window.addEventListener('error',function(e){"
            + "var m=e&&e.message?e.message:String(e);"
            + "var loc=(e&&e.filename?e.filename+':'+e.lineno+':'+e.colno:'');"
            + "console.error('[window.onerror] '+m+(loc?' ('+loc+')':''));"
            + "});"
            + "window.addEventListener('unhandledrejection',function(e){"
            + "var r=e&&e.reason;"
            + "var s=(r&&(r.stack||r.message))?(r.stack||r.message):String(r);"
            + "console.error('[unhandledrejection] '+s);"
            + "});";
}
