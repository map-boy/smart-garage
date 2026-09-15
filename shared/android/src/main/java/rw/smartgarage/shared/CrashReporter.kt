package rw.smartgarage.shared

import android.content.Context
import android.content.SharedPreferences
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Crash reporting for the phone apps, without a crash-reporting service.
 *
 * Both apps write uncaught exceptions to the same global `diagnostics`
 * collection the desktop app uses, so the technician console shows failures
 * from every install in one list. There is no third-party SDK here on purpose:
 * the Sentry free tier this project used ran out, and a phone in a garage yard
 * is exactly where a paid quota runs out quietly.
 *
 * Writing during a crash works because Firestore's disk cache accepts the write
 * locally and uploads it on the next launch. The report survives the process
 * dying, which is the only moment it is ever needed.
 */
object CrashReporter {

    private const val PREFS = "garage.diagnostics"
    private const val KEY_DEVICE_ID = "deviceId"

    /** A crash loop must not write thousands of identical documents. */
    private const val MIN_GAP_MS = 30_000L
    private const val KEY_LAST_AT = "lastReportAtMs"

    fun install(context: Context, appName: String, versionName: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                report(prefs, appName, versionName, error, thread.name)
            } catch (_: Throwable) {
                // A crash reporter that crashes would replace a useful stack
                // trace with its own. Never let anything escape from here.
            }
            // Always hand back to the platform handler so behaviour on a crash
            // is unchanged - the app still dies and still shows what it showed.
            previous?.uncaughtException(thread, error)
        }
    }

    /** Records a handled error - a caught failure worth knowing about. */
    fun reportHandled(context: Context, appName: String, versionName: String, error: Throwable) {
        try {
            report(
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE),
                appName, versionName, error, "handled"
            )
        } catch (_: Throwable) {
        }
    }

    private fun report(
        prefs: SharedPreferences,
        appName: String,
        versionName: String,
        error: Throwable,
        threadName: String,
    ) {
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(KEY_LAST_AT, 0L) < MIN_GAP_MS) return
        prefs.edit().putLong(KEY_LAST_AT, now).apply()

        FirebaseFirestore.getInstance()
            .collection("diagnostics")
            .add(
                hashMapOf(
                    "app" to appName,
                    "version" to versionName,
                    "deviceId" to deviceId(prefs),
                    "message" to (error.message ?: error::class.java.simpleName),
                    "stack" to stackOf(error),
                    "thread" to threadName,
                    "at" to FieldValue.serverTimestamp(),
                    // The server stamp stays null until this uploads, which
                    // for a crash is by definition some time later.
                    "atLocal" to isoNow(now),
                )
            )
    }

    private fun deviceId(prefs: SharedPreferences): String {
        prefs.getString(KEY_DEVICE_ID, null)?.let { return it }
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        return id
    }

    private fun stackOf(error: Throwable): String {
        val writer = StringWriter()
        error.printStackTrace(PrintWriter(writer))
        return writer.toString().take(8_000)
    }

    private fun isoNow(millis: Long): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date(millis))
    }
}
