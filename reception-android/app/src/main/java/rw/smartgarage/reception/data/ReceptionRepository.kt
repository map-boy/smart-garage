package rw.smartgarage.reception.data

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

class ReceptionRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {

    /**
     * No password on this app by choice, so the phone still needs an identity
     * the rules can check. An anonymous account is stable for the life of the
     * install, which is exactly the lifetime of a pairing.
     */
    suspend fun ensureSignedIn(): String {
        auth.currentUser?.let { return it.uid }
        return auth.signInAnonymously().await().user!!.uid
    }

    fun currentUid(): String? = auth.currentUser?.uid

    /**
     * Redeems a pairing code read out by the boss.
     *
     * The code is the only secret involved. Reading it tells the phone which
     * garage and role it grants; writing the device document is what the rules
     * actually check from then on. Codes cannot be listed, so a phone that was
     * never given one cannot register itself.
     */
    suspend fun pair(code: String, staffName: String): Result<DeviceSession> = runCatching {
        val paired = DevicePairing.redeem(
            db = db,
            auth = auth,
            code = code,
            staffName = staffName,
            expectedRole = DevicePairing.ROLE_RECEPTION,
        )
        DeviceSession(
            garageId = paired.garageId,
            role = DeviceRole.RECEPTION,
            staffName = paired.staffName,
        )
    }

    /**
     * Records an arrival.
     *
     * Deliberately does NOT await the write. Firestore completes that task only
     * once the server acknowledges, so awaiting it would freeze the screen for
     * as long as the phone has no signal - the exact moment the receptionist
     * most needs an instant confirmation. The local write has already been
     * applied by the time this returns, and the SDK delivers it when the
     * connection comes back.
     */
    fun checkIn(
        session: DeviceSession,
        arrival: Arrival,
        isNewClient: Boolean = false,
    ): String {
        val ref = db.collection("garages").document(session.garageId)
            .collection("arrivals").document()
        ref.set(
            hashMapOf(
                "plate" to arrival.plate.uppercase().trim(),
                "plateKey" to normalisePlate(arrival.plate),
                "make" to arrival.make?.takeIf { it.isNotBlank() },
                "colour" to arrival.colour?.takeIf { it.isNotBlank() },
                "driverName" to arrival.driverName?.takeIf { it.isNotBlank() },
                "driverPhone" to arrival.driverPhone?.takeIf { it.isNotBlank() },
                "requestedWork" to arrival.requestedWork.trim(),
                "notes" to arrival.notes?.takeIf { it.isNotBlank() },
                "partsUsed" to emptyList<Map<String, Any?>>(),
                "vehicleId" to arrival.vehicleId,
                "clientId" to arrival.clientId,
                "isNewClient" to isNewClient,
                "status" to ArrivalStatus.WAITING.wire,
                "arrivedAt" to FieldValue.serverTimestamp(),
                "loggedBy" to (currentUid() ?: ""),
                "loggedByName" to session.staffName,
            )
        )
        return ref.id
    }

    // ------------------------------------------------------------- stock ----

