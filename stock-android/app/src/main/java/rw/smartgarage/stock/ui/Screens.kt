package rw.smartgarage.stock.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import rw.smartgarage.stock.data.UNGROUPED
import rw.smartgarage.stock.data.PartGroup

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
    onOpenGroup: (String?) -> Unit,
    onAddToGroup: (String) -> Unit,
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

        // Inside a heading: a way back, and a way to add another product to it
        // without retyping the heading name.
        // A search reaches across the whole shelf, so the heading banner
        // would be lying while one is running.
        state.openGroup?.takeIf { state.query.isBlank() }?.let { group ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { onOpenGroup(null) }) { Text("< All shelves") }
                Spacer(Modifier.weight(1f))
                if (group != UNGROUPED) {
                    TextButton(onClick = { onAddToGroup(group) }) { Text("+ Add to $group") }
                }
            }
            Text(
                group.uppercase(),
                color = Ink, fontWeight = FontWeight.Black, fontSize = 18.sp,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(8.dp))
        }

        if (state.visible.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    if (state.stock.isEmpty()) "Nothing on the shelf yet.\nTap + to add a group of products."
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
            if (state.showingParts) {
                items(state.visible, key = { it.id }) { part ->
                    PartRow(
                        part,
                        // While searching the whole shelf, say which heading a
                        // result came from - the name alone is not enough to
                        // tell two similar products apart.
                        showGroup = state.openGroup == null,
                        onEdit = { onEdit(part) },
                        onAdjust = { onAdjust(part) },
                        onReceive = { onReceive(part, 1) },
                    )
                }
            } else {
                items(state.groups, key = { it.name }) { group ->
                    GroupRow(group, onClick = { onOpenGroup(group.name) })
                }
            }
        }
    }
}

/**
 * One heading on the shelf.
 *
 * Deliberately shows the counts that would make someone open it - what needs
 * ordering, what needs recounting - so a heading is not just a lid over
 * trouble. A washing bay with four products below their reorder level should
 * say so from the top of the list.
 */
@Composable
private fun GroupRow(group: PartGroup, onClick: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Navy2),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(group.name, color = Ink, fontWeight = FontWeight.Black, fontSize = 17.sp)
                Text(
                    listOfNotNull(
                        "${group.parts.size} product" + if (group.parts.size == 1) "" else "s",
                        "${group.totalQuantity} in stock",
                        if (group.pending) "syncing..." else null,
                    ).joinToString("  ·  "),
                    color = if (group.pending) Amber else Muted, fontSize = 12.sp,
                )
                if (group.oversoldCount > 0 || group.lowCount > 0) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        listOfNotNull(
                            if (group.oversoldCount > 0) "${group.oversoldCount} to recount" else null,
                            if (group.lowCount > 0) "${group.lowCount} to order" else null,
                        ).joinToString("  ·  "),
                        color = if (group.oversoldCount > 0) Bad else Amber, fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Text(">", color = Muted, fontSize = 20.sp, fontWeight = FontWeight.Black)
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
private fun PartRow(
    part: Part,
    showGroup: Boolean = false,
    onEdit: () -> Unit,
    onAdjust: () -> Unit,
    onReceive: () -> Unit,
) {
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
                            if (showGroup) part.group.ifBlank { null } else null,
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
fun PartEditorDialog(
    part: Part,
    knownGroups: List<String> = emptyList(),
    onSave: (Part) -> Unit,
    onDelete: (() -> Unit)? = null,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(part.name) }
    var group by remember { mutableStateOf(part.group) }
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
                OutlinedTextField(
                    group, { group = it },
                    label = { Text("Shelf / group (e.g. Car wash)") },
                    placeholder = { Text("Leave blank to keep it on its own") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                if (knownGroups.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    // Tapping an existing heading beats retyping it: two
                    // spellings of "Car wash" are two shelves, and nobody
                    // notices until the list has both.
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        knownGroups.forEach { known ->
                            FilterChip(
                                selected = group.trim().equals(known, true),
                                onClick = { group = known },
                                label = { Text(known, fontSize = 12.sp) },
                            )
                        }
                    }
                }
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
                                group = group,
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

                if (!isNew && onDelete != null) {
                    Spacer(Modifier.height(6.dp))
                    TextButton(
                        onClick = onDelete,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Delete this product", color = Bad, fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

/**
 * Asks before removing a product, and says what removing it means.
 *
 * Anything still counted is written off rather than quietly disappearing, so
 * the number on the confirmation is the number that will show up in the
 * ledger afterwards.
 */
@Composable
fun DeletePartDialog(part: Part, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(20.dp)) {
                Text("Delete ${part.name}?", color = Ink, fontWeight = FontWeight.Black, fontSize = 19.sp)
                Spacer(Modifier.height(10.dp))
                Text(
                    if (part.quantity != 0) {
                        "It still shows ${part.quantity} in stock. Those will be written " +
                            "off to the ledger first, so the history says where they went. " +
                            "The product itself is gone for good."
                    } else {
                        "Nothing is counted against it, so this only removes the product " +
                            "from the shelf. Past movements stay in the ledger."
                    },
                    color = Muted, fontSize = 13.sp,
                )
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = onDismiss, shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).height(50.dp),
                    ) { Text("Keep it") }
                    Button(
                        onClick = onConfirm,
                        colors = ButtonDefaults.buttonColors(containerColor = Bad),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).height(50.dp),
                    ) { Text("Delete", fontWeight = FontWeight.Black) }
                }
            }
        }
    }
}

