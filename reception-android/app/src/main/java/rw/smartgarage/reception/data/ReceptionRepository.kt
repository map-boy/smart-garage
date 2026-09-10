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

class ReceptionRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    fun signOut() = auth.signOut()

    fun currentUid(): String? = auth.currentUser?.uid

    suspend fun loadProfile(uid: String): Profile? {
        val snap = db.collection("users").document(uid).get().await()
        if (!snap.exists()) return null
        return Profile(
            uid = uid,
            role = snap.getString("role").orEmpty(),
            garageId = snap.getString("garageId").orEmpty(),
            displayName = snap.getString("displayName"),
        )
    }

    /**
     * Records an arrival.
     *
     * Deliberately does NOT await the write task. Firestore only completes that
     * task once the server acknowledges, so awaiting it would hang the screen
     * for the entire time the phone has no signal - the exact moment the
     * receptionist most needs an instant confirmation. The local write has
     * already been applied by the time this returns, and the SDK delivers it
     * when the connection comes back.
     */
    fun checkIn(garageId: String, profile: Profile, arrival: Arrival, isNewClient: Boolean = false) {
        val data = hashMapOf<String, Any?>(
            "plate" to arrival.plate.uppercase().trim(),
            "plateKey" to normalisePlate(arrival.plate),
            "make" to arrival.make?.takeIf { it.isNotBlank() },
            "colour" to arrival.colour?.takeIf { it.isNotBlank() },
            "driverName" to arrival.driverName?.takeIf { it.isNotBlank() },
            "driverPhone" to arrival.driverPhone?.takeIf { it.isNotBlank() },
            "reason" to arrival.reason,
            "notes" to arrival.notes?.takeIf { it.isNotBlank() },
            "vehicleId" to arrival.vehicleId,
            "clientId" to arrival.clientId,
            "isNewClient" to isNewClient,
            "status" to ArrivalStatus.WAITING.wire,
            "arrivedAt" to FieldValue.serverTimestamp(),
            "loggedBy" to profile.uid,
            "loggedByName" to (profile.displayName ?: "Reception"),
        )
        db.collection("garages").document(garageId)
            .collection("arrivals").add(data)
    }

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
     * Pre-allocated doc refs give both IDs synchronously (works offline).
     */
    fun createClientAndVehicle(garageId: String, arrival: Arrival): Pair<String, String> {
        val garageRef = db.collection("garages").document(garageId)
        val vehicleRef = garageRef.collection("vehicles").document()
        val clientRef = garageRef.collection("clients").document()
        val nowIso = isoNow()

        val clientData = hashMapOf<String, Any?>(
            "name" to (arrival.driverName?.takeIf { it.isNotBlank() } ?: "Walk-in customer"),
            "phone" to (arrival.driverPhone ?: ""),
            "email" to "",
            "vehicleIds" to listOf(vehicleRef.id),
            "createdAt" to nowIso,
        )
        val vehicleData = hashMapOf<String, Any?>(
            "plate" to arrival.plate.uppercase().trim(),
            "make" to (arrival.make ?: ""),
            "model" to "",
            "year" to "",
            "color" to (arrival.colour ?: ""),
            "clientId" to clientRef.id,
            "mileage" to "",
            "fuelType" to "Petrol",
        )
        clientRef.set(clientData)
        vehicleRef.set(vehicleData)
        return clientRef.id to vehicleRef.id
    }

    private fun isoNow(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }

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

    /** Every arrival between [dayStart] (inclusive) and [dayEnd] (exclusive). Not live - fetched once per call. */
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
        reason = d.getString("reason").orEmpty(),
        notes = d.getString("notes"),
        status = ArrivalStatus.from(d.getString("status")),
        arrivedAt = d.getTimestamp("arrivedAt"),
        loggedByName = d.getString("loggedByName"),
        pending = d.metadata.hasPendingWrites(),
    )
}