package app.waggle.android.core

import java.net.URI

enum class Failure { InvalidInput, Unauthorized, RateLimited, Offline, Unavailable, InvalidResponse, Conflict, Storage }

class WaggleException(val failure: Failure) : Exception("waggle_" + failure.name)

/** Same rules as the Windows client: HTTPS only, plain HTTP only for this device's loopback or the emulator host. */
object ServiceOrigin {
    private val localHttp = Regex("^http://(localhost|127\\.0\\.0\\.1|10\\.0\\.2\\.2)(:[0-9]{1,5})?/?$", RegexOption.IGNORE_CASE)

    fun parse(value: String): String {
        val input = value.trim()
        if (input.any { it.isWhitespace() || it.isISOControl() } || input.any { it in "?#@\\" }) throw WaggleException(Failure.InvalidInput)
        val uri = runCatching { URI(input) }.getOrNull() ?: throw WaggleException(Failure.InvalidInput)
        val path = uri.rawPath.orEmpty()
        if (uri.host.isNullOrEmpty() || (path != "" && path != "/")) throw WaggleException(Failure.InvalidInput)
        val https = input.startsWith("https://", ignoreCase = true) && uri.scheme.equals("https", ignoreCase = true)
        if (!https && !localHttp.matches(input)) throw WaggleException(Failure.InvalidInput)
        val port = if (uri.port == -1) "" else ":" + uri.port
        return uri.scheme.lowercase() + "://" + uri.host.lowercase() + port
    }
}
