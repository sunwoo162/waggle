package app.waggle.android.core

/**
 * One Wi-Fi suggestion as Android identifies it: SSID + security type. No BSSID, so the OS can roam
 * across every AP of the room. Equality ignores the password so a changed password is an update, not a new entry.
 */
data class SuggestionSpec(val ssid: String, val security: String, val password: String?) {
    val key: Pair<String, String> get() = ssid to security
    override fun toString() = "SuggestionSpec [redacted]"
}

data class SuggestionChanges(val add: List<SuggestionSpec>, val remove: List<SuggestionSpec>)

object SuggestionPlan {
    /** Every active network of the school config becomes one suggestion. */
    fun desired(config: SchoolConfig): List<SuggestionSpec> =
        config.networks.map { SuggestionSpec(it.ssid, it.security, it.password) }.distinctBy { it.key }

    /**
     * Turning on, or a new config version: (re)add every desired suggestion (re-adding updates a changed
     * password in place) and remove the ones this app added before that are no longer in the config.
     */
    fun changes(current: List<SuggestionSpec>, desired: List<SuggestionSpec>): SuggestionChanges {
        val wanted = desired.map { it.key }.toSet()
        return SuggestionChanges(add = desired, remove = current.filter { it.key !in wanted })
    }

    /** Turning off or signing out removes everything this app added. */
    fun turnOff(current: List<SuggestionSpec>): SuggestionChanges = SuggestionChanges(emptyList(), current)
}
