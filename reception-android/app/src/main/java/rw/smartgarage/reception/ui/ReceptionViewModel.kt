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

data class UiState(
    val loading: Boolean = true,
    val profile: Profile? = null,
    val arrivals: List<Arrival> = emptyList(),
    val error: String? = null,
    val busy: Boolean = false,
    val lastCheckedIn: String? = null,
)

class ReceptionViewModel(
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
        var uid = repo.currentUid()
        if (uid == null) {
            try {
                repo.signIn(AUTO_EMAIL, AUTO_PASSWORD)
                uid = repo.currentUid()
            } catch (t: Throwable) {
                _state.value = _state.value.copy(loading = false, error = friendly(t))
                return@launch
            }
        }
        if (uid == null) { _state.value = _state.value.copy(loading = false); return@launch }
        val p = runCatching { repo.loadProfile(uid) }.getOrNull()
        if (p == null) {
            _state.value = _state.value.copy(loading = false, error = "No profile set up for this account yet.")
            return@launch
        }
        _state.value = _state.value.copy(loading = false, profile = p)
        watch(p.garageId)
    }

    companion object {
        private const val AUTO_EMAIL = "smartgarage@gmail.com"
        private const val AUTO_PASSWORD = "smartgarage"
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
        repo.checkIn(p.garageId, p, arrival.copy(vehicleId = link?.first, clientId = link?.second))
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

    private fun friendly(t: Throwable): String {
        val m = t.message.orEmpty()
        return when {
            m.contains("network", true) -> "No internet connection. Connect once, then the app works offline."
            m.contains("password", true) || m.contains("credential", true) -> "Sign-in failed. Contact the admin."
            else -> m.ifBlank { "Could not connect." }
        }
    }
}