/**
 * Sets up a whole shelf at once: the heading, then everything under it.
 *
 * This is the shape a stock manager actually works in. A washing bay is soap,
 * wax, cloths and brushes bought together, and entering those through four
 * separate dialogs is why half-entered shelves happen.
 */
@Composable
fun GroupEditorDialog(
    initialName: String = "",
    onSave: (String, List<Part>) -> Unit,
    onDismiss: () -> Unit,
) {
    var groupName by remember { mutableStateOf(initialName) }
    // Always one blank line at the end so there is somewhere to type without
    // hunting for an add button first.
    var lines by remember { mutableStateOf(listOf(Part())) }

    fun update(index: Int, part: Part) {
        lines = lines.toMutableList().also { it[index] = part }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(20.dp).fillMaxHeight(0.9f).verticalScroll(rememberScrollState())) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "New shelf", color = Ink, fontWeight = FontWeight.Black,
                        fontSize = 20.sp, modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Close") }
                }
                Text(
                    "One heading, and the products that live under it.",
                    color = Muted, fontSize = 12.sp,
                )

                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    groupName, { groupName = it },
                    label = { Text("Shelf name") },
                    placeholder = { Text("Car wash") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(16.dp))
                Text("PRODUCTS", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Black)

                lines.forEachIndexed { index, line ->
                    Spacer(Modifier.height(10.dp))
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Navy3),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    line.name, { update(index, line.copy(name = it)) },
                                    label = { Text("Product ${index + 1}") },
                                    placeholder = { Text("Soap") },
                                    singleLine = true, modifier = Modifier.weight(1f),
                                )
                                if (lines.size > 1) {
                                    IconButton(onClick = {
                                        lines = lines.filterIndexed { i, _ -> i != index }
                                    }) { Icon(Icons.Default.Close, "Remove line", tint = Muted) }
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    if (line.quantity == 0) "" else line.quantity.toString(),
                                    { update(index, line.copy(quantity = it.filter(Char::isDigit).toIntOrNull() ?: 0)) },
                                    label = { Text("Qty") }, singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    if (line.unitCost == 0.0) "" else line.unitCost.toInt().toString(),
                                    { update(index, line.copy(unitCost = it.filter(Char::isDigit).toDoubleOrNull() ?: 0.0)) },
                                    label = { Text("Cost") }, singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    if (line.reorderLevel == 0) "" else line.reorderLevel.toString(),
                                    { update(index, line.copy(reorderLevel = it.filter(Char::isDigit).toIntOrNull() ?: 0)) },
                                    label = { Text("Reorder") }, singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))
                TextButton(onClick = { lines = lines + Part() }) { Text("+ Another product") }

                Spacer(Modifier.height(16.dp))
                val ready = groupName.isNotBlank() && lines.any { it.name.isNotBlank() }
                Button(
                    onClick = { onSave(groupName, lines.filter { it.name.isNotBlank() }) },
                    enabled = ready,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) {
                    val count = lines.count { it.name.isNotBlank() }
                    Text(
                        if (count > 0) "Save shelf with $count product" + (if (count == 1) "" else "s")
                        else "Save shelf",
                        fontWeight = FontWeight.Black,
                    )
                }
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
