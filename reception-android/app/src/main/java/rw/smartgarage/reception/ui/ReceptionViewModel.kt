package rw.smartgarage.reception.ui

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import rw.smartgarage.reception.data.Arrival
import rw.smartgarage.reception.data.Profile
import rw.smartgarage.reception.data.ReceptionRepository
import rw.smartgarage.reception.data.normalisePlate
import java.util.Calendar
import java.util.Date

data class UiState(
    val loading: Boolean = true,
    val profile: Profile? = null,
    val arrivals: List<Arrival> = emptyList(),
    val error: String? = null,
    val busy: Boolean = false,
    val lastCheckedIn: String? = null,
    val selectedArrival: Arrival? = null,
    val archiveDayStart: Long = startOfDay(System.currentTimeMillis()),
    val archiveArrivals: List<Arrival> = emptyList(),
    val archiveLoading: Boolean = false,
)

class ReceptionViewModel @JvmOverloads constructor(
    application: Application,
    private val repo: ReceptionRepository = ReceptionRepository(),
) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { restore() }

    fun retry() {
        _state.value = _state.value.copy(loading = true, error = null)
        restore()
    }

    private fun restore() = viewModelScope.launch {
        // No login for reception staff: this app always writes to one fixed garage.
        _state.value = _state.value.copy(loading = false, profile = RECEPTION_PROFILE)
        watch(GARAGE_ID)
        loadArchiveDay(_state.value.archiveDayStart)
    }

    companion object {
        private const val GARAGE_ID = "garage-aimable-001"
        private val RECEPTION_PROFILE = Profile(
            uid = "reception",
            role = "reception",
            garageId = GARAGE_ID,
            displayName = "Reception",
        )
        private const val CHANNEL_ID = "garage_checkins"
    }

    private fun watch(garageId: String) = viewModelScope.launch {
        repo.arrivals(garageId).collect { list ->
            _state.value = _state.value.copy(arrivals = list)
        }
    }

    fun checkIn(arrival: Arrival) = viewModelScope.launch {
        val p = _state.value.profile ?: return@launch
        if (normalisePlate(arrival.plate).length < 3) {
            _state.value = _state.value.copy(error = "Enter the number plate.")
            return@launch
        }
        _state.value = _state.value.copy(busy = true, error = null)
        val link = repo.findVehicle(p.garageId, arrival.plate)
        val (vehicleId, clientId, isNewClient) = if (link != null) {
            Triple(link.first, link.second, false)
        } else {
            val (newClientId, newVehicleId) = repo.createClientAndVehicle(p.garageId, arrival)
            Triple(newVehicleId, newClientId, true)
        }
        repo.checkIn(p.garageId, p, arrival.copy(vehicleId = vehicleId, clientId = clientId), isNewClient)
        val plate = arrival.plate.uppercase().trim()
        _state.value = _state.value.copy(busy = false, lastCheckedIn = plate)
        notifyCheckIn(plate, arrival.driverName)
    }

    private fun notifyCheckIn(plate: String, driverName: String?) {
        val ctx = getApplication<Application>()
        val mgr = ctx.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && mgr.getNotificationChannel(CHANNEL_ID) == null) {
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Check-ins", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        val title = if (driverName.isNullOrBlank()) "Vehicle checked in" else "$driverName checked in"
        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_myplaces)
            .setContentTitle(title)
            .setContentText(plate)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(plate.hashCode(), notif) }
    }

    fun clearConfirmation() { _state.value = _state.value.copy(lastCheckedIn = null) }
    fun clearError() { _state.value = _state.value.copy(error = null) }

    fun selectArrival(arrival: Arrival?) { _state.value = _state.value.copy(selectedArrival = arrival) }

    /** Loads every arrival for the calendar day that [dayStart] falls in. */
    fun loadArchiveDay(dayStart: Long) {
        val p = _state.value.profile ?: return
        _state.value = _state.value.copy(archiveDayStart = dayStart, archiveLoading = true, archiveArrivals = emptyList())
        viewModelScope.launch {
            val list = runCatching {
                repo.arrivalsForDay(p.garageId, Date(dayStart), Date(endOfDay(dayStart)))
            }.getOrElse { emptyList() }
            _state.value = _state.value.copy(archiveArrivals = list, archiveLoading = false)
        }
    }

    fun shiftArchiveDay(deltaDays: Int) {
        val cal = Calendar.getInstance().apply {
            timeInMillis = _state.value.archiveDayStart
            add(Calendar.DAY_OF_MONTH, deltaDays)
        }
        val newStart = startOfDay(cal.timeInMillis)
        if (newStart > startOfDay(System.currentTimeMillis())) return // no browsing into the future
        loadArchiveDay(newStart)
    }
}

private fun startOfDay(millis: Long): Long = Calendar.getInstance().apply {
    timeInMillis = millis
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.timeInMillis

private fun endOfDay(dayStart: Long): Long = Calendar.getInstance().apply {
    timeInMillis = dayStart
    add(Calendar.DAY_OF_MONTH, 1)
}.timeInMillis