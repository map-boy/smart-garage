package rw.smartgarage.reception.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import rw.smartgarage.reception.data.Arrival
import java.text.SimpleDateFormat
import java.util.Locale

private val REASONS = listOf("Service", "Repair", "Car wash", "Diagnostics", "Bodywork", "Collection", "Other")

@Composable
fun SignInScreen(state: UiState, onSignIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Garage", fontSize = 28.sp, fontWeight = FontWeight.Black, color = Ink)
        Text("Reception", fontSize = 28.sp, fontWeight = FontWeight.Black, color = Amber)
        Spacer(Modifier.height(6.dp))
        Text("Log every vehicle that comes through the gate.",
            color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(28.dp))

        OutlinedTextField(email, { email = it }, label = { Text("Email") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done))

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Bad, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }

        Spacer(Modifier.height(22.dp))
        Button(
            onClick = { onSignIn(email, password) },
            enabled = !state.busy,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) { Text(if (state.busy) "Signing in..." else "Sign in", fontWeight = FontWeight.Black) }
    }
}

@Composable
fun CheckInScreen(state: UiState, onCheckIn: (Arrival) -> Unit, onDone: () -> Unit) {
    var plate by remember { mutableStateOf("") }
    var make by remember { mutableStateOf("") }
    var colour by remember { mutableStateOf("") }
    var driver by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf(REASONS.first()) }

    state.lastCheckedIn?.let { done ->
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.size(88.dp).background(Ok.copy(alpha = .15f), RoundedCornerShape(44.dp)),
                contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Check, null, tint = Ok, modifier = Modifier.size(44.dp))
            }
            Spacer(Modifier.height(20.dp))
            Text(done, fontSize = 24.sp, fontWeight = FontWeight.Black, color = Ink)
            Spacer(Modifier.height(8.dp))
            Text("Saved. The admin sees it as soon as this phone has signal.",
                color = Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = { plate = ""; make = ""; colour = ""; driver = ""; phone = ""; notes = ""; onDone() },
                shape = RoundedCornerShape(14.dp)) { Text("Log another vehicle") }
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
                fontWeight = FontWeight.Black, textAlign = TextAlign.Center),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next),
        )

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(make, { make = it }, label = { Text("Make / model") },
                singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(colour, { colour = it }, label = { Text("Colour") },
                singleLine = true, modifier = Modifier.weight(1f))
        }

        Spacer(Modifier.height(16.dp))
        Text("REASON FOR VISIT", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        FlowRowChips(REASONS, reason) { reason = it }

        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(driver, { driver = it }, label = { Text("Driver") },
                singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(phone, { phone = it }, label = { Text("Phone") },
                singleLine = true, modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        }

        Spacer(Modifier.height(12.dp))
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") },
            modifier = Modifier.fillMaxWidth(), minLines = 2)

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Bad, fontSize = 13.sp)
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                onCheckIn(Arrival(plate = plate, make = make, colour = colour,
                    driverName = driver, driverPhone = phone, reason = reason, notes = notes))
            },
            enabled = !state.busy,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(58.dp),
        ) {
            Icon(Icons.Default.DirectionsCar, null)
            Spacer(Modifier.width(8.dp))
            Text(if (state.busy) "Saving..." else "Check vehicle in", fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun FlowRowChips(options: List<String>, selected: String, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { opt ->
                    FilterChip(
                        selected = selected == opt,
                        onClick = { onPick(opt) },
                        label = { Text(opt, fontSize = 13.sp) },
                    )
                }
            }
        }
    }
}

@Composable
fun ArrivalsScreen(state: UiState) {
    if (state.arrivals.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No vehicles logged yet today.", color = Muted, fontSize = 14.sp)
        }
        return
    }
    val fmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(vertical = 18.dp),
    ) {
        items(state.arrivals, key = { it.id }) { a ->
            Card(colors = CardDefaults.cardColors(containerColor = Navy2), shape = RoundedCornerShape(14.dp)) {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(a.plate, fontWeight = FontWeight.Black, fontSize = 17.sp, color = Ink)
                        val when_ = a.arrivedAt?.toDate()?.let { fmt.format(it) }
                            ?: if (a.pending) "sending..." else ""
                        Text(
                            listOfNotNull(a.make?.ifBlank { null }, a.colour?.ifBlank { null },
                                a.reason.ifBlank { null }, when_.ifBlank { null }).joinToString("  \u00b7  "),
                            color = Muted, fontSize = 12.sp,
                        )
                    }
                    AssistChip(onClick = {}, label = { Text(a.status.label, fontSize = 10.sp) })
                }
            }
        }
    }
}