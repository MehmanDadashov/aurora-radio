package se.aistudio.radio;

/**
 * Мост между foreground-сервисом (MediaSession) и WebView (JS-плеером).
 * Сервис шлёт onPlay/onPause, JS вызывает dispatch() чтобы переключить состояние.
 * Состояние играет/пауза дублируется в static, чтобы сервис мог читать его без привязки к Activity.
 */
public final class AuroraMediaBridge {

    private static boolean playing = false;
    private static Runnable jsToggle;

    public static void setPlaying(boolean value) {
        playing = value;
    }

    public static boolean isPlaying() {
        return playing;
    }

    /** Регистрирует JS-коллбэк (переключить плеер) — зовётся из MainActivity при инициализации WebView. */
    public static void setJsToggle(Runnable callback) {
        jsToggle = callback;
    }

    /** Вызывается из сервиса: просим WebView прочитать состояние и применить к плееру. */
    public static void applyStateToWeb() {
        if (jsToggle != null) {
            try {
                jsToggle.run();
            } catch (Throwable ignored) {
                // WebView может быть ещё не готов — состояние применится при следующем onResume
            }
        }
    }

    private AuroraMediaBridge() {}
}
