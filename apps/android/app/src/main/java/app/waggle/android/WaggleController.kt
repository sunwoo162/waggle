package app.waggle.android

import android.content.Context
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
    /** The OS has approved this app's Wi-Fi suggestions at least once (first approval needs the app on screen). */
    val approved: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
)

/**
 * App-wide state for the one toggle. Turning on registers every room with the OS and nothing keeps running;
 * the OS connects by itself afterwards. All network and Keystore work runs off the main thread, one at a time.
 */
class WaggleController private constructor(private val context: Context) {
    private val store = SecureStore(context)
    private val prefs = context.getSharedPreferences("waggle.state", Context.MODE_PRIVATE)
    private val suggestions = Suggestions(context)
    private val json = Json { ignoreUnknownKeys = true }
    private val lock = Mutex()
    private val mutable = MutableStateFlow(load())
    val state: StateFlow<WaggleState> = mutable

    private fun load() = WaggleState(
        signedIn = store.get(SESSION) != null,
        origin = prefs.getString(ORIGIN, null),
        on = prefs.getBoolean(ON, false),
        rooms = config()?.networks?.size ?: 0,
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

    suspend fun turnOn() = run("켜졌어요. 학교 Wi-Fi에 비밀번호 없이 자동으로 연결돼요.") {
        if (session() == null) throw WaggleException(Failure.Unauthorized)
        runCatching { syncCore(apply = false) }
        val config = config() ?: throw WaggleException(Failure.Unavailable)
        val result = suggestions.apply(SuggestionPlan.desired(config))
        if (!result.ok) throw WaggleException(Failure.Storage)
        prefs.edit().putBoolean(ON, true).apply()
        SyncWorker.schedule(context)
    }

    suspend fun turnOff() = run("꺼졌어요. 와글이 등록한 학교 Wi-Fi를 지웠어요.") {
        suggestions.removeAll()
        prefs.edit().putBoolean(ON, false).apply()
        SyncWorker.cancel(context)
    }

    suspend fun logout() = run("로그아웃했어요.") {
        suggestions.removeAll()
        SyncWorker.cancel(context)
        val origin = prefs.getString(ORIGIN, null)
        session()?.let { pair -> origin?.let { runCatching { MemberApi(it).logout(pair.refreshToken) } } }
        store.clear()
        prefs.edit().remove(ON).remove(SYNCED).remove(APPROVED).apply()
    }

    suspend fun requestWifi(room: String, ssid: String, security: String, password: String) =
        run("등록 요청을 보냈어요. 운영자가 확인하면 자동으로 연결돼요.") {
            authorized { api, token -> api.requestWifi(token, room, ssid, security, password) }
        }

    fun markApproved(approved: Boolean) {
        prefs.edit().putBoolean(APPROVED, approved).apply()
        mutable.value = mutable.value.copy(approved = approved)
    }

    /** New config versions replace the stored one (never older or silently changed), and update suggestions while on. */
    private suspend fun syncCore(apply: Boolean = true) {
        val next = authorized { api, token -> api.config(token) }
        val current = config()
        if (current != null && !current.acceptsUpdate(next)) throw WaggleException(Failure.InvalidResponse)
        store.put(CONFIG, json.encodeToString(SchoolConfig.serializer(), next))
        prefs.edit().putLong(SYNCED, System.currentTimeMillis()).apply()
        if (apply && prefs.getBoolean(ON, false) && (current == null || next.version != current.version))
            suggestions.apply(SuggestionPlan.desired(next))
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

    private suspend fun run(done: String, action: suspend () -> Unit) = lock.withLock {
        mutable.value = mutable.value.copy(busy = true, message = null)
        val message = try {
            withContext(Dispatchers.IO) { action() }
            done
        } catch (error: WaggleException) {
            messageFor(error.failure)
        } catch (_: SecurityException) {
            "Wi-Fi 변경 권한이 꺼져 있어요. 설정 → 앱 → 특별한 앱 접근 → Wi-Fi 제어에서 와글을 허용해주세요."
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
        private const val APPROVED = "approved"

        @Volatile private var instance: WaggleController? = null
        fun get(context: Context): WaggleController =
            instance ?: synchronized(this) { instance ?: WaggleController(context.applicationContext).also { instance = it } }
    }
}
