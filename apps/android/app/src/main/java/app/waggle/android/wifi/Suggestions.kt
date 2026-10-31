package app.waggle.android.wifi

import android.content.Context
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import app.waggle.android.core.SuggestionSpec

/**
 * Registers school rooms with the OS as Wi-Fi suggestions. The OS decides when and where to connect;
 * a successful registration is never shown as a connection.
 */
class Suggestions(context: Context) {
    private val wifi = context.applicationContext.getSystemService(WifiManager::class.java)

    data class Result(val registered: Int, val skipped: Int, val status: Int) {
        val ok get() = status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
    }

    /** [replace]: rooms whose security type changed, whose old suggestion must go before the new one is added. */
    fun apply(desired: List<SuggestionSpec>, replace: Set<String> = emptySet()): Result {
        val built = desired.mapNotNull { spec -> runCatching { build(spec) }.getOrNull() }
        val wanted = desired.associate { it.ssid to (it.security != "open") }
        // Remove ours that are no longer in the school config or changed security; re-adding the rest updates passwords in place.
        val stale = wifi.networkSuggestions.filter { ssidOf(it) in replace || wanted[ssidOf(it)] != (it.passphrase != null) }
        if (stale.isNotEmpty()) wifi.removeNetworkSuggestions(stale)
        val status = if (built.isEmpty()) WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS else wifi.addNetworkSuggestions(built)
        val ok = status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
        return Result(if (ok) built.size else 0, desired.size - built.size, status)
    }

    /** Removes everything this app suggested; on Android 13+ the current connection lingers briefly instead of dropping at once. */
    fun removeAll() {
        val ours = wifi.networkSuggestions
        if (ours.isEmpty()) return
        if (Build.VERSION.SDK_INT >= 33) wifi.removeNetworkSuggestions(ours, WifiManager.ACTION_REMOVE_SUGGESTION_LINGER)
        else wifi.removeNetworkSuggestions(ours)
    }

    fun registeredCount(): Int = wifi.networkSuggestions.size

    private fun build(spec: SuggestionSpec): WifiNetworkSuggestion {
        // The suggestion API takes an 8-63 character passphrase only; a 64-hex raw key would fail the whole batch.
        require(spec.password == null || spec.password.length in 8..63)
        val builder = WifiNetworkSuggestion.Builder().setSsid(spec.ssid).setIsAppInteractionRequired(false)
            // Students should not read room passwords from the system Wi-Fi list.
            .setCredentialSharedWithUser(false)
        when (spec.security) {
            "wpa2-personal" -> builder.setWpa2Passphrase(requireNotNull(spec.password))
            "wpa3-personal" -> builder.setWpa3Passphrase(requireNotNull(spec.password))
        }
        return builder.build()
    }

    private fun ssidOf(s: WifiNetworkSuggestion) = s.ssid.orEmpty().removeSurrounding("\"")
}
