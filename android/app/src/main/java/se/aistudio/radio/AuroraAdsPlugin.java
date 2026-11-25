package se.aistudio.radio;

import android.app.Activity;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/**
 * AuroraAds — Capacitor plugin exposing AdMob to the WebView.
 *
 * JS API (window.AuroraAds):
 *   init()               -> consent + SDK init
 *   showBanner()         -> bottom banner
 *   hideBanner()
 *   showInterstitial()   -> full-screen between station changes
 *   showRewarded()       -> rewarded ad; JS grants premium on 'onRewarded' event
 */
@CapacitorPlugin(name = "AuroraAds")
public class AuroraAdsPlugin extends Plugin {

    private static final String TAG = "AuroraAds";

    // Ad units live in res/values/strings.xml (one unit per format).
    // Defaults are Google test units; production units are set in strings.xml.
    private static final String TEST_BANNER      = "ca-app-pub-3940256099942544/6300978111";
    private static final String TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
    private static final String TEST_REWARDED     = "ca-app-pub-3940256099942544/5224354917";

    private String bannerUnit() { return unit(R.string.ad_unit_banner, TEST_BANNER); }
    private String interstitialUnit() { return unit(R.string.ad_unit_interstitial, TEST_INTERSTITIAL); }
    private String rewardedUnit() { return unit(R.string.ad_unit_rewarded, TEST_REWARDED); }

