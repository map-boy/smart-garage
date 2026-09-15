package rw.smartgarage.stock.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.Date
import rw.smartgarage.shared.DevicePairing

/**
 * Everything this app does to the shelf.
 *
 * The same two rules hold here as on every other surface: quantities move only
 * by increment, and never without a movement line to explain them. The stock
 * manager may also maintain the catalogue itself - names, costs, suppliers -
 * which the reception phone deliberately cannot.
 */
class StockRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {

    suspend fun ensureSignedIn(): String {
        auth.currentUser?.let { return it.uid }
        return auth.signInAnonymously().await().user!!.uid
    }

    fun currentUid(): String? = auth.currentUser?.uid

    /** Redeems the code the boss reads out. See the reception app for why. */
    suspend fun pair(code: String, staffName: String): Result<DeviceSession> = runCatching {
        val paired = DevicePairing.redeem(
            db = db,
            auth = auth,
            code = code,
            staffName = staffName,
            expectedRole = DevicePairing.ROLE_STOCK,
        )
        DeviceSession(
            garageId = paired.garageId,
            role = DeviceRole.STOCK,
            staffName = paired.staffName,
        )
    }

    // ------------------------------------------------------------- shelf ----

    fun stock(garageId: String): Flow<List<Part>> = callbackFlow {
        val reg = db.collection("garages").document(garageId)
            .collection("stock")
            .orderBy("name")
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                trySend(snap.documents.map { docToPart(it) })
            }
        awaitClose { reg.remove() }
    }

    /**
     * Moves a quantity and records why, in one batch.
     *
     * Not awaited on purpose: Firestore resolves a write only once the server
     * has it, and a stock manager counting a shelf in a back room with no
     * signal should not be watching a spinner. The local cache has both writes
     * already; the server gets them when there is a network.
     */
    fun applyDelta(
        session: DeviceSession,
        part: Part,
        delta: Int,
        reason: MovementReason,
        note: String? = null,
    ) {
        if (delta == 0) return
        val garage = db.collection("garages").document(session.garageId)
        val nowIso = isoNow()
        val batch = db.batch()

        batch.update(
            garage.collection("stock").document(part.id),
            mapOf("quantity" to FieldValue.increment(delta.toLong()), "updatedAt" to nowIso),
        )
        batch.set(
            garage.collection("stockMovements").document(),
            hashMapOf(
                "partId" to part.id,
                "partName" to part.name,
                "partNumber" to part.partNumber,
                "delta" to delta,
                "balanceAfter" to part.quantity + delta,
                "reason" to reason.wire,
                "plate" to null,
                "vehicleId" to null,
                "arrivalId" to null,
                "jobId" to null,
                "note" to note,
                "byName" to session.staffName,
                "byRole" to session.role.wire,
                "at" to FieldValue.serverTimestamp(),
                "atLocal" to nowIso,
            )
        )
        batch.commit()
    }

    /**
     * Sets the shelf to what was physically counted.
     *
     * Written as the difference rather than the absolute figure, so a count
     * taken with no signal still merges with whatever moved meanwhile instead
     * of stamping over it on reconnect.
     */
    fun setCount(session: DeviceSession, part: Part, counted: Int) {
        applyDelta(session, part, counted - part.quantity, MovementReason.COUNT_ADJUSTMENT,
            note = "Counted $counted on the shelf")
    }

    /** Catalogue details. Never touches the quantity. */
    fun savePartDetails(garageId: String, part: Part) {
        db.collection("garages").document(garageId)
            .collection("stock").document(part.id)
            .set(
                hashMapOf(
                    "name" to part.name.trim(),
                    "partNumber" to part.partNumber.trim(),
                    "reorderLevel" to part.reorderLevel,
                    "unitCost" to part.unitCost,
                    "supplier" to part.supplier.trim(),
                    "updatedAt" to isoNow(),
                ),
                com.google.firebase.firestore.SetOptions.merge(),
            )
    }

    /** A part that did not exist before, with its opening count as a movement. */
    fun createPart(session: DeviceSession, part: Part): String {
        val garage = db.collection("garages").document(session.garageId)
        val ref = garage.collection("stock").document()
        val nowIso = isoNow()
        val batch = db.batch()

        batch.set(
            ref,
            hashMapOf(
                "name" to part.name.trim(),
                "partNumber" to part.partNumber.trim(),
                "quantity" to part.quantity,
                "reorderLevel" to part.reorderLevel,
                "unitCost" to part.unitCost,
                "supplier" to part.supplier.trim(),
                "updatedAt" to nowIso,
            )
        )
        if (part.quantity != 0) {
            batch.set(
                garage.collection("stockMovements").document(),
                hashMapOf(
                    "partId" to ref.id,
                    "partName" to part.name.trim(),
                    "partNumber" to part.partNumber.trim(),
                    "delta" to part.quantity,
                    "balanceAfter" to part.quantity,
                    "reason" to MovementReason.RECEIVED.wire,
                    "plate" to null, "vehicleId" to null, "arrivalId" to null, "jobId" to null,
                    "note" to "Opening stock",
                    "byName" to session.staffName,
                    "byRole" to session.role.wire,
                    "at" to FieldValue.serverTimestamp(),
                    "atLocal" to nowIso,
                )
            )
        }
        batch.commit()
        return ref.id
    }

    // ------------------------------------------------------------ ledger ----

    /**
     * The recent trail, newest first.
     *
     * Capped: this screen answers "what happened lately", and a manager who
     * needs the full history has the desktop app. An uncapped listener on a
     * collection that only ever grows is how a phone app gets slower every
     * month until someone uninstalls it.
     */
    fun movements(garageId: String, limit: Long = 100): Flow<List<Movement>> = callbackFlow {
        val reg = db.collection("garages").document(garageId)
            .collection("stockMovements")
            .orderBy("atLocal", Query.Direction.DESCENDING)
            .limit(limit)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                trySend(snap.documents.map { d ->
                    Movement(
                        id = d.id,
                        partName = d.getString("partName").orEmpty(),
                        delta = (d.getLong("delta") ?: 0L).toInt(),
                        balanceAfter = (d.getLong("balanceAfter") ?: 0L).toInt(),
                        reason = MovementReason.from(d.getString("reason")),
                        plate = d.getString("plate"),
                        note = d.getString("note"),
                        byName = d.getString("byName").orEmpty(),
                        atLocal = d.getString("atLocal").orEmpty(),
                        pending = d.metadata.hasPendingWrites(),
                    )
                })
            }
        awaitClose { reg.remove() }
    }

    private fun docToPart(d: DocumentSnapshot) = Part(
        id = d.id,
        name = d.getString("name").orEmpty(),
        partNumber = d.getString("partNumber").orEmpty(),
        quantity = (d.getLong("quantity") ?: 0L).toInt(),
        reorderLevel = (d.getLong("reorderLevel") ?: 0L).toInt(),
        unitCost = d.getDouble("unitCost") ?: 0.0,
        supplier = d.getString("supplier").orEmpty(),
        pending = d.metadata.hasPendingWrites(),
    )

    private fun isoNow(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }
}
