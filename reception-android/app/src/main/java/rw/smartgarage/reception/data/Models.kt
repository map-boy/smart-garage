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

/** A part the receptionist took out of the store for this vehicle. */
data class ArrivalPart(
    val partId: String = "",
    val partName: String = "",
    val qty: Int = 0,
    val unitCost: Double = 0.0,
) {
    val lineCost: Double get() = qty * unitCost
}

data class Arrival(
    val id: String = "",
    val plate: String = "",
    val make: String? = null,
    val colour: String? = null,
    val driverName: String? = null,
    val driverPhone: String? = null,
    /** What the client came in asking for, in their own words. */
    val requestedWork: String = "",
    val notes: String? = null,
    val partsUsed: List<ArrivalPart> = emptyList(),
    val vehicleId: String? = null,
    val clientId: String? = null,
    val status: ArrivalStatus = ArrivalStatus.WAITING,
    val arrivedAt: Timestamp? = null,
    val loggedByName: String? = null,
    /** True while the write is still only in the local cache. */
    val pending: Boolean = false,
) {
    val partsCost: Double get() = partsUsed.sumOf { it.lineCost }
}

/** A part on the shelf, as this phone last saw it. */
data class Part(
    val id: String = "",
    val name: String = "",
    val partNumber: String = "",
    val quantity: Int = 0,
    val reorderLevel: Int = 0,
    val unitCost: Double = 0.0,
    val supplier: String = "",
    /** True while this quantity is still only in the phone's local cache. */
    val pending: Boolean = false,
) {
    /** Below zero means more went out than the books knew about: recount. */
    val isOversold: Boolean get() = quantity < 0
    val isLow: Boolean get() = quantity in 0..reorderLevel
}

enum class DeviceRole(val wire: String, val label: String) {
    RECEPTION("reception", "Reception"),
    STOCK("stock", "Stock manager");

    companion object {
        fun from(wire: String?): DeviceRole =
            entries.firstOrNull { it.wire == wire } ?: RECEPTION
    }
}

/**
 * What this phone is allowed to be.
 *
 * There is no password by choice. The pairing code the boss reads out is the
 * one secret, and it is spent the moment it is redeemed; after that the
 * device's own anonymous account is the credential. The staff name is a label
 * on the audit trail, not a login.
 */
data class DeviceSession(
    val garageId: String,
    val role: DeviceRole,
    val staffName: String,
)

/** Plates are typed by hand under pressure; compare them normalised. */
fun normalisePlate(raw: String): String =
    raw.uppercase().filter { it.isLetterOrDigit() }

/**
 * The shelf as this phone currently understands it, and how much to trust it.
 *
 * Reception issues parts against these numbers. Firestore will happily serve
 * them from the local cache for days with no hint that nothing has been heard
 * from the server since - so the freshness travels with the data rather than
 * being inferred at the screen, where it would be forgotten.
 */
data class StockSnapshot(
    val parts: List<Part> = emptyList(),
    /** True when this came from the local cache rather than the server. */
    val fromCache: Boolean = false,
    /** Wall clock of the last snapshot the server actually confirmed. */
    val confirmedAtMs: Long? = null,
) {
    /** Counts older than this are worth warning about before issuing parts. */
    val isStale: Boolean
        get() = confirmedAtMs == null ||
            System.currentTimeMillis() - confirmedAtMs > 15 * 60 * 1000L
}
