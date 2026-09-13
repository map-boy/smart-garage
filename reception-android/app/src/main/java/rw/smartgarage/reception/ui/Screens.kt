package rw.smartgarage.reception.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import rw.smartgarage.reception.data.Arrival
import rw.smartgarage.reception.data.Part
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Common asks, as one tap. Anything unusual goes in the free-text box. */
private val COMMON_WORK = listOf(
    "Service", "Repair", "Car wash", "Diagnostics", "Bodywork", "Collection",
)

// --------------------------------------------------------------- pairing ----

/**
 * First run, once.
 *
 * No password by design, so this is the only gate: the boss reads out a code
 * from the desktop app and the phone spends it here. Asking for a name too is
 * not ceremony - every part that leaves the store gets stamped with it, and a
 * ledger that says "someone" is not worth keeping.
 */
@Composable
fun PairingScreen(state: UiState, onPair: (String, String) -> Unit) {
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Set up this phone", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Ink)
        Spacer(Modifier.height(8.dp))
        Text(
            "Ask the office for a pairing code. You only do this once.",
            color = Muted, fontSize = 14.sp,
        )

        Spacer(Modifier.height(28.dp))
        Text("PAIRING CODE", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            code, { code = it.uppercase().trim() },
            placeholder = { Text("ABC-1234") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = MaterialTheme.typography.headlineSmall.copy(
                fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next,
            ),
        )

        Spacer(Modifier.height(18.dp))
        OutlinedTextField(
            name, { name = it }, label = { Text("Your name") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            supportingText = { Text("Shown against every vehicle and part you record.") },
        )

        state.pairError?.let {
            Spacer(Modifier.height(14.dp))
            Text(it, color = Bad, fontSize = 13.sp)
        }

        Spacer(Modifier.height(26.dp))
        Button(
            onClick = { onPair(code, name) },
            enabled = !state.pairing,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(58.dp),
        ) {
            Text(if (state.pairing) "Pairing..." else "Pair this phone", fontWeight = FontWeight.Black)
        }
    }
}

// -------------------------------------------------------------- check in ----

@Composable
fun CheckInScreen(
    state: UiState,
    onCheckIn: (Arrival) -> Unit,
    onAddPart: (Part, Int) -> Unit,
    onSetPartQty: (String, Int) -> Unit,
    onDone: () -> Unit,
) {
    var plate by remember { mutableStateOf("") }
    var make by remember { mutableStateOf("") }
    var colour by remember { mutableStateOf("") }
    var driver by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var work by remember { mutableStateOf("") }
    var pickerOpen by remember { mutableStateOf(false) }

    state.lastCheckedIn?.let { done ->
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(88.dp).background(Ok.copy(alpha = .15f), RoundedCornerShape(44.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Check, null, tint = Ok, modifier = Modifier.size(44.dp))
            }
            Spacer(Modifier.height(20.dp))
            Text(done, fontSize = 24.sp, fontWeight = FontWeight.Black, color = Ink)
            Spacer(Modifier.height(8.dp))
            Text(
                "Saved on this phone. The office sees it as soon as there is signal.",
                color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            OutlinedButton(
                onClick = {
                    plate = ""; make = ""; colour = ""; driver = ""; phone = ""
                    notes = ""; work = ""; onDone()
                },
                shape = RoundedCornerShape(14.dp),
            ) { Text("Log another vehicle") }
        }
        return
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp)) {
        Text("NUMBER PLATE", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            plate, { plate = it.uppercase() },
            placeholder = { Text("RAB 123 C") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = MaterialTheme.typography.headlineSmall.copy(
                fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next,
            ),
        )

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                make, { make = it }, label = { Text("Make / model") },
                singleLine = true, modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                colour, { colour = it }, label = { Text("Colour") },
                singleLine = true, modifier = Modifier.weight(1f),
            )
        }

        Spacer(Modifier.height(16.dp))
        Text("WHAT THE CLIENT WANTS", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        // Chips fill the box rather than replacing it, so a tap is a shortcut
        // and never a limit on what can be written down.
        FlowRowChips(COMMON_WORK) { picked ->
            work = if (work.isBlank()) picked else "$work, $picked"
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            work, { work = it },
            label = { Text("In the client's words") },
            placeholder = { Text("Pulls left when braking, wants it back Friday") },
            modifier = Modifier.fillMaxWidth(), minLines = 2,
        )

        Spacer(Modifier.height(16.dp))
        PartsSection(
            state = state,
            onOpenPicker = { pickerOpen = true },
            onSetQty = onSetPartQty,
        )

        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                driver, { driver = it }, label = { Text("Driver") },
                singleLine = true, modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                phone, { phone = it }, label = { Text("Phone") },
                singleLine = true, modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            )
        }

        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            notes, { notes = it }, label = { Text("Notes") },
            modifier = Modifier.fillMaxWidth(), minLines = 2,
        )

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Bad, fontSize = 13.sp)
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                onCheckIn(
                    Arrival(
                        plate = plate, make = make, colour = colour,
                        driverName = driver, driverPhone = phone,
                        requestedWork = work, notes = notes,
                    )
                )
            },
            enabled = !state.busy && plate.isNotBlank(),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(58.dp),
        ) {
            Icon(Icons.Default.DirectionsCar, null)
            Spacer(Modifier.width(8.dp))
            Text(
                if (state.busy) "Saving..." else "Check vehicle in",
                fontWeight = FontWeight.Black,
            )
        }
        Spacer(Modifier.height(24.dp))
    }

    if (pickerOpen) {
        PartPickerDialog(
            stock = state.stock,
            onPick = { part, qty -> onAddPart(part, qty) },
            onDismiss = { pickerOpen = false },
        )
    }
}

