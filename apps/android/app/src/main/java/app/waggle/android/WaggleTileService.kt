package app.waggle.android

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Quick Settings toggle: empty Wi-Fi icon when off, filled when on. Colors come from the system. */
class WaggleTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onStartListening() = render()

    override fun onClick() {
        val controller = WaggleController.get(this)
        val state = controller.state.value
        // The first OS approval of Wi-Fi suggestions must happen with the app on screen.
        if (!state.signedIn || !state.approved) return openApp()
        val toggle = {
            scope.launch {
                if (controller.state.value.on) controller.turnOff() else controller.turnOn()
                render()
            }
        }
        // Turning off removes school Wi-Fi: require unlock on the lock screen.
        if (isLocked && state.on) unlockAndRun { toggle() } else toggle()
    }

    private fun render() {
        val tile = qsTile ?: return
        val on = WaggleController.get(this).state.value.on
        tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "와글"
        tile.subtitle = if (on) "켜짐" else "꺼짐"
        tile.icon = Icon.createWithResource(this, if (on) R.drawable.ic_tile_on else R.drawable.ic_tile_off)
        tile.updateTile()
    }

    private fun openApp() {
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
        } else {
            legacyCollapse(intent)
        }
    }

    // Android 12-13 only accept an Intent here; the PendingIntent overload exists from API 34.
    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    @Suppress("DEPRECATION")
    private fun legacyCollapse(intent: Intent) {
        startActivityAndCollapse(intent)
    }

    companion object {
        fun refresh(context: Context) =
            requestListeningState(context, ComponentName(context, WaggleTileService::class.java))
    }
}