    private String unit(int resId, String fallback) {
        try {
            String v = getContext().getString(resId);
            return (v != null && !v.trim().isEmpty()) ? v.trim() : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    private AdView bannerView;
    private InterstitialAd interstitialAd;
    private RewardedAd rewardedAd;
    private boolean rewardedPending = false;

    // ------------------------------------------------------------------ init
    @PluginMethod
    public void init(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("no activity"); return; }
        a.runOnUiThread(() -> MainActivity.bootAds(a));
        call.resolve(new JSObject().put("ok", true));
    }

    // ---------------------------------------------------------------- banner
    @PluginMethod
    public void showBanner(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("no activity"); return; }
        a.runOnUiThread(() -> {
            if (bannerView != null) { bannerView.setVisibility(View.VISIBLE); bannerView.resume(); call.resolve(ok()); return; }
            bannerView = new AdView(a);
            bannerView.setAdUnitId(bannerUnit());
            bannerView.setAdSize(AdSize.BANNER);

            View web = getBridge().getWebView();
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent == null) { call.reject("no parent"); return; }
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.gravity = Gravity.BOTTOM;
            bannerView.setLayoutParams(lp);
            parent.addView(bannerView);
            // Диагностика: ошибки/успехи загрузки уходят в JS как события
            bannerView.setAdListener(new com.google.android.gms.ads.AdListener() {
                @Override
                public void onAdFailedToLoad(LoadAdError error) {
                    Log.w("AuroraAds", "banner failed: " + error.getCode() + " " + error.getMessage());
                    emit("ad-banner-error", error.getCode(), String.valueOf(error.getMessage()));
                }
                @Override
                public void onAdLoaded() {
                    Log.i("AuroraAds", "banner loaded");
                    emit("ad-banner-loaded", 0, "");
                }
            });
            bannerView.loadAd(new AdRequest.Builder().build());
            call.resolve(ok());
        });
    }

    /** Событие в WebView: window.dispatchEvent(new CustomEvent(name, {detail:{code,message}})) */
    private void emit(String name, int code, String message) {
        try {
            android.webkit.WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv == null) return;
            String safe = message == null ? "" : message.replace("'", "").replace("\n", " ");
            String js = "(function(){try{window.dispatchEvent(new CustomEvent('" + name +
                    "',{detail:{code:" + code + ",message:'" + safe + "'}}));}catch(e){}})()";
            wv.post(() -> wv.evaluateJavascript(js, null));
        } catch (Throwable ignored) { }
    }

    /** Повторный показ формы настроек рекламы (UMP) — если клиент закрыл согласие. */
    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("no activity"); return; }
        a.runOnUiThread(() -> {
            com.google.android.ump.UserMessagingPlatform.showPrivacyOptionsForm(a, formError -> {
                Log.w("AuroraAds", "privacy options: " + (formError != null ? formError.getMessage() : "dismissed"));
            });
        });
        call.resolve(ok());
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("no activity"); return; }
        a.runOnUiThread(() -> {
            if (bannerView != null) { bannerView.setVisibility(View.GONE); bannerView.pause(); }
            call.resolve(ok());
        });
    }

    @PluginMethod
    public void resumeBanner(PluginCall call) {
        if (bannerView != null) bannerView.resume();
        call.resolve(ok());
    }

    @PluginMethod
    public void pauseBanner(PluginCall call) {
        if (bannerView != null) bannerView.pause();
        call.resolve(ok());
    }

    @PluginMethod
    public void destroyBanner(PluginCall call) {
        if (bannerView != null) { bannerView.destroy(); bannerView = null; }
        call.resolve(ok());
    }

    // ---------------------------------------------------------- interstitial
    @PluginMethod
    public void showInterstitial(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("no activity"); return; }
        a.runOnUiThread(() -> {
            if (interstitialAd != null) {
                interstitialAd.show(a);
                interstitialAd = null;
                call.resolve(ok());
                return;
            }
            InterstitialAd.load(a, interstitialUnit(), new AdRequest.Builder().build(),
                    new InterstitialAdLoadCallback() {
                        @Override public void onAdLoaded(InterstitialAd ad) {
                            interstitialAd = ad;
                            ad.show(a);
                            interstitialAd = null;
                            call.resolve(ok());
                        }
                        @Override public void onAdFailedToLoad(LoadAdError e) {
                            Log.w(TAG, "interstitial failed: " + e.getMessage());
                            call.reject("load failed", e.getMessage());
                        }
                    });
        });
    }

    // -------------------------------------------------------------- rewarded
    @PluginMethod
    public void showRewarded(PluginCall call) {
        Activity a = getActivity();
        if (a == null) { call.reject("no activity"); return; }
        a.runOnUiThread(() -> {
            rewardedPending = true;
            RewardedAd.load(a, rewardedUnit(), new AdRequest.Builder().build(),
                    new RewardedAdLoadCallback() {
                        @Override public void onAdLoaded(RewardedAd ad) {
                            rewardedAd = ad;
                            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                                @Override public void onAdDismissedFullScreenContent() {
                                    rewardedAd = null;
                                    rewardedPending = false;
                                }
                                @Override public void onAdFailedToShowFullScreenContent(AdError e) {
                                    rewardedAd = null;
                                    rewardedPending = false;
                                    notifyJs("onRewardedFailed", e.getMessage());
                                }
                            });
                            ad.show(a, rewardItem -> {
                                Log.i(TAG, "reward: " + rewardItem.getType() + " x" + rewardItem.getAmount());
                                notifyJs("onRewarded", null);
                            });
                            call.resolve(ok());
                        }
                        @Override public void onAdFailedToLoad(LoadAdError e) {
                            Log.w(TAG, "rewarded failed: " + e.getMessage());
                            rewardedPending = false;
                            call.reject("load failed", e.getMessage());
                        }
                    });
        });
    }

    @PluginMethod
    public void isRewardedPending(PluginCall call) {
        call.resolve(new JSObject().put("pending", rewardedPending));
    }

    // ---------------------------------------------------------------- helpers
    private JSObject ok() { return new JSObject().put("ok", true); }

    private void notifyJs(String event, String msg) {
        JSObject d = new JSObject();
        if (msg != null) d.put("message", msg);
        try {
            getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + d + "}))", null));
        } catch (Exception e) {
            Log.w(TAG, "notifyJs", e);
        }
    }
}
