package rw.smartgarage.stock.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import rw.smartgarage.stock.data.DeviceSession
import rw.smartgarage.stock.data.DeviceStore
import rw.smartgarage.stock.data.Movement
import rw.smartgarage.stock.data.MovementReason
import rw.smartgarage.stock.data.Part
import rw.smartgarage.stock.data.PartGroup
import rw.smartgarage.stock.data.UNGROUPED
import rw.smartgarage.stock.data.byGroup
import rw.smartgarage.stock.data.StockRepository

data class StockUiState(
    val loading: Boolean = true,
    val session: DeviceSession? = null,
    val pairing: Boolean = false,
    val pairError: String? = null,

    val stock: List<Part> = emptyList(),
    val movements: List<Movement> = emptyList(),
    val query: String = "",
    val editing: Part? = null,
    val adjusting: Part? = null,
    val deleting: Part? = null,
    /** The heading being looked inside, or null at the top of the shelf. */
    val openGroup: String? = null,
    /** True while the "new heading and its products" sheet is up. */
    val addingGroup: Boolean = false,
) {
    val visible: List<Part>
        get() {
            val matching = if (query.isBlank()) stock else stock.filter {
                it.name.contains(query, true) ||
                    it.partNumber.contains(query, true) ||
                    it.supplier.contains(query, true) ||
                    it.group.contains(query, true)
            }
            // Inside a heading the list is that heading only. A search from in
            // there still searches the whole shelf, because someone hunting a
            // part does not always remember which heading it lives under.
            val group = openGroup
            return if (group != null && query.isBlank()) {
                matching.filter { it.group.trim().ifBlank { UNGROUPED } == group }
            } else {
                matching
            }
        }

    /** The top level of the shelf: headings, not products. */
    val groups: List<PartGroup> get() = visible.byGroup()

    /** True when the list should show products rather than headings. */
    val showingParts: Boolean get() = openGroup != null || query.isNotBlank()

    /** Existing headings, offered as suggestions when filing a new product. */
    val knownGroups: List<String>
        get() = stock.map { it.group.trim() }.filter { it.isNotBlank() }.distinct().sorted()

    val lowCount: Int get() = stock.count { it.isLow }
    val oversoldCount: Int get() = stock.count { it.isOversold }
    /** What the shelf is worth at cost, ignoring anything already oversold. */
    val stockValue: Double get() = stock.filter { it.quantity > 0 }.sumOf { it.quantity * it.unitCost }
}

class StockViewModel @JvmOverloads constructor(
    application: Application,
    private val repo: StockRepository = StockRepository(),
) : AndroidViewModel(application) {

    private val store = DeviceStore(application)
    private val _state = MutableStateFlow(StockUiState())
    val state: StateFlow<StockUiState> = _state.asStateFlow()

    private var stockJob: Job? = null
    private var movementsJob: Job? = null

    init { restore() }

    private fun restore() = viewModelScope.launch {
        runCatching { repo.ensureSignedIn() }
        val saved = store.load()
        _state.value = _state.value.copy(loading = false, session = saved)
        saved?.let { watch(it) }
    }

    fun pair(code: String, staffName: String) = viewModelScope.launch {
        if (code.isBlank()) {
            _state.value = _state.value.copy(pairError = "Enter the code from the office.")
            return@launch
        }
        if (staffName.isBlank()) {
            _state.value = _state.value.copy(pairError = "Enter your name so movements can be traced back.")
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
                    pairError = e.message ?: "Could not pair this phone.",
                )
            }
    }

    private fun watch(session: DeviceSession) {
        stockJob?.cancel()
        stockJob = viewModelScope.launch {
            repo.stock(session.garageId).collect { _state.value = _state.value.copy(stock = it) }
        }
        movementsJob?.cancel()
        movementsJob = viewModelScope.launch {
            repo.movements(session.garageId).collect { _state.value = _state.value.copy(movements = it) }
        }
    }

    fun search(q: String) { _state.value = _state.value.copy(query = q) }

    fun edit(part: Part?) { _state.value = _state.value.copy(editing = part) }
    fun adjust(part: Part?) { _state.value = _state.value.copy(adjusting = part) }
    fun confirmDelete(part: Part?) { _state.value = _state.value.copy(deleting = part) }

    fun openGroup(name: String?) {
        _state.value = _state.value.copy(openGroup = name, query = "")
    }

    fun addGroup(open: Boolean) { _state.value = _state.value.copy(addingGroup = open) }

    /** Saves a heading and everything typed under it in one go. */
    fun createGroup(name: String, parts: List<Part>) {
        val s = _state.value.session ?: return
        repo.createGroup(s, name, parts)
        _state.value = _state.value.copy(addingGroup = false)
    }

    fun deletePart(part: Part) {
        val s = _state.value.session ?: return
        repo.deletePart(s, part)
        _state.value = _state.value.copy(deleting = null, editing = null)
    }

    fun receive(part: Part, qty: Int) {
        val s = _state.value.session ?: return
        if (qty <= 0) return
        repo.applyDelta(s, part, qty, MovementReason.RECEIVED)
    }

    fun writeOff(part: Part, qty: Int, note: String) {
        val s = _state.value.session ?: return
        if (qty <= 0) return
        repo.applyDelta(s, part, -qty, MovementReason.WRITTEN_OFF, note = note.ifBlank { null })
    }

    fun setCount(part: Part, counted: Int) {
        val s = _state.value.session ?: return
        repo.setCount(s, part, counted)
        _state.value = _state.value.copy(adjusting = null)
    }

    fun savePart(part: Part) {
        val s = _state.value.session ?: return
        if (part.id.isBlank()) repo.createPart(s, part) else repo.savePartDetails(s.garageId, part)
        _state.value = _state.value.copy(editing = null)
    }
}
