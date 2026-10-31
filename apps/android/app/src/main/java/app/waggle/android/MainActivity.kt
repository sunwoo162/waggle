package app.waggle.android

import android.app.StatusBarManager
import android.content.ComponentName
import android.graphics.drawable.Icon
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executor

class MainActivity : ComponentActivity() {
    private val approvalListener = WifiManager.SuggestionUserApprovalStatusListener { status ->
        WaggleController.get(this).markApproved(
            status == WifiManager.STATUS_SUGGESTION_APPROVAL_APPROVED_BY_USER ||
                status == WifiManager.STATUS_SUGGESTION_APPROVAL_APPROVED_BY_CARRIER_PRIVILEGE,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val context = LocalContext.current
            val dark = isSystemInDarkTheme()
            MaterialTheme(colorScheme = if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)) {
                Surface(Modifier.fillMaxSize()) { WaggleScreen(onTurnedOn = ::offerTile) }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val executor = Executor { it.run() }
        getSystemService(WifiManager::class.java).addSuggestionUserApprovalStatusListener(executor, approvalListener)
    }

    override fun onStop() {
        getSystemService(WifiManager::class.java).removeSuggestionUserApprovalStatusListener(approvalListener)
        super.onStop()
    }

    /** Android 13+: offer to add the Quick Settings toggle right after the first successful turn-on. */
    private fun offerTile() {
        if (Build.VERSION.SDK_INT < 33) return
        val prefs = getSharedPreferences("waggle.state", MODE_PRIVATE)
        if (prefs.getBoolean("tileOffered", false)) return
        prefs.edit().putBoolean("tileOffered", true).apply()
        getSystemService(StatusBarManager::class.java).requestAddTileService(
            ComponentName(this, WaggleTileService::class.java),
            "와글",
            Icon.createWithResource(this, R.drawable.ic_tile_on),
            mainExecutor,
        ) { }
    }
}

@Composable
private fun WaggleScreen(onTurnedOn: () -> Unit) {
    val context = LocalContext.current
    val controller = remember { WaggleController.get(context) }
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("와글", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(24.dp))
        if (!state.signedIn) {
            LoginForm(state.busy) { origin, code -> scope.launch { controller.login(origin, code) } }
        } else {
            Toggle(state, onClick = {
                scope.launch {
                    if (state.on) controller.turnOff() else {
                        controller.turnOn()
                        if (controller.state.value.on) onTurnedOn()
                    }
                }
            })
            Spacer(Modifier.height(16.dp))
            Text(
                if (state.on) "학교 Wi-Fi ${state.rooms}곳이 등록돼 있어요. 비밀번호 없이 자동으로 연결돼요."
                else "켜기를 누르면 학교 Wi-Fi ${state.rooms}곳을 휴대폰에 등록해요.",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (state.on && !state.approved) {
                Text("처음 한 번은 화면에 뜨는 Wi-Fi 등록 허용을 눌러주세요.", style = MaterialTheme.typography.bodySmall)
            }
            state.lastSync?.let {
                Text("마지막 갱신 " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it)), style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(24.dp))
            var requesting by remember { mutableStateOf(false) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(enabled = !state.busy, onClick = { scope.launch { controller.sync() } }) { Text("지금 갱신") }
                OutlinedButton(enabled = !state.busy, onClick = { requesting = true }) { Text("Wi-Fi 등록 요청") }
            }
            var deleting by remember { mutableStateOf(false) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(enabled = !state.busy, onClick = { scope.launch { controller.logout() } }) { Text("로그아웃") }
                TextButton(enabled = !state.busy, onClick = { deleting = true }) { Text("계정 삭제") }
            }
            if (deleting) AlertDialog(
                onDismissRequest = { deleting = false },
                title = { Text("계정을 영구히 삭제할까요?") },
                text = { Text("개인 코드, 모든 기기의 로그인, 모은 친구 기록이 지워지고 되돌릴 수 없어요. 와글이 등록한 학교 Wi-Fi도 지워요.") },
                confirmButton = { TextButton(onClick = { deleting = false; scope.launch { controller.deleteAccount() } }) { Text("영구 삭제") } },
                dismissButton = { TextButton(onClick = { deleting = false }) { Text("취소") } },
            )
            if (requesting) RequestDialog(onDismiss = { requesting = false }) { room, ssid, security, password ->
                requesting = false
                scope.launch { controller.requestWifi(room, ssid, security, password) }
            }
        }
        state.message?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun Toggle(state: WaggleState, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Image(
            painter = painterResource(if (state.on) R.drawable.waggle_awake else R.drawable.waggle_asleep),
            contentDescription = if (state.on) "와글 켜짐" else "와글 꺼짐",
            modifier = Modifier.size(160.dp).clip(CircleShape)
                .clickable(enabled = !state.busy, role = Role.Switch, onClick = onClick),
        )
        Spacer(Modifier.height(12.dp))
        Button(enabled = !state.busy, onClick = onClick, modifier = Modifier.fillMaxWidth(0.6f)) {
            Text(if (state.on) "끄기" else "켜기")
        }
    }
}

@Composable
private fun LoginForm(busy: Boolean, onLogin: (String, String) -> Unit) {
    var origin by remember { mutableStateOf("https://") }
    var code by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("운영자에게 받은 개인 코드로 로그인해요.", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(origin, { origin = it }, label = { Text("서비스 주소") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        OutlinedTextField(code, { code = it }, label = { Text("개인 코드") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        Button(enabled = !busy && code.isNotBlank(), onClick = { onLogin(origin, code); code = "" }, modifier = Modifier.fillMaxWidth()) {
            Text("로그인")
        }
    }
}

@Composable
private fun RequestDialog(onDismiss: () -> Unit, onSend: (String, String, String, String) -> Unit) {
    var room by remember { mutableStateOf("") }
    var ssid by remember { mutableStateOf("") }
    var security by remember { mutableStateOf("wpa2-personal") }
    var password by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Wi-Fi 등록 요청") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("학교 안의 Wi-Fi만 요청해주세요. 운영자가 확인하고 승인하면 모든 학생에게 배포돼요.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(room, { room = it.take(40) }, label = { Text("실 이름") }, singleLine = true)
                OutlinedTextField(ssid, { ssid = it.take(32) }, label = { Text("Wi-Fi 이름") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("wpa2-personal" to "WPA2", "wpa3-personal" to "WPA3", "open" to "암호 없음").forEach { (value, label) ->
                        FilterChip(selected = security == value, onClick = { security = value }, label = { Text(label) })
                    }
                }
                if (security != "open") OutlinedTextField(password, { password = it.take(64) }, label = { Text("Wi-Fi 비밀번호") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation())
            }
        },
        confirmButton = {
            TextButton(enabled = room.isNotBlank() && ssid.isNotBlank() && (security == "open" || password.length >= 8),
                onClick = { onSend(room, ssid, security, if (security == "open") "" else password) }) { Text("보내기") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}
