package rw.smartgarage.stock.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Navy = Color(0xFF111827)
val Navy2 = Color(0xFF1B2338)
val Navy3 = Color(0xFF232C45)
val Amber = Color(0xFFF5B921)
val Ink = Color(0xFFE8EAF0)
val Muted = Color(0xFF8E97AD)
val Ok = Color(0xFF10B981)
val Bad = Color(0xFFF43F5E)

private val scheme = darkColorScheme(
    primary = Amber,
    onPrimary = Navy,
    background = Navy,
    onBackground = Ink,
    surface = Navy2,
    onSurface = Ink,
    surfaceVariant = Navy3,
    onSurfaceVariant = Ink,
    error = Bad,
)

@Composable
fun StockTheme(content: @Composable () -> Unit) {
    // The workshop floor is bright and the app is used one-handed; a single
    // high-contrast dark scheme is easier to read at a glance than a theme
    // that changes with the phone's settings.
    @Suppress("UNUSED_EXPRESSION") isSystemInDarkTheme()
    MaterialTheme(colorScheme = scheme, content = content)
}