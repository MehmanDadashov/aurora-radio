package se.aistudio.radio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;

/**
 * Фоновый сервис воспроизведения радио:
 *  - foregroundServiceType=mediaPlayback + PARTIAL_WAKE_LOCK (не прерывается при выключенном экране);
 *  - MediaSessionCompat: медиа-уведомление с кнопками play/pause/stop;
 *  - плеер на экране блокировки с перемоткой/паузой (MediaStyle notification).
 */
public class RadioPlaybackService extends Service {

    private static final String CHANNEL_ID = "aurora_playback";
    private static final int NOTIF_ID = 4201;

    private PowerManager.WakeLock wakeLock;
    private android.net.wifi.WifiManager.WifiLock wifiLock;
    private MediaSessionCompat session;
    private String currentTitle = "Aurora Radio";
    private String currentBody = "Идёт воспроизведение";
    private boolean playing = true;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aurora_radio:playback");
                    wakeLock.setReferenceCounted(false);
                    wakeLock.acquire();
                }
                // WiFi НЕ должен засыпать при выключенном экране — иначе поток обрывается.
                android.net.wifi.WifiManager wm =
                        (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wm != null) {
                    wifiLock = wm.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                            "aurora_radio:stream");
                    wifiLock.setReferenceCounted(false);
                    wifiLock.acquire();
                }
        initSession();
    }

    private void initSession() {
        session = new MediaSessionCompat(this, "AuroraRadioSession");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                playing = true;
                AuroraMediaBridge.setPlaying(true);
                updateState();
                refreshNotification();
            }

            @Override
            public void onPause() {
                playing = false;
                AuroraMediaBridge.setPlaying(false);
                updateState();
                refreshNotification();
            }

            @Override
            public void onStop() {
                playing = false;
                AuroraMediaBridge.setPlaying(false);
                stopSelf();
            }
        });
        session.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if ("PAUSE_ACTION".equals(action)) {
            playing = false;
            AuroraMediaBridge.setPlaying(false);
            AuroraMediaBridge.applyStateToWeb();
            updateState();
            refreshNotification();
            return START_STICKY;
        }
        if ("PLAY_ACTION".equals(action)) {
            playing = true;
            AuroraMediaBridge.setPlaying(true);
            AuroraMediaBridge.applyStateToWeb();
            updateState();
            refreshNotification();
            return START_STICKY;
        }
        if ("STOP_ACTION".equals(action)) {
            playing = false;
            AuroraMediaBridge.setPlaying(false);
            AuroraMediaBridge.applyStateToWeb();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            String t = intent.getStringExtra("title");
            String b = intent.getStringExtra("body");
            if (t != null && !t.isEmpty()) currentTitle = t;
            if (b != null && !b.isEmpty()) currentBody = b;
            if (intent.hasExtra("playing")) playing = intent.getBooleanExtra("playing", true);
        }
        if (playing) {
            session.setMetadata(new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentBody)
                    .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, -1)
                    .build());
        }
        updateState();
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, n);
        }
        return START_STICKY;
    }

    private void updateState() {
        if (session == null) return;
        PlaybackStateCompat.Builder b = new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY
                        | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE
                        | PlaybackStateCompat.ACTION_STOP
                        | PlaybackStateCompat.ACTION_SEEK_TO);
        b.setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                0, 1.0f);
        session.setPlaybackState(b.build());
    }

    private void refreshNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification());
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "Воспроизведение", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        int flags = Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent contentPi = PendingIntent.getActivity(this, 0, open, flags);

        NotificationCompat.Builder nb = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentBody)
                .setSmallIcon(R.drawable.icon_radio)
                .setContentIntent(contentPi)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(new NotificationCompat.Action(
                        R.drawable.icon_radio,
                        "Закрыть",
                        PendingIntent.getService(this, 2,
                                new Intent(this, RadioPlaybackService.class)
                                        .setAction("STOP_ACTION"), flags)))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1));

        if (playing) {
            nb.addAction(new NotificationCompat.Action(
                    R.drawable.icon_radio, "Пауза",
                    PendingIntent.getService(this, 3,
                            new Intent(this, RadioPlaybackService.class)
                                    .setAction("PAUSE_ACTION"), flags)));
        } else {
            nb.addAction(new NotificationCompat.Action(
                    R.drawable.icon_radio, "Играть",
                    PendingIntent.getService(this, 4,
                            new Intent(this, RadioPlaybackService.class)
                                    .setAction("PLAY_ACTION"), flags)));
        }
        return nb.build();
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
        AuroraMediaBridge.setPlaying(false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
