package app.waggle.android

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import app.waggle.android.core.Failure
import app.waggle.android.core.SchoolConfig
import app.waggle.android.core.ServiceOrigin
import app.waggle.android.core.SuggestionPlan
import app.waggle.android.core.WaggleException
import app.waggle.android.data.MemberApi
import app.waggle.android.data.SecureStore
import app.waggle.android.data.TokenPair
import app.waggle.android.wifi.Suggestions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

data class WaggleState(
    val signedIn: Boolean = false,
    val origin: String? = null,
    val on: Boolean = false,
    val rooms: Int = 0,
    val lastSync: Long? = null,
    /** The OS has approved this app's Wi-Fi suggestions (the first approval needs the app on screen). */
    val approved: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
)

/**
 * App-wide state for the one toggle. Turning on registers every room with the OS and nothing keeps running;
 * the OS connects by itself afterwards. Network and Keystore work runs off the main thread, one action at a time.
 */
class WaggleController private constructor(private val context: Context) {
    private val store = SecureStore(context)
    private val prefs = context.getSharedPreferences("waggle.state", Context.MODE_PRIVATE)
    private val suggestions = Suggestions(context)
    private val json = Json { ignoreUnknownKeys = true }
    private val lock = Mutex()
    private val mutable = MutableStateFlow(load())
    val state: StateFlow<WaggleState> = mutable

    /** Plain preferences only: safe to call on the main thread (no Keystore decryption). */
    private fun load() = WaggleState(
        signedIn = store.has(SESSION),
        origin = prefs.getString(ORIGIN, null),
        on = prefs.getBoolean(ON, false),
        rooms = prefs.getInt(ROOMS, 0),
        lastSync = prefs.getLong(SYNCED, 0).takeIf { it > 0 },
        approved = prefs.getBoolean(APPROVED, false),
    )

    private fun config(): SchoolConfig? = store.get(CONFIG)?.let { runCatching { json.decodeFromString<SchoolConfig>(it).validate() }.getOrNull() }
    private fun session(): TokenPair? = store.get(SESSION)?.let { runCatching { json.decodeFromString<TokenPair>(it) }.getOrNull() }

    suspend fun login(origin: String, code: String) = run("계정과 학교 설정을 확인했어요. 켜기를 누르면 자동 연결이 시작돼요.") {
        val parsed = ServiceOrigin.parse(origin)
        val pair = MemberApi(parsed).login(code, Build.MODEL.take(64).ifBlank { "Android" })
        prefs.edit().putString(ORIGIN, parsed).apply()
        store.put(SESSION, json.encodeToString(TokenPair.serializer(), pair))
        syncCore()
    }

    suspend fun sync() = run("학교 Wi-Fi 목록을 갱신했어요.") { syncCore() }

    /** Decides and acts inside one lock hold so quick double taps never run the same action twice. */
    suspend fun toggle() = runFor { if (prefs.getBoolean(ON, false)) { turnOffCore(); OFF_DONE } else { turnOnCore(); ON_DONE } }

    suspend fun turnOn() = run(ON_DONE) { turnOnCore() }

    private fun turnOnCore() {
        if (session() == null) throw WaggleException(Failure.Unauthorized)
        try {
            syncCore(applyIfOn = false)
        } catch (error: WaggleException) {
            // Offline at the moment: turning on still works with the last verified school config.
            if (error.failure !in setOf(Failure.Offline, Failure.Unavailable)) throw error
        }
        val config = config() ?: throw WaggleException(Failure.Unavailable)
        // Only record "on" once the OS actually accepted the registration.
        reconcile(config)
        prefs.edit().putBoolean(ON, true).apply()
        SyncWorker.schedule(context)
    }

    suspend fun turnOff() = run(OFF_DONE) { turnOffCore() }

    private fun turnOffCore() {
        prefs.edit().putBoolean(ON, false).apply()
        suggestions.removeAll()
        prefs.edit().remove(REGISTERED).apply()
        SyncWorker.cancel(context)
    }

    suspend fun logout() = run("로그아웃했어요.") {
        prefs.edit().putBoolean(ON, false).apply()
        // Local cleanup must finish even if the OS refuses the removal or the server is unreachable.
        runCatching { suggestions.removeAll() }
        SyncWorker.cancel(context)
        val origin = prefs.getString(ORIGIN, null)
        session()?.let { pair -> origin?.let { runCatching { MemberApi(it).logout(pair.refreshToken) } } }
        store.clear()
        prefs.edit().apply { listOf(ORIGIN, ON, SYNCED, ROOMS, SKIPPED, APPROVED, REGISTERED).forEach { remove(it) } }.apply()
    }

    suspend fun requestWifi(room: String, ssid: String, security: String, password: String) =
        run("등록 요청을 보냈어요. 운영자가 확인하면 자동으로 연결돼요.") {
            authorized { api, token -> api.requestWifi(token, room, ssid, security, password) }
        }

    fun markApproved(approved: Boolean) {
        prefs.edit().putBoolean(APPROVED, approved).apply()
        mutable.value = mutable.value.copy(approved = approved)
        WaggleWidget.refresh(context)
        WaggleTileService.refresh(context)
    }

