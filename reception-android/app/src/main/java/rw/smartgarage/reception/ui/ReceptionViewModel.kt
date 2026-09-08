package rw.smartgarage.reception.ui

import androidx.lifecycle.ViewModel
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
    private val repo: ReceptionRepository = ReceptionRepository(),
) : ViewModel() {

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { restore() }

    private fun restore() = viewModelScope.launch {
        val uid = repo.currentUid()
        if (uid == null) { _state.value = _state.value.copy(loading = false); return@launch }
        val p = runCatching { repo.loadProfile(uid) }.getOrNull()
        _state.value = _state.value.copy(loading = false, profile = p)
        p?.let { watch(it.garageId) }
    }

    private fun watch(garageId: String) = viewModelScope.launch {
        repo.arrivals(garageId).collect { list ->
            _state.value = _state.value.copy(arrivals = list)
        }
    }

    fun signIn(email: String, password: String) = viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null)
        try {
            repo.signIn(email, password)
            val uid = repo.currentUid() ?: error("No session")
            val p = repo.loadProfile(uid) ?: error("No profile for this account. Ask the admin to set your role and garage.")
            _state.value = _state.value.copy(busy = false, profile = p)
            watch(p.garageId)
        } catch (t: Throwable) {
            _state.value = _state.value.copy(busy = false, error = friendly(t))
        }
    }

    fun signOut() {
        repo.signOut()
        _state.value = UiState(loading = false)
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
        _state.value = _state.value.copy(
            busy = false,
            lastCheckedIn = arrival.plate.uppercase().trim(),
        )
    }

    fun clearConfirmation() { _state.value = _state.value.copy(lastCheckedIn = null) }
    fun clearError() { _state.value = _state.value.copy(error = null) }

    private fun friendly(t: Throwable): String {
        val m = t.message.orEmpty()
        return when {
            m.contains("network", true) -> "No internet. Sign in once with a connection; after that the app works offline."
            m.contains("password", true) || m.contains("credential", true) -> "Wrong email or password."
            else -> m.ifBlank { "Could not sign in." }
        }
    }
}