/* AURA i18n — English base + device language (system locale).
   Usage:
     AuraI18n.t('key', {n: 5})        -> localized string
     AuraI18n.apply(root)             -> fills [data-i18n], [data-i18n-html], [data-i18n-attrs]
     AuraI18n.setLocale('de')         -> switch + persist + re-apply
   Locale resolution: saved choice (localStorage) -> device language -> English.
   Unknown device language falls back to English. */
(function (global) {
  'use strict';

  var CATALOGS = {};
  var RTL = { ar: 1, he: 1, fa: 1, ur: 1, ps: 1, sd: 1, ug: 1, yi: 1, ku: 1 };
  var LS_KEY = 'aura-locale';

  function baseOf(tag) {
    return String(tag || '').toLowerCase().split(/[-_]/)[0];
  }

  function deviceLocale() {
    var tags = [];
    if (typeof navigator !== 'undefined') {
      if (navigator.languages && navigator.languages.length) tags = tags.concat(navigator.languages);
      if (navigator.language) tags.push(navigator.language);
      if (navigator.userLanguage) tags.push(navigator.userLanguage);
    }
    if (typeof process !== 'undefined' && process.env && process.env.LANG) {
      tags.push(process.env.LANG.replace(/[.@].*$/, ''));
    }
    for (var i = 0; i < tags.length; i++) {
      var b = baseOf(tags[i]);
      if (b && b !== 'en') return b; // English is the built-in base language
    }
    return 'en';
  }

  function resolveLocale(explicit) {
    if (explicit) return baseOf(explicit);
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
    if (saved) return baseOf(saved);
    return deviceLocale();
  }

  function makeLang(explicit) {
    var loc = resolveLocale(explicit);
    var base = baseOf(loc);
    var dict = CATALOGS[base] || CATALOGS.en || {};
    return {
      locale: loc, base: base, isEn: !CATALOGS[base], rtl: !!RTL[base],
      t: function (key, vars) {
        var s = dict[key];
        if (s == null) s = CATALOGS.en ? CATALOGS.en[key] : null;
        if (s == null) return key;
        if (vars) {
          s = s.replace(/\{(\w+)\}/g, function (m, k) {
            return vars[k] != null ? vars[k] : m;
          });
        }
        return s;
      }
    };
  }

  var current = makeLang(null);
  var registered = [];

  function refresh() { current = makeLang(null); return current; }

  /* data-i18n-vars="n=5,a=x" или просто "15" (тогда n=15) */
  function parseVars(node) {
    var raw = node.getAttribute('data-i18n-vars');
    if (!raw) return null;
    var out = {};
    var parts = String(raw).split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var eq = p.indexOf('=');
      if (eq === -1) out.n = p;
      else { var k = p.slice(0, eq).trim(); if (k) out[k] = p.slice(eq + 1).trim(); }
    }
    return out;
  }

  function applyI18n(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = current.t(nodes[i].getAttribute('data-i18n'), parseVars(nodes[i]));
    }
    var html = scope.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < html.length; j++) {
      html[j].innerHTML = current.t(html[j].getAttribute('data-i18n-html'), parseVars(html[j]));
    }
    var attrs = scope.querySelectorAll('[data-i18n-attrs]');
    for (var k = 0; k < attrs.length; k++) {
      var spec = attrs[k].getAttribute('data-i18n-attrs').split(',');
      for (var m = 0; m < spec.length; m++) {
        var pair = spec[m].split('=');
        if (pair.length !== 2) continue;
        attrs[k].setAttribute(pair[0], current.t(pair[1]));
      }
    }
    if (!root) {
      document.documentElement.lang = current.locale;
      document.documentElement.dir = current.rtl ? 'rtl' : 'ltr';
      var tk = document.body && document.body.getAttribute('data-title-key');
      if (tk) document.title = current.t(tk);
    }
  }

  function register(locale, dict) {
    var base = baseOf(locale);
    CATALOGS[base] = dict;
    if (registered.indexOf(base) === -1) registered.push(base);
    return base;
  }

  function available() { return registered.slice(); }

  global.AuraI18n = {
    t: function (key, vars) { return current.t(key, vars); },
    apply: applyI18n,
    register: register,
    refresh: refresh,
    get lang() { return current; },
    setLocale: function (loc) {
      current = makeLang(loc);
      try { localStorage.setItem(LS_KEY, current.locale); } catch (e) {}
      applyI18n(document);
      document.dispatchEvent(new CustomEvent('aura:locale', { detail: { locale: current.locale } }));
      return current.locale;
    },
    available: available
  };
})(window);