/** What is going out of the store with this vehicle, and what it leaves behind. */
@Composable
private fun PartsSection(
    state: UiState,
    onOpenPicker: () -> Unit,
    onSetQty: (String, Int) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            "PARTS AND TOOLS USED", color = Muted, fontSize = 11.sp,
            fontWeight = FontWeight.Black, modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onOpenPicker) {
            Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text("Add from store")
        }
    }

    if (state.picked.isEmpty()) {
        Text(
            "Nothing taken from the store yet.",
            color = Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp),
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        state.picked.forEach { picked ->
            // The number that matters to whoever is standing at the shelf is
            // what will be left, not what was there before.
            val remaining = picked.part.quantity - picked.qty
            Card(
                colors = CardDefaults.cardColors(containerColor = Navy2),
                shape = RoundedCornerShape(12.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(picked.part.name, color = Ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            if (remaining < 0) {
                                "$remaining left · more than the books show"
                            } else {
                                "$remaining left after this"
                            },
                            color = if (remaining < 0) Bad else Muted,
                            fontSize = 12.sp,
                        )
                    }
                    IconButton(onClick = { onSetQty(picked.part.id, picked.qty - 1) }) {
                        Icon(Icons.Default.Remove, "One fewer")
                    }
                    Text(
                        picked.qty.toString(), color = Ink,
                        fontWeight = FontWeight.Black, fontSize = 17.sp,
                    )
                    IconButton(onClick = { onSetQty(picked.part.id, picked.qty + 1) }) {
                        Icon(Icons.Default.Add, "One more")
                    }
                }
            }
        }
    }
}

