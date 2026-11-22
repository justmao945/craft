package app.craft.android;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CraftGiftPlugin.class);
        registerPlugin(CraftRuntimePlugin.class);
        // Skip the platform's default exit animation (icon scales/fades away): remove
        // the splash view instantly so the identical window-background mark takes over
        // without any visible hand-off.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setOnExitAnimationListener(androidx.core.splashscreen.SplashScreenViewProvider::remove);
        super.onCreate(savedInstanceState);
        View webView = getBridge().getWebView();
        // Transparent until the page paints: the window background (boot icon) shows
        // through during WebView startup instead of a flat blank backdrop. The page's
        // own opaque backgrounds (--bg) take over as soon as HTML renders.
        webView.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        WindowInsetsControllerCompat systemBars = new WindowInsetsControllerCompat(getWindow(), webView);
        systemBars.setAppearanceLightStatusBars(true);
        systemBars.setAppearanceLightNavigationBars(true);
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
}
