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
     * Opens the whole customer file for a vehicle at the gate, in one write.
     *
     * A walk-in becomes four records: the arrival, the client, the vehicle and
     * the job card for the work asked for. They are written as a single batch
     * on purpose - a check-in that lands half-recorded leaves a job card
     * pointing at a vehicle that does not exist, and no one at the gate is in
     * a position to notice or repair that.
     *
     * Not awaited, like every other write in this app: the batch is in the
     * local cache the moment it is committed, so the receptionist sees the
     * confirmation with no signal and the server catches up later.
     *
     * [existingVehicleId] and [existingClientId] come from a plate lookup. When
     * they are set, the client and vehicle are left alone - a returning car
     * must not produce a second copy of its owner.
     */
    fun checkIn(
        session: DeviceSession,
        arrival: Arrival,
        existingVehicleId: String? = null,
        existingClientId: String? = null,
        picked: List<Pair<Part, Int>> = emptyList(),
    ): CheckInResult {
        val garageRef = db.collection("garages").document(session.garageId)
        val batch = db.batch()
        val nowIso = isoNow()

        val plate = arrival.plate.uppercase().trim()
        val isNewClient = existingVehicleId.isNullOrBlank()

        // Pre-allocated refs hand back ids synchronously, which is what lets
        // the four records reference each other without a round trip.
        val clientRef = if (existingClientId.isNullOrBlank()) {
            garageRef.collection("clients").document()
        } else {
            garageRef.collection("clients").document(existingClientId)
        }
        val vehicleRef = if (existingVehicleId.isNullOrBlank()) {
            garageRef.collection("vehicles").document()
        } else {
            garageRef.collection("vehicles").document(existingVehicleId)
        }
        val arrivalRef = garageRef.collection("arrivals").document()
        val jobRef = garageRef.collection("jobs").document()

        if (isNewClient) {
            batch.set(
                clientRef,
                hashMapOf(
                    "name" to (arrival.driverName?.takeIf { it.isNotBlank() } ?: "Walk-in customer"),
                    "phone" to (arrival.driverPhone.orEmpty()),
                    "email" to (arrival.driverEmail.orEmpty()),
                    "vehicleIds" to listOf(vehicleRef.id),
                    "createdAt" to nowIso,
                )
            )
            batch.set(
                vehicleRef,
                hashMapOf(
                    "plate" to plate,
                    // Plates are written by hand at a gate and with spaces on
                    // the desktop. The normalised copy is what a later lookup
                    // matches on, so "RAB 123 C" and "RAB123C" stay one car.
                    "plateKey" to normalisePlate(arrival.plate),
                    "make" to (arrival.make.orEmpty()),
                    "model" to (arrival.model.orEmpty()),
                    "year" to numberOrBlank(arrival.year),
                    "color" to (arrival.colour.orEmpty()),
                    "clientId" to clientRef.id,
                    "mileage" to numberOrBlank(arrival.mileage),
                    "fuelType" to arrival.fuelType.ifBlank { "Petrol" },
                )
            )
        }

        batch.set(
            arrivalRef,
            hashMapOf(
                "plate" to plate,
                "plateKey" to normalisePlate(arrival.plate),
                "make" to arrival.make?.takeIf { it.isNotBlank() },
                "model" to arrival.model?.takeIf { it.isNotBlank() },
                "colour" to arrival.colour?.takeIf { it.isNotBlank() },
                "driverName" to arrival.driverName?.takeIf { it.isNotBlank() },
                "driverPhone" to arrival.driverPhone?.takeIf { it.isNotBlank() },
                "driverEmail" to arrival.driverEmail?.takeIf { it.isNotBlank() },
                "requestedWork" to arrival.requestedWork.trim(),
                "notes" to arrival.notes?.takeIf { it.isNotBlank() },
                "partsUsed" to picked.map {
                    hashMapOf(
                        "partId" to it.first.id,
                        "partName" to it.first.name,
                        "qty" to it.second,
                        "unitCost" to it.first.unitCost,
                    )
                },
                "vehicleId" to vehicleRef.id,
                "clientId" to clientRef.id,
                "jobId" to jobRef.id,
                "isNewClient" to isNewClient,
                "status" to ArrivalStatus.WAITING.wire,
                "arrivedAt" to FieldValue.serverTimestamp(),
                // The server stamp is null until this reaches the server, and
                // the desktop sorts the feed the moment it arrives.
                "arrivedAtLocal" to nowIso,
                "loggedBy" to (currentUid() ?: ""),
                "loggedByName" to session.staffName,
            )
        )

        // The job card the workshop actually works from. Field names match the
        // desktop's JobCard exactly - `quantity`, not the `qty` the arrival
        // uses - because the desktop reads these documents directly.
        batch.set(
            jobRef,
            hashMapOf(
                "vehicleId" to vehicleRef.id,
                "clientId" to clientRef.id,
                "arrivalId" to arrivalRef.id,
                "plate" to plate,
                "technicianName" to (arrival.technicianName?.takeIf { it.isNotBlank() } ?: "Unassigned"),
                "description" to arrival.requestedWork.trim()
                    .ifBlank { "Checked in at the gate - work not yet described" },
                "status" to "Pending",
                "partsUsed" to picked.map {
                    hashMapOf("partId" to it.first.id, "quantity" to it.second)
                },
                "laborCost" to 0,
                "startedAt" to nowIso,
                "createdAtLocal" to nowIso,
                "openedBy" to session.staffName,
            )
        )

        batch.commit()
        return CheckInResult(
            arrivalId = arrivalRef.id,
            clientId = clientRef.id,
            vehicleId = vehicleRef.id,
            jobId = jobRef.id,
        )
    }

    /** Firestore keeps these as numbers where possible, blank where not. */
    private fun numberOrBlank(raw: String?): Any =
        raw?.trim()?.takeIf { it.isNotBlank() }?.toLongOrNull() ?: ""

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
    /**
     * Finds a vehicle already on file for this plate.
     *
     * Tries the normalised key first and the literal plate second, because
     * vehicles created before plateKey existed - and any created on the
     * desktop - only carry the plate as it was typed.
     */
    suspend fun findVehicle(garageId: String, plate: String): Pair<String, String?>? = runCatching {
        val vehicles = db.collection("garages").document(garageId).collection("vehicles")

        val byKey = vehicles
            .whereEqualTo("plateKey", normalisePlate(plate))
            .limit(1).get().await()
        byKey.documents.firstOrNull()?.let { return@runCatching it.id to it.getString("clientId") }

        val byPlate = vehicles
            .whereEqualTo("plate", plate.uppercase().trim())
            .limit(1).get().await()
        byPlate.documents.firstOrNull()?.let { it.id to it.getString("clientId") }
    }.getOrNull()

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
        model = d.getString("model"),
        colour = d.getString("colour"),
        driverName = d.getString("driverName"),
        driverPhone = d.getString("driverPhone"),
        driverEmail = d.getString("driverEmail"),
        technicianName = d.getString("technicianName"),
        vehicleId = d.getString("vehicleId"),
        clientId = d.getString("clientId"),
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