@Composable
private fun PartPickerDialog(
    stock: List<Part>,
    onPick: (Part, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, stock) {
        if (query.isBlank()) stock
        else stock.filter {
            it.name.contains(query, true) ||
                it.partNumber.contains(query, true) ||
                it.supplier.contains(query, true)
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Navy2),
            shape = RoundedCornerShape(18.dp),
        ) {
            Column(Modifier.padding(16.dp).fillMaxHeight(0.85f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Take from store", color = Ink, fontWeight = FontWeight.Black,
                        fontSize = 19.sp, modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Close") }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    query, { query = it },
                    placeholder = { Text("Search part, number or supplier") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))

                if (stock.isEmpty()) {
                    Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        Text(
                            "No parts on file yet.\nThe stock manager adds them.",
                            color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center,
                        )
                    }
                } else {
                    LazyColumn(
                        Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(filtered, key = { it.id }) { part ->
                            Row(
                                Modifier.fillMaxWidth()
                                    .clickable { onPick(part, 1); onDismiss() }
                                    .padding(vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    Icons.Default.Inventory2, null,
                                    tint = if (part.isOversold) Bad else Amber,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(part.name, color = Ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text(
                                        listOfNotNull(
                                            part.partNumber.ifBlank { null },
                                            part.supplier.ifBlank { null },
                                        ).joinToString("  ·  "),
                                        color = Muted, fontSize = 12.sp,
                                    )
                                }
                                Text(
                                    part.quantity.toString(),
                                    color = when {
                                        part.isOversold -> Bad
                                        part.isLow -> Amber
                                        else -> Ink
                                    },
                                    fontWeight = FontWeight.Black, fontSize = 16.sp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FlowRowChips(options: List<String>, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { opt ->
                    AssistChip(onClick = { onPick(opt) }, label = { Text(opt, fontSize = 13.sp) })
                }
            }
        }
    }
}

// -------------------------------------------------------------- arrivals ----

@Composable
fun ArrivalsScreen(state: UiState, onClick: (Arrival) -> Unit) {
    if (state.arrivals.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No vehicles logged yet today.", color = Muted, fontSize = 14.sp)
        }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(vertical = 18.dp),
    ) {
        items(state.arrivals, key = { it.id }) { a -> ArrivalRow(a) { onClick(a) } }
    }
}

@Composable
fun ArchiveScreen(state: UiState, onShiftDay: (Int) -> Unit, onClick: (Arrival) -> Unit) {
    val dayFmt = remember { SimpleDateFormat("EEE, d MMM yyyy", Locale.getDefault()) }
    val canGoForward = remember(state.archiveDayStart) { !isTodayOrLater(state.archiveDayStart) }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            IconButton(onClick = { onShiftDay(-1) }) { Icon(Icons.Default.ChevronLeft, "Previous day") }
            Text(dayFmt.format(Date(state.archiveDayStart)), fontWeight = FontWeight.Black, fontSize = 15.sp)
            IconButton(onClick = { onShiftDay(1) }, enabled = canGoForward) {
                Icon(Icons.Default.ChevronRight, "Next day")
            }
        }
        when {
            state.archiveLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.archiveArrivals.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No vehicles logged that day.", color = Muted, fontSize = 14.sp)
            }
            else -> LazyColumn(
                Modifier.fillMaxSize().padding(horizontal = 18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 18.dp),
            ) {
                items(state.archiveArrivals, key = { it.id }) { a -> ArrivalRow(a) { onClick(a) } }
            }
        }
    }
}

@Composable
private fun ArrivalRow(a: Arrival, onClick: () -> Unit) {
    val fmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    Card(
        colors = CardDefaults.cardColors(containerColor = Navy2),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(a.plate, fontWeight = FontWeight.Black, fontSize = 17.sp, color = Ink)
                val when_ = a.arrivedAt?.toDate()?.let { fmt.format(it) }
                    ?: if (a.pending) "sending..." else ""
                Text(
                    listOfNotNull(
                        a.make?.ifBlank { null }, a.colour?.ifBlank { null },
                        a.requestedWork.ifBlank { null }, when_.ifBlank { null },
                    ).joinToString("  ·  "),
                    color = Muted, fontSize = 12.sp,
                )
                if (a.partsUsed.isNotEmpty()) {
                    Text(
                        "${a.partsUsed.sumOf { it.qty }} part(s) taken from store",
                        color = Amber, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    )
                }
            }
            AssistChip(onClick = {}, label = { Text(a.status.label, fontSize = 10.sp) })
        }
    }
}

@Composable
fun ArrivalDetailDialog(arrival: Arrival, onDismiss: () -> Unit) {
    val fmt = remember { SimpleDateFormat("EEE, d MMM yyyy 'at' HH:mm", Locale.getDefault()) }
    Dialog(onDismissRequest = onDismiss) {
        Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState())) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        arrival.plate, fontWeight = FontWeight.Black, fontSize = 22.sp,
                        color = Ink, modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Close") }
                }
                AssistChip(onClick = {}, label = { Text(arrival.status.label, fontSize = 11.sp) })
                Spacer(Modifier.height(14.dp))
                DetailRow("Make / model", arrival.make)
                DetailRow("Colour", arrival.colour)
                DetailRow("What the client wants", arrival.requestedWork.ifBlank { null })
                DetailRow("Driver", arrival.driverName)
                DetailRow("Phone", arrival.driverPhone)
                DetailRow("Notes", arrival.notes)
                DetailRow("Arrived", arrival.arrivedAt?.toDate()?.let { fmt.format(it) })
                DetailRow("Logged by", arrival.loggedByName)

                if (arrival.partsUsed.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "TAKEN FROM STORE", color = Muted, fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(6.dp))
                    arrival.partsUsed.forEach { p ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Text("${p.qty} × ${p.partName}", color = Ink, fontSize = 14.sp,
                                modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Column(Modifier.padding(bottom = 10.dp)) {
        Text(label.uppercase(), color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Black)
        Text(value, color = Ink, fontSize = 14.sp)
    }
}

private fun isTodayOrLater(dayStart: Long): Boolean {
    val today = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    return dayStart >= today
}
