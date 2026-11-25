package se.aistudio.radio;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.Collections;

/**
 * Aurora Radio — MainActivity.
 * Boots the Capacitor bridge; the AdMob SDK is initialised by AuroraAdsPlugin
 * after the UMP consent flow (see {@link AuroraAdsPlugin#init}).
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "AuroraRadio";
    private FirebaseAnalytics firebaseAnalytics;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Локальные нативные плагины Capacitor
        registerPlugin(ForegroundRadioPlugin.class);
        super.onCreate(savedInstanceState);
        firebaseAnalytics = FirebaseAnalytics.getInstance(this);

        // Мост foreground-сервиса → JS-плеер: кнопки play/pause на экране блокировки
        android.webkit.WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) {
            AuroraMediaBridge.setJsToggle(() -> {
                android.webkit.WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) return;
                web.post(() -> web.evaluateJavascript(
                        "(function(){try{(window.__auroraFgToggle||function(){})();}catch(e){}})()", null));
            });
        }
    }

    /** Run the consent update, then initialise the Mobile Ads SDK. */
    static void bootAds(Activity activity) {
        ConsentRequestParameters params = new ConsentRequestParameters.Builder()
                .setTagForUnderAgeOfConsent(false)
                .build();
        ConsentInformation ci = UserMessagingPlatform.getConsentInformation(activity);
        ci.requestConsentInfoUpdate(activity, params,
                () -> initSdk(activity),
                err -> {
                    Log.w(TAG, "consent update failed: " + err.getMessage());
                    initSdk(activity);
                });
    }

    private static void initSdk(Activity activity) {
        MobileAds.initialize(activity, status ->
                Log.i(TAG, "MobileAds initialized: " + status));
        // Тестовые устройства НЕ помечаем: на телефоне пользователя AdMob должен
        // отдавать реальные баннеры, иначе вместо рекламы виден «Test Ad».
    }
}
