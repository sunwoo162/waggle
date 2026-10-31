package app.waggle.android.data

import app.waggle.android.core.Failure
import app.waggle.android.core.SchoolConfig
import app.waggle.android.core.WaggleException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

@Serializable
data class TokenPair(
    val accessToken: String,
    val refreshToken: String,
    val tokenType: String,
    val accessExpiresIn: Int,
    val refreshExpiresAt: Long,
) {
    override fun toString() = "TokenPair [redacted]"
}

@Serializable
private data class Receipt(val status: String)

/** Minimal client for the restricted /api/client routes. Tokens and passwords never appear in errors or logs. */
class MemberApi(private val origin: String) {
    private val json = Json { ignoreUnknownKeys = true }

    fun login(code: String, deviceName: String): TokenPair {
        if (code.isBlank() || code.length > 128 || deviceName.isBlank() || deviceName.length > 64) throw WaggleException(Failure.InvalidInput)
        val body = """{"code":${quote(code.trim())},"platform":"android","deviceName":${quote(deviceName.trim())}}"""
        return decode { json.decodeFromString<TokenPair>(send("code-login", body, null)) }
    }

    fun refresh(refreshToken: String): TokenPair =
        decode { json.decodeFromString<TokenPair>(send("refresh", """{"refreshToken":${quote(refreshToken)}}""", null)) }

    fun logout(refreshToken: String) {
        send("logout", """{"refreshToken":${quote(refreshToken)}}""", null)
    }

    /** Permanently deletes the signed-in account (code, device sessions, collection). Expects 204. */
    fun deleteAccount(accessToken: String) {
        send("account-delete", "{}", accessToken)
    }

    fun config(accessToken: String): SchoolConfig =
        decode { json.decodeFromString<SchoolConfig>(send("config", null, accessToken, 1024 * 1024)).validate() }

    fun requestWifi(accessToken: String, room: String, ssid: String, security: String, password: String) {
        val body = """{"room":${quote(room.trim())},"ssid":${quote(ssid)},"security":${quote(security)},"password":${quote(password)}}"""
        if (decode { json.decodeFromString<Receipt>(send("wifi-requests", body, accessToken, 4096)) }.status != "received") throw WaggleException(Failure.InvalidResponse)
    }

    /** Malformed or unsafe server data becomes a typed failure instead of an unhandled exception. */
    private fun <T> decode(read: () -> T): T = try {
        read()
    } catch (error: WaggleException) {
        throw error
    } catch (_: kotlinx.serialization.SerializationException) {
        throw WaggleException(Failure.InvalidResponse)
    } catch (_: IllegalArgumentException) {
        throw WaggleException(Failure.InvalidResponse)
    } catch (_: app.waggle.android.core.InvalidSchoolConfig) {
        throw WaggleException(Failure.InvalidResponse)
    }

    private fun quote(value: String) = kotlinx.serialization.json.JsonPrimitive(value).toString()

    private fun send(path: String, body: String?, bearer: String?, maximum: Int = 65_536): String {
        val connection = try {
            URL("$origin/api/client/$path").openConnection() as HttpURLConnection
        } catch (_: IOException) {
            throw WaggleException(Failure.Offline)
        }
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            if (bearer != null) connection.setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            if (status !in 200..299) throw WaggleException(
                when (status) {
                    401, 403 -> Failure.Unauthorized
                    429 -> Failure.RateLimited
                    400 -> Failure.InvalidInput
                    409 -> Failure.Conflict
                    else -> Failure.Unavailable
                },
            )
            if (status == 204) return ""
            if (connection.contentType?.substringBefore(';')?.trim() != "application/json") throw WaggleException(Failure.InvalidResponse)
            val out = java.io.ByteArrayOutputStream()
            connection.inputStream.use { stream ->
                val buffer = ByteArray(8192)
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    if (out.size() + read > maximum) throw WaggleException(Failure.InvalidResponse)
                    out.write(buffer, 0, read)
                }
            }
            return out.toString(Charsets.UTF_8.name())
        } catch (error: WaggleException) {
            throw error
        } catch (_: IOException) {
            throw WaggleException(Failure.Offline)
        } catch (_: kotlinx.serialization.SerializationException) {
            throw WaggleException(Failure.InvalidResponse)
        } finally {
            connection.disconnect()
        }
    }
}
