package rw.smartgarage.stock.data

import android.content.Context

/**
 * Where this phone remembers what it is.
 *
 * Survives force-stop and reboot, which matters more than it sounds: a
 * receptionist who has to re-pair the phone every morning will stop using it
 * by Wednesday. Pairing happens once and is never asked for again unless
 * someone explicitly unpairs.
 */
class DeviceStore(context: Context) {

    private val prefs = context.getSharedPreferences("device", Context.MODE_PRIVATE)

    fun load(): DeviceSession? {
        val garageId = prefs.getString(KEY_GARAGE, null) ?: return null
        val name = prefs.getString(KEY_NAME, null) ?: return null
        return DeviceSession(
            garageId = garageId,
            role = DeviceRole.from(prefs.getString(KEY_ROLE, null)),
            staffName = name,
        )
    }

    fun save(session: DeviceSession) {
        prefs.edit()
            .putString(KEY_GARAGE, session.garageId)
            .putString(KEY_ROLE, session.role.wire)
            .putString(KEY_NAME, session.staffName)
            .apply()
    }

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_GARAGE = "garageId"
        const val KEY_ROLE = "role"
        const val KEY_NAME = "staffName"
    }
}
