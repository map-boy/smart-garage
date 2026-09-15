package rw.smartgarage.stock.ui

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
import androidx.compose.material.icons.filled.Close
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
import rw.smartgarage.stock.data.Movement
import rw.smartgarage.stock.data.Part

@Composable
fun PairingScreen(state: StockUiState, onPair: (String, String) -> Unit) {
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Set up this phone", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Ink)
        Spacer(Modifier.height(8.dp))
        Text("Ask the office for a stock pairing code. You only do this once.",
            color = Muted, fontSize = 14.sp)

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
            supportingText = { Text("Shown against every stock movement you make.") },
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
        ) { Text(if (state.pairing) "Pairing..." else "Pair this phone", fontWeight = FontWeight.Black) }
    }
}

// ----------------------------------------------------------------- shelf ----

@Composable
fun ShelfScreen(
    state: StockUiState,
    onSearch: (String) -> Unit,
    onEdit: (Part?) -> Unit,
    onAdjust: (Part?) -> Unit,
    onReceive: (Part, Int) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        // Two numbers a stock manager checks before anything else: what needs
        // ordering, and what has gone impossible and needs a recount.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StatChip("To order", state.lowCount.toString(), Amber, Modifier.weight(1f))
            StatChip("Recount", state.oversoldCount.toString(),
                if (state.oversoldCount > 0) Bad else Muted, Modifier.weight(1f))
        }

        OutlinedTextField(
            state.query, onSearch,
            placeholder = { Text("Search part, number or supplier") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )

        if (state.visible.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    if (state.stock.isEmpty()) "No parts yet.\nTap + to add the first one."
                    else "Nothing matches that search.",
                    color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center,
                )
            }
            return
        }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.visible, key = { it.id }) { part ->
                PartRow(part, onEdit = { onEdit(part) }, onAdjust = { onAdjust(part) },
                    onReceive = { onReceive(part, 1) })
            }
        }
    }
}

@Composable
private fun StatChip(label: String, value: String, tint: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Navy2),
        shape = RoundedCornerShape(12.dp), modifier = modifier,
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(label.uppercase(), color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Black)
            Text(value, color = tint, fontSize = 22.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun PartRow(part: Part, onEdit: () -> Unit, onAdjust: () -> Unit, onReceive: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Navy2),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onEdit),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(part.name, color = Ink, fontWeight = FontWeight.Black, fontSize = 16.sp)
                    Text(
                        listOfNotNull(
                            part.partNumber.ifBlank { null },
                            part.supplier.ifBlank { null },
                            // The count on screen is the phone's own until the
                            // server confirms it. Say so rather than showing a
                            // clean number that the office cannot see yet.
                            if (part.pending) "syncing..." else null,
                        ).joinToString("  ·  "),
                        color = if (part.pending) Amber else Muted, fontSize = 12.sp,
                    )
                }
                Text(
                    part.quantity.toString(),
                    color = when {
                        part.isOversold -> Bad
                        part.isLow -> Amber
                        else -> Ink
                    },
                    fontSize = 22.sp, fontWeight = FontWeight.Black,
                )
            }
            if (part.isOversold) {
                Text(
                    "Below zero - more went out than the books knew about. Count it.",
                    color = Bad, fontSize = 11.sp,
                )
            } else if (part.isLow) {
                Text("At or below the reorder level of ${part.reorderLevel}.", color = Amber, fontSize = 11.sp)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onReceive) { Text("+1 received") }
                TextButton(onClick = onAdjust) { Text("Count") }
                TextButton(onClick = onEdit) { Text("Edit") }
            }
        }
    }
}

// ------------------------------------------------------------- movements ----

@Composable
fun LedgerScreen(state: StockUiState) {
    if (state.movements.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Nothing has moved yet.", color = Muted, fontSize = 14.sp)
        }
        return
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(state.movements, key = { it.id }) { m -> MovementRow(m) }
    }
}

