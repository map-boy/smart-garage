package rw.smartgarage.reception

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import rw.smartgarage.reception.ui.*

class MainActivity : ComponentActivity() {

    private val requestNotifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            requestNotifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            ReceptionTheme {
                val vm: ReceptionViewModel = viewModel()
                val state by vm.state.collectAsState()
                var tab by remember { mutableIntStateOf(0) }
                when {
                    state.loading -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                    state.profile == null -> ConnectingScreen(state.error) { vm.retry() }
                    else -> Scaffold(
                        topBar = {
                            TopAppBar(
                                title = {
                                    Row {
                                        Text("Garage ", fontWeight = FontWeight.Black, fontSize = 16.sp)
                                        Text("Reception", fontWeight = FontWeight.Black, fontSize = 16.sp, color = Amber)
                                    }
                                },
                                colors = TopAppBarDefaults.topAppBarColors(containerColor = Navy2),
                            )
                        },
                        bottomBar = {
                            NavigationBar(containerColor = Navy2) {
                                NavigationBarItem(tab == 0, { tab = 0 },
                                    icon = { Icon(Icons.Default.DirectionsCar, null) },
                                    label = { Text("Check in") })
                                NavigationBarItem(tab == 1, { tab = 1 },
                                    icon = { Icon(Icons.Default.Checklist, null) },
                                    label = { Text("Today") })
                            }
                        },
                    ) { pad ->
                        Box(Modifier.padding(pad)) {
                            if (tab == 0) {
                                CheckInScreen(state, vm::checkIn) { vm.clearConfirmation(); tab = 1 }
                            } else {
                                ArrivalsScreen(state)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConnectingScreen(error: String?, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (error == null) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text("Connecting…")
            } else {
                Text(error, textAlign = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
                Button(onClick = onRetry) { Text("Retry") }
            }
        }
    }
}