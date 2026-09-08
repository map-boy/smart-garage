package rw.smartgarage.reception.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

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
    fun checkIn(garageId: String, profile: Profile, arrival: Arrival) {
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

    fun arrivals(garageId: String): Flow<List<Arrival>> = callbackFlow {
        val reg = db.collection("garages").document(garageId)
            .collection("arrivals")
            .orderBy("arrivedAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                trySend(snap.documents.map { d ->
                    Arrival(
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
                })
            }
        awaitClose { reg.remove() }
    }
}