@Composable
private fun MovementRow(m: Movement) {
    Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(m.partName, color = Ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(
                    listOfNotNull(
                        m.reason.label,
                        m.plate?.ifBlank { null },
                        m.byName.ifBlank { null },
                        m.atLocal.take(16).replace('T', ' ').ifBlank { null },
                        if (m.pending) "sending..." else null,
                    ).joinToString("  ·  "),
                    color = Muted, fontSize = 11.sp,
                )
                m.note?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = Muted, fontSize = 11.sp)
                }
            }
            Text(
                if (m.delta > 0) "+${m.delta}" else m.delta.toString(),
                color = if (m.delta > 0) Ok else Bad,
                fontSize = 18.sp, fontWeight = FontWeight.Black,
            )
        }
    }
}

// ----------------------------------------------------------------- edits ----

@Composable
fun PartEditorDialog(part: Part, onSave: (Part) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(part.name) }
    var number by remember { mutableStateOf(part.partNumber) }
    var supplier by remember { mutableStateOf(part.supplier) }
    var cost by remember { mutableStateOf(if (part.unitCost == 0.0) "" else part.unitCost.toInt().toString()) }
    var reorder by remember { mutableStateOf(part.reorderLevel.toString()) }
    var opening by remember { mutableStateOf(if (part.id.isBlank()) "0" else part.quantity.toString()) }
    val isNew = part.id.isBlank()

    Dialog(onDismissRequest = onDismiss) {
        Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState())) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (isNew) "New part" else "Edit part",
                        color = Ink, fontWeight = FontWeight.Black, fontSize = 20.sp,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Close") }
                }
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(name, { name = it }, label = { Text("Name") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(number, { number = it }, label = { Text("Part number") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(supplier, { supplier = it }, label = { Text("Supplier") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        cost, { cost = it.filter(Char::isDigit) },
                        label = { Text("Unit cost") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        reorder, { reorder = it.filter(Char::isDigit) },
                        label = { Text("Reorder at") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                }

                if (isNew) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        opening, { opening = it.filter(Char::isDigit) },
                        label = { Text("Opening count") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    Spacer(Modifier.height(10.dp))
                    // Quantity is not editable here on purpose. Changing a
                    // count is a physical fact with a reason, so it goes
                    // through Count and leaves a ledger line behind.
                    Text(
                        "Quantity is ${part.quantity}. Use Count to correct it, so the change is recorded.",
                        color = Muted, fontSize = 12.sp,
                    )
                }

                Spacer(Modifier.height(18.dp))
                Button(
                    onClick = {
                        onSave(
                            part.copy(
                                name = name, partNumber = number, supplier = supplier,
                                unitCost = cost.toDoubleOrNull() ?: 0.0,
                                reorderLevel = reorder.toIntOrNull() ?: 0,
                                quantity = if (isNew) (opening.toIntOrNull() ?: 0) else part.quantity,
                            )
                        )
                    },
                    enabled = name.isNotBlank(),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) { Text(if (isNew) "Add part" else "Save", fontWeight = FontWeight.Black) }
            }
        }
    }
}

@Composable
fun CountDialog(part: Part, onSet: (Int) -> Unit, onDismiss: () -> Unit) {
    var counted by remember { mutableStateOf(part.quantity.coerceAtLeast(0).toString()) }
    val target = counted.toIntOrNull()
    val delta = (target ?: part.quantity) - part.quantity

    Dialog(onDismissRequest = onDismiss) {
        Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(20.dp)) {
                Text(part.name, color = Ink, fontWeight = FontWeight.Black, fontSize = 19.sp)
                Text("The books say ${part.quantity}.", color = Muted, fontSize = 13.sp)
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    counted, { counted = it.filter(Char::isDigit) },
                    label = { Text("Counted on the shelf") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    when {
                        target == null -> " "
                        delta == 0 -> "No change."
                        delta > 0 -> "Adds $delta to the books."
                        else -> "Takes ${-delta} off the books."
                    },
                    color = if (delta == 0) Muted else Amber, fontSize = 13.sp,
                )
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Cancel") }
                    Button(
                        onClick = { target?.let(onSet) },
                        enabled = target != null,
                        modifier = Modifier.weight(1f),
                    ) { Text("Record count") }
                }
            }
        }
    }
}
