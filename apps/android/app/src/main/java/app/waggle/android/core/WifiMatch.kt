package app.waggle.android.core

/**
 * What the OS reported about the current Wi-Fi connection, already read from WifiInfo.
 * Android hides SSID/BSSID without precise location; those redacted values are never matched.
 */
data class ObservedConnection(val rawSsid: String?, val bssid: String?, val securityType: Int)

object WifiMatch {
    /** WifiInfo.getCurrentSecurityType() values (API 31). */
    const val SECURITY_OPEN = 0
    const val SECURITY_PSK = 2
    const val SECURITY_SAE = 4
    private const val UNKNOWN_SSID = "<unknown ssid>"
    private const val REDACTED_BSSID = "02:00:00:00:00:00"

    fun security(type: Int): String? = when (type) {
        SECURITY_OPEN -> "open"
        SECURITY_PSK -> "wpa2-personal"
        SECURITY_SAE -> "wpa3-personal"
        else -> null
    }

    /** WifiInfo.getSSID() wraps UTF-8 names in quotes; hex names and the unknown marker are not usable. */
    fun ssid(raw: String?): String? {
        if (raw == null || raw == UNKNOWN_SSID || raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return null
        return raw.substring(1, raw.length - 1).takeIf { it.isNotEmpty() }
    }

    fun bssid(raw: String?): String? {
        val value = raw?.lowercase() ?: return null
        return value.takeIf { it != REDACTED_BSSID && Regex("^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$").matches(it) }
    }

    /** The school network (room) the device is on, by SSID + security. Ambiguous duplicates match nothing. */
    fun connectedNetwork(config: SchoolConfig, connection: ObservedConnection?): NetworkConfig? {
        connection ?: return null
        val ssid = ssid(connection.rawSsid) ?: return null
        val security = security(connection.securityType) ?: return null
        return config.networks.filter { it.ssid == ssid && it.security == security }.singleOrNull()
    }

    /**
     * The registered AP (character) for an actual OS-confirmed connection: the SSID and security must be a registered
     * room network and the BSSID one of the AP's. One physical AP may broadcast a different SSID per band.
     */
    fun connectedAp(config: SchoolConfig, connection: ObservedConnection?): ApConfig? {
        connectedNetwork(config, connection) ?: return null
        val bssid = bssid(connection?.bssid) ?: return null
        return config.accessPoints.firstOrNull { ap -> bssid in ap.allBssids && config.networks.any { it.id == ap.networkId } }
    }
}
