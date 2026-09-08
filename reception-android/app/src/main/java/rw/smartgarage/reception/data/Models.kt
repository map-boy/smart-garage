package rw.smartgarage.reception.data

import com.google.firebase.Timestamp

enum class ArrivalStatus(val wire: String, val label: String) {
    WAITING("waiting", "Waiting"),
    ACKNOWLEDGED("acknowledged", "Seen by admin"),
    IN_SERVICE("in_service", "In service"),
    CLOSED("closed", "Closed");

    companion object {
        fun from(wire: String?): ArrivalStatus =
            entries.firstOrNull { it.wire == wire } ?: WAITING
    }
}

data class Arrival(
    val id: String = "",
    val plate: String = "",
    val make: String? = null,
    val colour: String? = null,
    val driverName: String? = null,
    val driverPhone: String? = null,
    val reason: String = "",
    val notes: String? = null,
    val vehicleId: String? = null,
    val clientId: String? = null,
    val status: ArrivalStatus = ArrivalStatus.WAITING,
    val arrivedAt: Timestamp? = null,
    val loggedByName: String? = null,
    /** True while the write is still only in the local cache. */
    val pending: Boolean = false,
)

data class Profile(
    val uid: String,
    val role: String,
    val garageId: String,
    val displayName: String? = null,
)

/** Plates are typed by hand under pressure; compare them normalised. */
fun normalisePlate(raw: String): String =
    raw.uppercase().filter { it.isLetterOrDigit() }