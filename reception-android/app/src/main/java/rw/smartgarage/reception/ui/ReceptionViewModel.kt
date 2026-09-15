package rw.smartgarage.reception.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import rw.smartgarage.reception.data.Arrival
import rw.smartgarage.reception.data.DeviceSession
import rw.smartgarage.reception.data.DeviceStore
import rw.smartgarage.reception.data.Part
import rw.smartgarage.reception.data.ReceptionRepository
import java.util.Calendar
import rw.smartgarage.reception.data.StockSnapshot

/** One part picked for the vehicle in front of the receptionist. */
data class PickedPart(val part: Part, val qty: Int)

data class UiState(
    val loading: Boolean = true,
    val session: DeviceSession? = null,
    val pairing: Boolean = false,
    val pairError: String? = null,

    val arrivals: List<Arrival> = emptyList(),
    val stock: List<Part> = emptyList(),
    /** How much the shelf numbers above can be trusted right now. */
    val stockFreshness: StockSnapshot = StockSnapshot(),
    val picked: List<PickedPart> = emptyList(),

    val error: String? = null,
    val busy: Boolean = false,
    val lastCheckedIn: String? = null,
    val selectedArrival: Arrival? = null,

    val archiveDayStart: Long = startOfDay(System.currentTimeMillis()),
    val archiveArrivals: List<Arrival> = emptyList(),
    val archiveLoading: Boolean = false,
) {
    /** What the picked parts will cost the garage, before anything is charged. */
    val pickedCost: Double get() = picked.sumOf { it.part.unitCost * it.qty }
}

