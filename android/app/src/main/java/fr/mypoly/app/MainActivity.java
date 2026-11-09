package fr.mypoly.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * MyPoly pour Android : le site MyPoly (MyPoly, Carton !, Petits chevaux, Fin de mois)
 * dans une vue web plein écran optimisée pour le jeu sur téléphone.
 *  - plein écran immersif, écran toujours allumé pendant la partie, rotation libre
 *  - 3D (WebGL), musique sans clic préalable, cookies de connexion conservés
 *  - bouton retour du téléphone, partage natif des invitations, vibrations
 *  - liens d'invitation https://<site>/r/CODE ouverts directement dans l'application
 *  - écran hors connexion avec nouvelle tentative automatique
 */
public class MainActivity extends Activity {
    private static final String PREFS = "mypoly";
    private static final String KEY_URL = "site_url";
    private static final int BG = Color.parseColor("#0F1225");

    private FrameLayout root;
    private WebView web;
    private View loader;
    private View offline;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private String siteUrl;
    private String pendingUrl;
    private long lastBack;
    private final Handler handler = new Handler(Looper.getMainLooper());

    // ------------------------------------------------------------------ cycle de vie
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(BG);
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root);

        siteUrl = prefs().getString(KEY_URL, BuildConfig.SITE_URL);
        pendingUrl = linkFrom(getIntent());
        if (siteUrl == null || siteUrl.isEmpty()) showSetup(null);
        else startSite(savedInstanceState);
        hideSystemBars();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String link = linkFrom(intent);
        if (link != null && web != null) web.loadUrl(link);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ------------------------------------------------------------------ site
    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Lien d'invitation reçu (https://<site>/r/CODE ou mypoly://r/CODE). */
    private String linkFrom(Intent intent) {
        if (intent == null || intent.getData() == null) return null;
        Uri u = intent.getData();
        if ("mypoly".equals(u.getScheme())) {
            String base = siteUrl != null ? siteUrl : prefs().getString(KEY_URL, BuildConfig.SITE_URL);
            if (base == null || base.isEmpty()) return null;
            String path = (u.getHost() != null ? "/" + u.getHost() : "") + (u.getPath() != null ? u.getPath() : "");
            return base + path;
        }
        return isOwnUrl(u.toString()) ? u.toString() : null;
    }

    private boolean isOwnUrl(String url) {
        if (siteUrl == null || siteUrl.isEmpty() || url == null) return false;
        Uri a = Uri.parse(url);
        Uri b = Uri.parse(siteUrl);
        return a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost());
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void startSite(Bundle state) {
        root.removeAllViews();
        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // musique de la salle
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100); // la taille de police système ne casse pas la mise en page
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " MyPolyApp/" + BuildConfig.VERSION_NAME);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) s.setForceDark(WebSettings.FORCE_DARK_OFF);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "MyPolyAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loader = buildLoader();
        root.addView(loader);

        if (state != null && web.restoreState(state) != null) {
            loader.setVisibility(View.GONE);
        } else {
            web.loadUrl(pendingUrl != null ? pendingUrl : siteUrl + "/");
        }
        pendingUrl = null;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (isOwnUrl(url) || url.startsWith("about:") || url.startsWith("data:")) return false;
            // Liens externes (YouTube, réseaux sociaux…) : navigateur ou application dédiée
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            view.evaluateJavascript(BRIDGE_JS, null);
            if (loader != null) loader.animate().alpha(0f).setDuration(250).withEndAction(() -> loader.setVisibility(View.GONE)).start();
            if (offline != null) {
                root.removeView(offline);
                offline = null;
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) showOffline();
        }
    }

    private class Chrome extends WebChromeClient {
        // Vidéo plein écran (YouTube…)
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            root.removeView(customView);
            customView = null;
            if (customViewCallback != null) customViewCallback.onCustomViewHidden();
            customViewCallback = null;
            hideSystemBars();
        }
    }

    /** Fonctions natives accessibles depuis le site (window.MyPolyAndroid). */
    private class Bridge {
        @JavascriptInterface
        public void share(String title, String text, String url) {
            handler.post(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                String body = (text != null && !text.isEmpty() ? text + "\n" : "") + (url != null ? url : "");
                i.putExtra(Intent.EXTRA_SUBJECT, title != null ? title : "MyPoly");
                i.putExtra(Intent.EXTRA_TEXT, body.trim());
                startActivity(Intent.createChooser(i, "Inviter des amis"));
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            int d = Math.max(5, Math.min(ms, 600));
            v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void changeServer() {
            handler.post(() -> showSetup(siteUrl));
        }
    }

    /** Partage natif pour les invitations + marqueur « application » pour le site. */
    private static final String BRIDGE_JS =
        "(function(){if(window.__mpApp)return;window.__mpApp=1;"
        + "document.documentElement.classList.add('in-app');"
        + "navigator.share=function(d){d=d||{};MyPolyAndroid.share(d.title||'MyPoly',d.text||'',d.url||'');return Promise.resolve();};"
        + "navigator.canShare=function(){return true;};"
        + "navigator.vibrate=function(p){var ms=Array.isArray(p)?p.reduce(function(a,b){return a+b;},0):p;MyPolyAndroid.vibrate(ms|0);return true;};"
        + "})();";

    // ------------------------------------------------------------------ retour
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                new Chrome().onHideCustomView();
                return true;
            }
            if (web != null && web.canGoBack()) {
                web.goBack();
                return true;
            }
            long now = System.currentTimeMillis();
            if (now - lastBack < 2000) {
                finish();
            } else {
                lastBack = now;
                Toast.makeText(this, "Appuyez encore sur Retour pour quitter MyPoly", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ------------------------------------------------------------------ plein écran
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    // ------------------------------------------------------------------ écrans natifs
    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private GradientDrawable rounded(int color, float radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private View logo(int size) {
        View v = new View(this);
        v.setBackground(getDrawable(R.drawable.splash_logo));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(size), dp(size));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        v.setLayoutParams(lp);
        return v;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        b.setTextColor(Color.WHITE);
        b.setTypeface(b.getTypeface(), android.graphics.Typeface.BOLD);
        GradientDrawable g = primary
            ? new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{Color.parseColor("#FF5A5F"), Color.parseColor("#FF8A3D")})
            : new GradientDrawable();
        if (!primary) g.setColor(Color.parseColor("#22FFFFFF"));
        g.setCornerRadius(dp(16));
        b.setBackground(g);
        b.setPadding(dp(24), dp(12), dp(24), dp(12));
        b.setStateListAnimator(null);
        return b;
    }

    private LinearLayout column() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);
        col.setPadding(dp(28), dp(28), dp(28), dp(28));
        return col;
    }

    private void addGap(LinearLayout col, int h) {
        View v = new View(this);
        col.addView(v, new LinearLayout.LayoutParams(1, dp(h)));
    }

    private View buildLoader() {
        LinearLayout col = column();
        col.setBackgroundColor(BG);
        col.addView(logo(96));
        addGap(col, 18);
        col.addView(text("MyPoly", 26, Color.WHITE, true));
        addGap(col, 18);
        ProgressBar p = new ProgressBar(this);
        col.addView(p, new LinearLayout.LayoutParams(dp(36), dp(36)));
        col.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return col;
    }

    /** Pas de connexion : message, nouvelle tentative (et automatique au retour du réseau). */
    private void showOffline() {
        if (offline != null || web == null) return;
        LinearLayout col = column();
        col.setBackgroundColor(BG);
        col.addView(logo(80));
        addGap(col, 20);
        col.addView(text("Connexion impossible", 22, Color.WHITE, true));
        addGap(col, 8);
        col.addView(text("Vérifiez votre connexion Internet.\nMyPoly réessaie automatiquement.", 15, Color.parseColor("#AAB0D6"), false));
        addGap(col, 24);
        Button retry = button("Réessayer", true);
        retry.setOnClickListener(v -> web.reload());
        col.addView(retry);
        addGap(col, 10);
        Button change = button("Changer l'adresse du serveur", false);
        change.setOnClickListener(v -> showSetup(siteUrl));
        col.addView(change);
        col.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        offline = col;
        root.addView(offline);
        if (loader != null) loader.setVisibility(View.GONE);
        retryWhenOnline();
    }

    private void retryWhenOnline() {
        handler.postDelayed(() -> {
            if (offline == null || web == null) return;
            if (isOnline()) web.reload();
            else retryWhenOnline();
        }, 4000);
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    /** Premier lancement (ou changement) : adresse du site MyPoly. */
    private void showSetup(String current) {
        if (web != null) {
            web.destroy();
            web = null;
        }
        offline = null;
        root.removeAllViews();
        LinearLayout col = column();
        col.addView(logo(96));
        addGap(col, 18);
        col.addView(text("Bienvenue sur MyPoly", 24, Color.WHITE, true));
        addGap(col, 8);
        col.addView(text("Entrez l'adresse du site MyPoly\n(par exemple jeu.exemple.fr)", 15, Color.parseColor("#AAB0D6"), false));
        addGap(col, 22);
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setHint("jeu.exemple.fr");
        input.setHintTextColor(Color.parseColor("#6D7399"));
        input.setTextColor(Color.WHITE);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        input.setBackground(rounded(Color.parseColor("#1D2148"), 14));
        input.setPadding(dp(16), dp(14), dp(16), dp(14));
        if (current != null) input.setText(current.replaceFirst("^https://", ""));
        col.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        addGap(col, 16);
        Button go = button("Jouer", true);
        Runnable submit = () -> {
            String v = input.getText().toString().trim();
            if (v.isEmpty()) {
                input.setError("Adresse requise");
                return;
            }
            if (!v.startsWith("http://") && !v.startsWith("https://")) v = "https://" + v;
            while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
            siteUrl = v;
            prefs().edit().putString(KEY_URL, v).apply();
            startSite(null);
            hideSystemBars();
        };
        go.setOnClickListener(x -> submit.run());
        input.setOnEditorActionListener((x, id, e) -> {
            submit.run();
            return true;
        });
        col.addView(go, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }
}
