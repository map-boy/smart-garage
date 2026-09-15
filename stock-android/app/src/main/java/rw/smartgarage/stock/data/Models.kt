package rw.smartgarage.stock.data

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
    /**
     * What this sits under on the shelf: "Car wash", "Brakes", "Oils".
     *
     * Blank means it stands on its own. A washing bay buys soap, wax, cloths
     * and brushes, and a flat list of every one of those buries the fifteen
     * parts anyone actually looks for - so they hang off one heading instead.
     */
    val group: String = "",
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

/** Why a quantity moved. The ledger is unreadable without it. */
enum class MovementReason(val wire: String, val label: String) {
    ISSUED_TO_VEHICLE("issued_to_vehicle", "Issued to vehicle"),
    RECEIVED("received", "Received into store"),
    COUNT_ADJUSTMENT("count_adjustment", "Stock count"),
    RETURNED("returned", "Returned to store"),
    WRITTEN_OFF("written_off", "Written off");

    companion object {
        fun from(wire: String?): MovementReason =
            entries.firstOrNull { it.wire == wire } ?: COUNT_ADJUSTMENT
    }
}

/** One line of the stock ledger, as this phone reads it back. */
data class Movement(
    val id: String = "",
    val partName: String = "",
    val delta: Int = 0,
    val balanceAfter: Int = 0,
    val reason: MovementReason = MovementReason.COUNT_ADJUSTMENT,
    val plate: String? = null,
    val note: String? = null,
    val byName: String = "",
    val atLocal: String = "",
    val pending: Boolean = false,
)

/**
 * A heading on the shelf and everything under it.
 *
 * Built from the parts themselves rather than stored separately: a group is
 * only ever a name several parts share, so there is no second collection to
 * keep in step and no way to end up with a heading that has nothing under it.
 */
data class PartGroup(
    val name: String,
    val parts: List<Part>,
) {
    val totalQuantity: Int get() = parts.sumOf { it.quantity }
    val lowCount: Int get() = parts.count { it.isLow }
    val oversoldCount: Int get() = parts.count { it.isOversold }
    val pending: Boolean get() = parts.any { it.pending }
}

/** Groups first, alphabetically, with loose parts under their own heading. */
const val UNGROUPED = "Ungrouped"

fun List<Part>.byGroup(): List<PartGroup> =
    groupBy { it.group.trim().ifBlank { UNGROUPED } }
        .map { (name, parts) -> PartGroup(name, parts.sortedBy { it.name.lowercase() }) }
        // The loose pile sorts last however it is named, so a heading someone
        // actually chose is never pushed below it.
        .sortedWith(compareBy({ it.name == UNGROUPED }, { it.name.lowercase() }))