class ReceptionViewModel @JvmOverloads constructor(
    application: Application,
    private val repo: ReceptionRepository = ReceptionRepository(),
) : AndroidViewModel(application) {

    private val store = DeviceStore(application)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var arrivalsJob: Job? = null
    private var stockJob: Job? = null

    init { restore() }

    private fun restore() = viewModelScope.launch {
        // An anonymous account is what the rules check once the phone is
        // paired. Getting it now means the pairing screen has an identity to
        // write with the moment a code is typed.
        runCatching { repo.ensureSignedIn() }
        val saved = store.load()
        _state.value = _state.value.copy(loading = false, session = saved)
        saved?.let { watch(it) }
    }

    // ----------------------------------------------------------- pairing ----

    fun pair(code: String, staffName: String) = viewModelScope.launch {
        if (code.isBlank()) {
            _state.value = _state.value.copy(pairError = "Enter the code from the office.")
            return@launch
        }
        if (staffName.isBlank()) {
            _state.value = _state.value.copy(pairError = "Enter your name so jobs can be traced back.")
            return@launch
        }
        _state.value = _state.value.copy(pairing = true, pairError = null)
        repo.pair(code, staffName)
            .onSuccess { session ->
                store.save(session)
                _state.value = _state.value.copy(pairing = false, session = session)
                watch(session)
            }
            .onFailure { e ->
                _state.value = _state.value.copy(
                    pairing = false,
                    pairError = e.message ?: "Could not pair this phone. Check the code.",
                )
            }
    }

    fun unpair() {
        arrivalsJob?.cancel()
        stockJob?.cancel()
        store.clear()
        _state.value = UiState(loading = false)
    }

    // ------------------------------------------------------------ watching --

    private fun watch(session: DeviceSession) {
        arrivalsJob?.cancel()
        arrivalsJob = viewModelScope.launch {
            repo.arrivals(session.garageId).collect { list ->
                _state.value = _state.value.copy(arrivals = list)
            }
        }
        stockJob?.cancel()
        stockJob = viewModelScope.launch {
            repo.stock(session.garageId).collect { snapshot ->
                _state.value = _state.value.copy(
                    stock = snapshot.parts,
                    stockFreshness = snapshot,
                )
            }
        }
        loadArchiveDay(_state.value.archiveDayStart)
    }

    // -------------------------------------------------------- part picker ---

    fun addPart(part: Part, qty: Int = 1) {
        if (qty <= 0) return
        val existing = _state.value.picked.find { it.part.id == part.id }
        val next = if (existing == null) {
            _state.value.picked + PickedPart(part, qty)
        } else {
            _state.value.picked.map {
                if (it.part.id == part.id) it.copy(qty = it.qty + qty) else it
            }
        }
        _state.value = _state.value.copy(picked = next)
    }

    fun setPartQty(partId: String, qty: Int) {
        val next = if (qty <= 0) {
            _state.value.picked.filterNot { it.part.id == partId }
        } else {
            _state.value.picked.map { if (it.part.id == partId) it.copy(qty = qty) else it }
        }
        _state.value = _state.value.copy(picked = next)
    }

    fun removePart(partId: String) = setPartQty(partId, 0)

    fun clearPicked() { _state.value = _state.value.copy(picked = emptyList()) }

    // ---------------------------------------------------------- check in ----

    /**
     * Writes the arrival, then takes the picked parts off the shelf.
     *
     * Nothing here awaits the network. Both writes land in the local cache
     * immediately, so the receptionist sees the confirmation and the reduced
     * stock at once even with no signal, and the server receives them when
     * there is one.
     */
    fun checkIn(arrival: Arrival) = viewModelScope.launch {
        val session = _state.value.session ?: return@launch
        _state.value = _state.value.copy(busy = true, error = null)
        try {
            // A returning car must not produce a second copy of its owner, so
            // the plate is looked up before anything is created. The lookup is
            // the one awaited call here: offline it simply finds nothing and
            // the check-in opens a fresh file, which the desktop can merge.
            val found = if (arrival.vehicleId.isNullOrBlank()) {
                repo.findVehicle(session.garageId, arrival.plate)
            } else {
                arrival.vehicleId to arrival.clientId
            }

            val picked = _state.value.picked
            val result = repo.checkIn(
                session = session,
                arrival = arrival,
                existingVehicleId = found?.first,
                existingClientId = found?.second,
                picked = picked.map { it.part to it.qty },
            )

            // Stock moves separately: quantities only ever change by increment
            // alongside a ledger line, which cannot share a batch with the
            // records above without giving up that guarantee.
            if (picked.isNotEmpty()) {
                repo.issueParts(
                    session = session,
                    arrivalId = result.arrivalId,
                    plate = arrival.plate,
                    vehicleId = result.vehicleId,
                    lines = picked.map { it.part to it.qty },
                )
            }

            _state.value = _state.value.copy(
                busy = false,
                picked = emptyList(),
                lastCheckedIn = arrival.plate.uppercase().trim(),
            )
        } catch (e: Exception) {
            _state.value = _state.value.copy(
                busy = false,
                error = e.message ?: "Could not record that arrival.",
            )
        }
    }

    fun clearConfirmation() { _state.value = _state.value.copy(lastCheckedIn = null) }

    fun selectArrival(a: Arrival?) { _state.value = _state.value.copy(selectedArrival = a) }

    // ----------------------------------------------------------- archive ----

    fun shiftArchiveDay(days: Int) {
        val cal = Calendar.getInstance().apply {
            timeInMillis = _state.value.archiveDayStart
            add(Calendar.DAY_OF_YEAR, days)
        }
        val start = startOfDay(cal.timeInMillis)
        _state.value = _state.value.copy(archiveDayStart = start)
        loadArchiveDay(start)
    }

    private fun loadArchiveDay(dayStart: Long) = viewModelScope.launch {
        val session = _state.value.session ?: return@launch
        _state.value = _state.value.copy(archiveLoading = true)
        val end = Calendar.getInstance().apply {
            timeInMillis = dayStart
            add(Calendar.DAY_OF_YEAR, 1)
        }.timeInMillis
        val rows = runCatching {
            repo.arrivalsForDay(session.garageId, java.util.Date(dayStart), java.util.Date(end))
        }.getOrDefault(emptyList())
        _state.value = _state.value.copy(archiveArrivals = rows, archiveLoading = false)
    }
}

fun startOfDay(millis: Long): Long = Calendar.getInstance().apply {
    timeInMillis = millis
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
}.timeInMillis
