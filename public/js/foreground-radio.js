/* ================================================================
   ForegroundRadio — фоновое воспроизведение для Capacitor (Android).
   Нативный плагин ForegroundRadio держит foreground-сервис с
   mediaPlayback + wake lock, пока играет аудио.
   В вебе и на десктопе — no-op.
   ================================================================ */
(function (global) {
  'use strict';

  function plugin() {
    var C = global.Capacitor;
    return (C && C.Plugins && C.Plugins.ForegroundRadio) ? C.Plugins.ForegroundRadio : null;
  }

  function start(title, body) {
    var p = plugin();
    if (!p || !p.start) return false;
    try {
      var ret = p.start({ title: title || 'Aurora Radio', body: body || 'Идёт воспроизведение' });
      if (ret && ret.then) ret.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  function stop() {
    var p = plugin();
    if (!p || !p.stop) return false;
    try {
      var ret = p.stop();
      if (ret && ret.then) ret.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  function requestPermission() {
    var p = plugin();
    if (!p || !p.requestNotificationPermission) return false;
    try {
      var ret = p.requestNotificationPermission();
      if (ret && ret.then) ret.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  global.ForegroundRadio = { start: start, stop: stop, requestPermission: requestPermission };
})(window);
