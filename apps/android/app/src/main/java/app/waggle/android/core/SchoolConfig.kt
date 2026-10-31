package app.waggle.android.core

import kotlinx.serialization.Serializable

/** Thrown when server data does not match the expected shape; never carries secrets in its message. */
class InvalidSchoolConfig : Exception("waggle_invalid_config")

@Serializable
data class NetworkConfig(val id: String, val ssid: String, val security: String, val password: String?) {
    override fun toString() = "NetworkConfig [redacted]"
}

@Serializable
data class ApConfig(val id: String, val networkId: String, val bssid: String)

/** School configuration delivered to signed-in apps. Mirrors the Windows client's validation rules. */
@Serializable
data class SchoolConfig(
    val schemaVersion: Int,
    val version: Long,
    val networks: List<NetworkConfig>,
    val accessPoints: List<ApConfig>,
) {
    override fun toString() = "SchoolConfig [redacted]"

    fun validate(): SchoolConfig {
        fun invalid(): Nothing = throw InvalidSchoolConfig()
        if (schemaVersion != 1 || version < 0 || version > 9_007_199_254_740_991 || networks.size > 500 || accessPoints.size > 5000) invalid()
        val ids = HashSet<String>()
        for (n in networks) {
            if (!Rules.isId(n.id) || !ids.add(n.id) || n.ssid.isEmpty() || n.ssid.any { it.isISOControl() }) invalid()
            if (n.ssid.toByteArray(Charsets.UTF_8).size > 32) invalid()
            when (n.security) {
                "open" -> if (n.password != null) invalid()
                "wpa2-personal", "wpa3-personal" -> {
                    val p = n.password ?: invalid()
                    val passphrase = p.length in 8..63 && p.all { it.code in 0x20..0x7e }
                    val hexKey = n.security == "wpa2-personal" && Rules.HEX64.matches(p)
                    if (!passphrase && !hexKey) invalid()
                }
                else -> invalid()
            }
        }
        val apIds = HashSet<String>()
        val bssids = HashSet<String>()
        for (a in accessPoints) {
            if (!Rules.isId(a.id) || !apIds.add(a.id) || a.networkId !in ids || !Rules.BSSID.matches(a.bssid) || !bssids.add(a.bssid)) invalid()
            if (a.bssid == "00:00:00:00:00:00" || a.bssid.substring(0, 2).toInt(16) and 1 != 0) invalid()
        }
        return this
    }

    /** Same version must mean same content: a server can never roll the app back or swap content silently. */
    fun acceptsUpdate(next: SchoolConfig): Boolean =
        next.version > version || (next.version == version && next.sameContent(this))

    private fun sameContent(other: SchoolConfig) =
        networks.sortedBy { it.id } == other.networks.sortedBy { it.id } &&
            accessPoints.sortedBy { it.id } == other.accessPoints.sortedBy { it.id }

    private object Rules {
        val HEX64 = Regex("^[0-9a-fA-F]{64}$")
        val BSSID = Regex("^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$")
        val UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
        fun isId(value: String) = UUID.matches(value)
    }
}
