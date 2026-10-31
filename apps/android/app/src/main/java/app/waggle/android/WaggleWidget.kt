package app.waggle.android

import android.content.Context
import androidx.compose.ui.unit.dp
import androidx.glance.Button
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Home screen widget: the Waggle character asleep (off) or awake (on), and one button. Nothing else. */
class WaggleWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = WaggleController.get(context).state.value
        provideContent {
            GlanceTheme {
                Column(
                    modifier = GlanceModifier.fillMaxSize().background(GlanceTheme.colors.widgetBackground).cornerRadius(16.dp).padding(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Image(
                        provider = ImageProvider(if (state.on) R.drawable.waggle_awake else R.drawable.waggle_asleep),
                        contentDescription = if (state.on) "와글 켜짐" else "와글 꺼짐",
                        modifier = GlanceModifier.size(56.dp),
                    )
                    Spacer(GlanceModifier.height(6.dp))
                    Button(
                        text = if (state.on) "끄기" else "켜기",
                        onClick = if (state.signedIn && state.approved) actionRunCallback<ToggleAction>() else actionStartActivity<MainActivity>(),
                    )
                }
            }
        }
    }

    companion object {
        fun refresh(context: Context) {
            CoroutineScope(Dispatchers.Default).launch { WaggleWidget().updateAll(context) }
        }
    }
}

class ToggleAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val controller = WaggleController.get(context)
        if (controller.state.value.on) controller.turnOff() else controller.turnOn()
    }
}

class WaggleWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WaggleWidget()
}