    /**
     * The shelf, live.
     *
     * Served from the local cache first, so the picker opens instantly and
     * still works with no signal. Ordered by name because that is how someone
     * hunting for a part actually scans a list.
     */
    fun stock(garageId: String): Flow<StockSnapshot> = callbackFlow {
        // Remembered across snapshots: once the server has confirmed the shelf,
        // later cache-only snapshots must not erase the fact that it did, or
        // the freshness warning would flap on every local edit.
        var confirmedAtMs: Long? = null
        val reg = db.collection("garages").document(garageId)
            .collection("stock")
            .orderBy("name")
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                if (!snap.metadata.isFromCache) confirmedAtMs = System.currentTimeMillis()
                trySend(
                    StockSnapshot(
                        parts = snap.documents.map { d ->
                            Part(
                                id = d.id,
                                name = d.getString("name").orEmpty(),
                                partNumber = d.getString("partNumber").orEmpty(),
                                quantity = (d.getLong("quantity") ?: 0L).toInt(),
                                reorderLevel = (d.getLong("reorderLevel") ?: 0L).toInt(),
                                unitCost = d.getDouble("unitCost") ?: 0.0,
                                supplier = d.getString("supplier").orEmpty(),
                                pending = d.metadata.hasPendingWrites(),
                            )
                        },
                        fromCache = snap.metadata.isFromCache,
                        confirmedAtMs = confirmedAtMs,
                    )
                )
            }
        awaitClose { reg.remove() }
    }

    /**
     * Takes parts out of the store for a vehicle.
     *
     * Quantities move by increment, never by writing a computed total. That is
     * what lets two phones draw from the same shelf at once, and what lets this
     * phone do it with no signal at all: the SDK queues "minus two", not "set
     * to seven", so an hour offline does not undo whatever happened meanwhile.
     *
     * The shelf may go below zero. That means more was taken than the books
     * knew about, which is a recount - and a recount is a far better outcome
     * than refusing a receptionist standing in front of a waiting customer.
     */
    fun issueParts(
        session: DeviceSession,
        arrivalId: String,
        plate: String,
        vehicleId: String?,
        lines: List<Pair<Part, Int>>,
    ) {
        if (lines.isEmpty()) return
        val garage = db.collection("garages").document(session.garageId)
        val batch = db.batch()
        val nowIso = isoNow()

        lines.forEach { (part, qty) ->
            if (qty <= 0) return@forEach
            batch.update(
                garage.collection("stock").document(part.id),
                mapOf("quantity" to FieldValue.increment(-qty.toLong()), "updatedAt" to nowIso),
            )
            batch.set(
                garage.collection("stockMovements").document(),
                hashMapOf(
                    "partId" to part.id,
                    // Copied, not referenced: renaming a part next year must
                    // not rewrite what this line says happened today.
                    "partName" to part.name,
                    "partNumber" to part.partNumber,
                    "delta" to -qty,
                    "balanceAfter" to part.quantity - qty,
                    "reason" to "issued_to_vehicle",
                    "plate" to plate.uppercase().trim(),
                    "vehicleId" to vehicleId,
                    "arrivalId" to arrivalId,
                    "jobId" to null,
                    "note" to null,
                    "byName" to session.staffName,
                    "byRole" to session.role.wire,
                    "at" to FieldValue.serverTimestamp(),
                    "atLocal" to nowIso,
                )
            )
        }

        batch.update(
            garage.collection("arrivals").document(arrivalId),
            mapOf(
                "partsUsed" to lines.filter { it.second > 0 }.map { (part, qty) ->
                    mapOf(
                        "partId" to part.id,
                        "partName" to part.name,
                        "qty" to qty,
                        "unitCost" to part.unitCost,
                    )
                }
            ),
        )

        // Not awaited, for the same reason check-in is not: the local cache has
        // the change already and the server gets it when there is a network.
        batch.commit()
    }

    // ---------------------------------------------------------- vehicles ----

    /** Best-effort link to a vehicle already on file. Never blocks a check-in. */
    suspend fun findVehicle(garageId: String, plate: String): Pair<String, String?>? = runCatching {
        val q = db.collection("garages").document(garageId)
            .collection("vehicles")
            .whereEqualTo("plate", plate.uppercase().trim())
            .limit(1).get().await()
        q.documents.firstOrNull()?.let { it.id to it.getString("clientId") }
    }.getOrNull()

    /**
     * No vehicle on file means a walk-in reception has never seen before.
     * Pre-allocated doc refs give both IDs synchronously, so this works offline.
     */
    fun createClientAndVehicle(garageId: String, arrival: Arrival): Pair<String, String> {
        val garageRef = db.collection("garages").document(garageId)
        val vehicleRef = garageRef.collection("vehicles").document()
        val clientRef = garageRef.collection("clients").document()
        val nowIso = isoNow()

        clientRef.set(
            hashMapOf(
                "name" to (arrival.driverName?.takeIf { it.isNotBlank() } ?: "Walk-in customer"),
                "phone" to (arrival.driverPhone ?: ""),
                "email" to "",
                "vehicleIds" to listOf(vehicleRef.id),
                "createdAt" to nowIso,
            )
        )
        vehicleRef.set(
            hashMapOf(
                "plate" to arrival.plate.uppercase().trim(),
                "make" to (arrival.make ?: ""),
                "model" to "",
                "year" to "",
                "color" to (arrival.colour ?: ""),
                "clientId" to clientRef.id,
                "mileage" to "",
                "fuelType" to "Petrol",
            )
        )
        return clientRef.id to vehicleRef.id
    }

    // ---------------------------------------------------------- arrivals ----

    fun arrivals(garageId: String): Flow<List<Arrival>> = callbackFlow {
        val reg = db.collection("garages").document(garageId)
            .collection("arrivals")
            .orderBy("arrivedAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                trySend(snap.documents.map { docToArrival(it) })
            }
        awaitClose { reg.remove() }
    }

    /** Every arrival in a day. Fetched once per call, not live. */
    suspend fun arrivalsForDay(garageId: String, dayStart: Date, dayEnd: Date): List<Arrival> {
        val q = db.collection("garages").document(garageId)
            .collection("arrivals")
            .whereGreaterThanOrEqualTo("arrivedAt", dayStart)
            .whereLessThan("arrivedAt", dayEnd)
            .orderBy("arrivedAt", Query.Direction.DESCENDING)
            .get()
            .await()
        return q.documents.map { docToArrival(it) }
    }

    private fun docToArrival(d: DocumentSnapshot): Arrival = Arrival(
        id = d.id,
        plate = d.getString("plate").orEmpty(),
        make = d.getString("make"),
        colour = d.getString("colour"),
        driverName = d.getString("driverName"),
        driverPhone = d.getString("driverPhone"),
        // Older documents used `reason`; read both so history keeps rendering.
        requestedWork = d.getString("requestedWork") ?: d.getString("reason").orEmpty(),
        notes = d.getString("notes"),
        partsUsed = (d.get("partsUsed") as? List<*>).orEmpty().mapNotNull { row ->
            (row as? Map<*, *>)?.let {
                ArrivalPart(
                    partId = it["partId"] as? String ?: "",
                    partName = it["partName"] as? String ?: "",
                    qty = (it["qty"] as? Number)?.toInt() ?: 0,
                    unitCost = (it["unitCost"] as? Number)?.toDouble() ?: 0.0,
                )
            }
        },
        status = ArrivalStatus.from(d.getString("status")),
        arrivedAt = d.getTimestamp("arrivedAt"),
        loggedByName = d.getString("loggedByName"),
        pending = d.metadata.hasPendingWrites(),
    )

    private fun isoNow(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }
}
