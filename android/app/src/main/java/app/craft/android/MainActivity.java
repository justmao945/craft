package app.craft.android;

import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CraftGiftPlugin.class);
        registerPlugin(CraftRuntimePlugin.class);
        // Drop the platform's default exit animation, but hold the splash view until the
        // activity has committed its first real frame: removing it earlier exposes a blank
        // window while the WebView warms up. A watchdog removes it after 2s regardless.
        AtomicBoolean removed = new AtomicBoolean(false);
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setOnExitAnimationListener(provider -> {
            Runnable remove = () -> {
                if (removed.compareAndSet(false, true)) provider.remove();
            };
            View decor = getWindow().getDecorView();
            // Remove-on-draw must be deferred: calling removeOnDrawListener synchronously
            // inside onDraw throws IllegalStateException.
            final ViewTreeObserver.OnDrawListener[] self = new ViewTreeObserver.OnDrawListener[1];
            ViewTreeObserver.OnDrawListener drawListener = () -> decor.post(() -> {
                decor.getViewTreeObserver().removeOnDrawListener(self[0]);
                remove.run();
            });
            self[0] = drawListener;
            decor.getViewTreeObserver().addOnDrawListener(drawListener);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (removed.compareAndSet(false, true)) {
                    decor.getViewTreeObserver().removeOnDrawListener(drawListener);
                    provider.remove();
                }
            }, 2000);
        });
        super.onCreate(savedInstanceState);
        View webView = getBridge().getWebView();
        // Transparent until the page paints: the window background (boot icon) shows
        // through during WebView startup instead of a flat blank backdrop. The page's
        // own opaque backgrounds (--bg) take over as soon as HTML renders.
        webView.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        // The page paints its own dark theme from prefers-color-scheme; the system must not
        // re-tint it on top once the app theme turns dark.
        WebSettingsCompat.setAlgorithmicDarkeningAllowed(getBridge().getWebView().getSettings(), false);
        applySystemBarAppearance();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            int top = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            int navigationBottom = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            int imeBottom = windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int bottom = Math.max(navigationBottom, imeBottom);
            ViewGroup.MarginLayoutParams layout = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
            if (layout.topMargin != top || layout.bottomMargin != bottom) {
                layout.topMargin = top;
                layout.bottomMargin = bottom;
                view.setLayoutParams(layout);
            }
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    /** System bar icon contrast follows the system theme; the bool resolves the night qualifier. */
    private void applySystemBarAppearance() {
        WindowInsetsControllerCompat systemBars = new WindowInsetsControllerCompat(getWindow(), getBridge().getWebView());
        boolean lightBars = getResources().getBoolean(R.bool.light_system_bars);
        systemBars.setAppearanceLightStatusBars(lightBars);
        systemBars.setAppearanceLightNavigationBars(lightBars);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarAppearance();
    }
}
