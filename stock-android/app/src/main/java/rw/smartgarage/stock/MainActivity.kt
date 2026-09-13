package rw.smartgarage.stock

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import rw.smartgarage.stock.data.Part
import rw.smartgarage.stock.ui.*

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            StockTheme {
                val vm: StockViewModel = viewModel()
                val state by vm.state.collectAsState()
                var tab by remember { mutableIntStateOf(0) }

                when {
                    state.loading -> Box(Modifier.fillMaxSize()) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    }
                    // An unpaired phone reaches nothing until it knows which
                    // garage's shelf it is looking at.
                    state.session == null -> PairingScreen(state, vm::pair)
                    else -> Scaffold(
                        topBar = {
                            TopAppBar(
                                title = {
                                    Column {
                                        Row {
                                            Text("Garage ", fontWeight = FontWeight.Black, fontSize = 16.sp)
                                            Text("Stock", fontWeight = FontWeight.Black, fontSize = 16.sp, color = Amber)
                                        }
                                        state.session?.staffName?.let {
                                            Text(it, fontSize = 11.sp, color = Muted)
                                        }
                                    }
                                },
                                colors = TopAppBarDefaults.topAppBarColors(containerColor = Navy2),
                            )
                        },
                        bottomBar = {
                            NavigationBar(containerColor = Navy2) {
                                NavigationBarItem(
                                    tab == 0, { tab = 0 },
                                    icon = { Icon(Icons.Default.Inventory2, null) },
                                    label = { Text("Shelf") },
                                )
                                NavigationBarItem(
                                    tab == 1, { tab = 1 },
                                    icon = { Icon(Icons.Default.SwapVert, null) },
                                    label = { Text("Movements") },
                                )
                            }
                        },
                        floatingActionButton = {
                            if (tab == 0) {
                                FloatingActionButton(onClick = { vm.edit(Part()) }, containerColor = Amber) {
                                    Icon(Icons.Default.Add, "Add a part")
                                }
                            }
                        },
                    ) { pad ->
                        Box(Modifier.padding(pad)) {
                            when (tab) {
                                0 -> ShelfScreen(
                                    state = state,
                                    onSearch = vm::search,
                                    onEdit = vm::edit,
                                    onAdjust = vm::adjust,
                                    onReceive = vm::receive,
                                )
                                else -> LedgerScreen(state)
                            }

                            state.editing?.let { part ->
                                PartEditorDialog(part, onSave = vm::savePart) { vm.edit(null) }
                            }
                            state.adjusting?.let { part ->
                                CountDialog(part, onSet = { vm.setCount(part, it) }) { vm.adjust(null) }
                            }
                        }
                    }
                }
            }
        }
    }
}
