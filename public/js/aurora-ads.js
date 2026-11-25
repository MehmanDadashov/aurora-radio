/* ================================================================
   AURORA Ads — единый хелпер монетизации для Web / Electron / Capacitor.
   - Баннер AdSense (ca-pub-…) для веб- и десктоп-сборок
   - Нативные баннер / интерстишл / rewarded через Capacitor-плагин AuroraAds
   - События зеркалятся в Firebase Analytics и в локальный счётчик
   ================================================================ */
(function (global) {
  'use strict';

  var ADSENSE_CLIENT = 'ca-pub-1872308537877958';
  var ADSENSE_SLOT = '6393666225';
  var ADMOB_APP_ID = 'ca-app-pub-1872308537877958~9995349018';
  var COUNTER_KEY = 'ar_ads_counter';

  function counter() {
    try { return JSON.parse(localStorage.getItem(COUNTER_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function bump(kind) {
    var c = counter();
    c[kind] = (c[kind] || 0) + 1;
    try { localStorage.setItem(COUNTER_KEY, JSON.stringify(c)); } catch (e) {}
    return c[kind];
  }
  function logEvent(name, params) {
    try {
      if (global.firebase && global.firebase.analytics && global.firebase.analytics().logEvent) {
        global.firebase.analytics().logEvent(name, params || {});
      }
    } catch (e) {}
    try {
      if (global.gtag) global.gtag('event', name, params || {});
    } catch (e) {}
  }

  var state = { platform: 'web', bannerOn: false, interstitialMs: 5 * 60 * 1000, lastInterstitial: 0 };

  function capacitor() {
    return global.Capacitor && global.Capacitor.Plugins ? global.Capacitor.Plugins : null;
  }

  function isNative() {
    var p = capacitor();
    return !!(p && p.AuroraAds);
  }

  function isAdFree() {
    try {
      var raw = localStorage.getItem('ar_premium');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.p && p.until > Date.now()) return true;
      }
      // старый формат приложения: { p, until }
      var old = localStorage.getItem('premium');
      if (old) {
        var q = JSON.parse(old);
        if (q && q.until > Date.now()) return true;
      }
    } catch (e) {}
    return false;
  }

  function pushSense(container) {
    if (typeof global.adsbygoogle === 'undefined') return false;
    try {
      var el = document.createElement('ins');
      el.className = 'adsbygoogle';
      el.style.display = 'block';
      el.style.maxHeight = '90px';
      el.style.overflow = 'hidden';
      el.setAttribute('data-ad-client', ADSENSE_CLIENT);
      el.setAttribute('data-ad-slot', ADSENSE_SLOT);
      el.setAttribute('data-ad-format', 'horizontal');
      el.setAttribute('data-full-width-responsive', 'false');
      container.innerHTML = '';
      container.appendChild(el);
      (global.adsbygoogle = global.adsbygoogle || []).push({});
      return true;
    } catch (e) { return false; }
  }

  var Ad = {
    client: ADSENSE_CLIENT,
    slot: ADSENSE_SLOT,

    init: function () {
      state.platform = isNative() ? 'android' : (global.process && global.process.versions && global.process.versions.electron ? 'desktop' : 'web');
      logEvent('ad_sdk_init', { platform: state.platform });
    },

    /* Баннер: нативный в приложении, AdSense в браузере/десктопе */
    showBanner: function (containerId) {
      if (isAdFree()) return false;
      if (isNative()) {
        var p = capacitor();
        p.AuroraAds.showBanner().then(function () { state.bannerOn = true; }).catch(function () {});
        return true;
      }
      var box = containerId ? document.getElementById(containerId) : document.getElementById('adBanner');
      if (!box) return false;
      box.style.display = 'flex';
      if (pushSense(box)) {
        state.bannerOn = true;
        logEvent('ad_impression', { ad_type: 'banner', platform: state.platform });
        bump('banner');
        return true;
      }
      return false;
    },

    hideBanner: function () {
      if (isNative()) {
        var p = capacitor();
        if (p && p.AuroraAds) p.AuroraAds.hideBanner().catch(function () {});
      }
      state.bannerOn = false;
      var box = document.getElementById('adBanner');
      if (box) box.style.display = 'none';
    },

    /* Интерстишл: не чаще, чем раз в interstitialMs */
    maybeInterstitial: function (force) {
      if (isAdFree()) return false;
      var now = Date.now();
      if (!force && now - state.lastInterstitial < state.interstitialMs) return false;
      state.lastInterstitial = now;
      if (isNative()) {
        var p = capacitor();
        p.AuroraAds.showInterstitial().catch(function () {});
        logEvent('ad_impression', { ad_type: 'interstitial', platform: state.platform });
        bump('interstitial');
        return true;
      }
      logEvent('ad_impression', { ad_type: 'interstitial', platform: state.platform, note: 'adsense-auto' });
      bump('interstitial');
      return false;
    },

    /* Rewarded: нативный AdMob; в вебе — честный отказ (без фальшивой награды) */
    rewarded: function () {
      if (isNative()) {
        var p = capacitor();
        logEvent('ad_impression', { ad_type: 'rewarded', platform: state.platform });
        bump('rewarded');
        return p.AuroraAds.showRewarded().then(function () { return true; }).catch(function () { return false; });
      }
      toast('Реклама доступна в приложении для Android');
      return Promise.resolve(false);
    },

    /* Счётчики для админки/отладки */
    stats: function () { return counter(); }
  };

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  global.AuroraAds = Ad;
  global.AuroraAdsLog = logEvent;
})(window);