    /** Replaces the stored config with a newer verified one, then (while on) makes the OS match it. */
    private fun syncCore(applyIfOn: Boolean = true) {
        val next = authorized { api, token -> api.config(token) }
        val current = config()
        if (current != null && !current.acceptsUpdate(next)) throw WaggleException(Failure.InvalidResponse)
        store.put(CONFIG, json.encodeToString(SchoolConfig.serializer(), next))
        prefs.edit().putLong(SYNCED, System.currentTimeMillis()).putInt(ROOMS, next.networks.size).apply()
        if (applyIfOn && prefs.getBoolean(ON, false)) reconcile(next)
    }

    /**
     * Every sync while on re-registers the full set: re-adding updates passwords in place, and suggestions the OS
     * dropped (e.g. after a network settings reset) come back. Rooms whose security type changed are replaced.
     */
    private fun reconcile(config: SchoolConfig) {
        val desired = SuggestionPlan.desired(config)
        val registered = prefs.getStringSet(REGISTERED, emptySet()).orEmpty()
            .mapNotNull { entry -> entry.split(SEPARATOR).takeIf { it.size == 2 }?.let { it[0] to it[1] } }.toMap()
        val changedSecurity = desired.filter { registered[it.ssid]?.let { old -> old != it.security } == true }.map { it.ssid }.toSet()
        val result = suggestions.apply(desired, replace = changedSecurity)
        if (result.status == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_APP_DISALLOWED) markApproved(false)
        if (!result.ok) throw WaggleException(Failure.Storage)
        prefs.edit().putInt(SKIPPED, result.skipped)
            .putStringSet(REGISTERED, desired.map { it.ssid + SEPARATOR + it.security }.toSet()).apply()
    }

    /** Access tokens live 15 minutes: refresh once on 401, rotating the stored refresh token. */
    private fun <T> authorized(call: (MemberApi, String) -> T): T {
        val origin = prefs.getString(ORIGIN, null) ?: throw WaggleException(Failure.Unauthorized)
        val api = MemberApi(origin)
        val pair = session() ?: throw WaggleException(Failure.Unauthorized)
        return try {
            call(api, pair.accessToken)
        } catch (error: WaggleException) {
            if (error.failure != Failure.Unauthorized) throw error
            val fresh = try {
                api.refresh(pair.refreshToken)
            } catch (refresh: WaggleException) {
                if (refresh.failure == Failure.Unauthorized) store.put(SESSION, null)
                throw refresh
            }
            store.put(SESSION, json.encodeToString(TokenPair.serializer(), fresh))
            call(api, fresh.accessToken)
        }
    }

    private suspend fun run(done: String, action: suspend () -> Unit) = runFor { action(); done }

    private suspend fun runFor(action: suspend () -> String) = lock.withLock {
        mutable.value = mutable.value.copy(busy = true, message = null)
        val message = withContext(Dispatchers.IO) {
            try {
                val done = action()
                val skipped = prefs.getInt(SKIPPED, 0)
                if (skipped > 0 && prefs.getBoolean(ON, false)) "$done (Android에서 지원하지 않는 키 형식의 Wi-Fi ${skipped}곳은 등록하지 못했어요.)" else done
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (error: WaggleException) {
                messageFor(error.failure)
            } catch (_: SecurityException) {
                "Wi-Fi 변경 권한이 꺼져 있어요. 설정 → 앱 → 특별한 앱 접근 → Wi-Fi 제어에서 와글을 허용해주세요."
            } catch (_: Exception) {
                "처리하지 못했어요. 잠시 후 다시 시도해주세요."
            }
        }
        mutable.value = load().copy(message = message)
        WaggleWidget.refresh(context)
        WaggleTileService.refresh(context)
    }

    private fun messageFor(failure: Failure) = when (failure) {
        Failure.InvalidInput -> "입력한 내용을 확인해주세요."
        Failure.Unauthorized -> "계정을 다시 확인해야 해요. 다시 로그인해주세요."
        Failure.RateLimited -> "요청이 많아요. 잠시 후 다시 시도해주세요."
        Failure.Offline -> "서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요."
        Failure.Conflict -> "이미 와글에 등록된 Wi-Fi예요."
        Failure.Storage -> "학교 Wi-Fi를 휴대폰에 등록하지 못했어요. Wi-Fi 등록 허용을 확인해주세요."
        Failure.InvalidResponse, Failure.Unavailable -> "서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해주세요."
    }

    companion object {
        private const val SESSION = "session"
        private const val CONFIG = "config"
        private const val ORIGIN = "origin"
        private const val ON = "on"
        private const val SYNCED = "synced"
        private const val ROOMS = "rooms"
        private const val SKIPPED = "skipped"
        private const val APPROVED = "approved"
        private const val REGISTERED = "registered"
        private const val SEPARATOR = "\u0000"
        private const val ON_DONE = "켜졌어요. 학교 Wi-Fi에 비밀번호 없이 자동으로 연결돼요."
        private const val OFF_DONE = "꺼졌어요. 와글이 등록한 학교 Wi-Fi를 지웠어요."

        @Volatile private var instance: WaggleController? = null
        fun get(context: Context): WaggleController =
            instance ?: synchronized(this) { instance ?: WaggleController(context.applicationContext).also { instance = it } }
    }
}
