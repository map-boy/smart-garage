package rw.smartgarage.shared

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

/**
 * Redeeming a pairing code, once, for both phone apps.
 *
 * This used to be copy-pasted into ReceptionRepository and StockRepository.
 * The copies had already drifted: the stock one checked that the code's role
 * matched the app, the reception one did not, so a stock code silently paired
 * a reception phone into the wrong role. Neither invalidated the code, so any
 * code could be redeemed again by a second phone until its ten minutes ran
 * out. Both bugs are fixed here, once.
 *
 * The apps keep their own DeviceRole enums - they are stable, and sharing
 * them would have meant editing every screen that names a role. What is
 * shared is the part that was actually going wrong.
 */
object DevicePairing {

    const val ROLE_RECEPTION = "reception"
    const val ROLE_STOCK = "stock"

    /** What a successful redemption yields, in wire terms the caller maps. */
    data class PairedDevice(
        val garageId: String,
        val roleWire: String,
        val staffName: String,
    )

    /**
     * Signs in anonymously if needed, then redeems [code] for [expectedRole].
     *
     * The device document and the deletion of the code happen in one
     * transaction, so a code cannot be redeemed twice: the second phone finds
     * nothing at `pairing/{code}` and is refused by the rules, which already
     * require that document to exist before a device may register itself.
     *
     * A transaction needs the network. That is correct here - pairing is the
     * one moment a phone genuinely cannot proceed offline, and failing loudly
     * beats registering a device the server never agreed to.
     */
    suspend fun redeem(
        db: FirebaseFirestore,
        auth: FirebaseAuth,
        code: String,
        staffName: String,
        expectedRole: String,
    ): PairedDevice {
        val uid = auth.currentUser?.uid
            ?: auth.signInAnonymously().await().user!!.uid
        val trimmed = code.trim().uppercase()
        val cleanName = staffName.trim()

        val pairingRef = db.collection("pairing").document(trimmed)

        return db.runTransaction { tx ->
            val snap = tx.get(pairingRef)
            if (!snap.exists()) {
                throw IllegalArgumentException(
                    "That code is not recognised. Check it and try again."
                )
            }

            val expiresAt = snap.getLong("expiresAtMs") ?: 0L
            if (expiresAt != 0L && expiresAt <= System.currentTimeMillis()) {
                throw IllegalArgumentException("That code has expired. Ask for a new one.")
            }

            val garageId = snap.getString("garageId").orEmpty()
            if (garageId.isBlank()) {
                throw IllegalArgumentException("That code is not set up correctly.")
            }

            // An unknown role string used to fall back to "reception", which
            // meant a typo in a code handed out a reception phone. Refuse it.
            val roleWire = snap.getString("role")
            if (roleWire != ROLE_RECEPTION && roleWire != ROLE_STOCK) {
                throw IllegalArgumentException("That code is not set up correctly.")
            }
            if (roleWire != expectedRole) {
                throw IllegalArgumentException(wrongAppMessage(roleWire))
            }

            val deviceRef = db.collection("garages").document(garageId)
                .collection("devices").document(uid)

            tx.set(
                deviceRef,
                hashMapOf(
                    "role" to roleWire,
                    "staffName" to cleanName,
                    "garageId" to garageId,
                    "pairingCode" to trimmed,
                    "pairedAt" to FieldValue.serverTimestamp(),
                    "lastSeenAt" to FieldValue.serverTimestamp(),
                )
            )
            // Burn the code in the same commit. The create rule above keys off
            // this document existing, so deleting it is what makes the code
            // one-shot - no extra rule has to police redemption counts.
            tx.delete(pairingRef)

            PairedDevice(garageId = garageId, roleWire = roleWire, staffName = cleanName)
        }.await()
    }

    private fun wrongAppMessage(roleWire: String): String = when (roleWire) {
        ROLE_STOCK -> "That code is for the stock app. Ask for a reception code."
        else -> "That code is for the reception app. Ask for a stock code."
    }
}
