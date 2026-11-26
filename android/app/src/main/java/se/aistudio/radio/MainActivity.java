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

    /** UMP-согласие (GDPR) → форма при необходимости → инициализация Mobile Ads. */
    static void bootAds(Activity activity) {
        ConsentRequestParameters params = new ConsentRequestParameters.Builder()
                .setTagForUnderAgeOfConsent(false)
                .build();
        ConsentInformation ci = UserMessagingPlatform.getConsentInformation(activity);
        ci.requestConsentInfoUpdate(activity, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> initSdk(activity)),
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
        reportConsent(activity);
    }

    /**
     * Диагностика в UI: статус согласия UMP + разрешение onAdViewed в JS-тост.
     * OBTAINED/NOT_REQUIRED — реклама может показываться; REQUIRED — показать форму;
     * UNKNOWN — нужно нажать «Настройки рекламы» в приложении.
     */
    private static void reportConsent(Activity activity) {
        try {
            ConsentInformation ci = UserMessagingPlatform.getConsentInformation(activity);
            String state = String.valueOf(ci.getConsentStatus());
            boolean canAsk = ci.canRequestAds();
            android.webkit.WebView wv = (activity instanceof MainActivity)
                    ? ((MainActivity) activity).getBridge().getWebView() : null;
            if (wv != null) {
                wv.post(() -> wv.evaluateJavascript(
                        "(function(){try{window.dispatchEvent(new CustomEvent('ad-consent',{detail:{state:'" + state +
                                "',canRequestAds:" + canAsk + "}}));}catch(e){}})()", null));
            }
        } catch (Throwable ignored) { }
    }
}
