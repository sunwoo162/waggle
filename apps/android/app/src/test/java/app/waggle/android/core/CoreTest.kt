package app.waggle.android.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreTest {
    private val room1 = "11111111-1111-4111-8111-111111111111"
    private val room2 = "22222222-2222-4222-8222-222222222222"
    private val ap = "33333333-3333-4333-8333-333333333333"
    private val config = SchoolConfig(
        1, 3,
        listOf(
            NetworkConfig(room1, "GSM-3-1", "wpa2-personal", "synthetic-fixture-only"),
            NetworkConfig(room2, "GSM-3-2", "open", null),
        ),
        listOf(ApConfig(ap, room1, "02:00:00:00:00:01")),
    )

    @Test
    fun parsesServerJsonAndRejectsUnsafeValues() {
        val json = """{"schemaVersion":1,"version":3,"networks":[{"id":"$room1","ssid":"GSM-3-1","security":"wpa2-personal","password":"synthetic-fixture-only"}],"accessPoints":[]}"""
        assertEquals("GSM-3-1", Json.decodeFromString<SchoolConfig>(json).validate().networks.single().ssid)
        for (bad in listOf(
            config.copy(schemaVersion = 2),
            config.copy(networks = listOf(config.networks[0].copy(password = "short"))),
            config.copy(networks = listOf(config.networks[1].copy(password = "not-allowed-for-open"))),
            config.copy(networks = listOf(config.networks[0].copy(security = "wpa2-enterprise"))),
            config.copy(networks = listOf(config.networks[0].copy(ssid = "x".repeat(33)))),
            config.copy(accessPoints = listOf(ApConfig(ap, "44444444-4444-4444-8444-444444444444", "02:00:00:00:00:01"))),
            config.copy(accessPoints = listOf(ApConfig(ap, room1, "03:00:00:00:00:01"))),
        )) assertThrows(InvalidSchoolConfig::class.java) { bad.validate() }
        assertFalse(config.toString().contains("synthetic"))
    }

    @Test
    fun configCannotRollBackOrChangeWithoutANewVersion() {
        assertTrue(config.acceptsUpdate(config.copy(version = 4)))
        assertTrue(config.acceptsUpdate(config.copy()))
        assertFalse(config.acceptsUpdate(config.copy(version = 2)))
        assertFalse(config.acceptsUpdate(config.copy(networks = config.networks.take(1))))
    }

    @Test
    fun onlyUnredactedExactConnectionsMatch() {
        val connected = ObservedConnection("\"GSM-3-1\"", "02:00:00:00:00:01", WifiMatch.SECURITY_PSK)
        assertEquals(room1, WifiMatch.connectedNetwork(config, connected)?.id)
        assertEquals(ap, WifiMatch.connectedAp(config, connected)?.id)
        assertEquals(room1, WifiMatch.connectedNetwork(config, connected.copy(bssid = "02:00:00:00:00:00"))?.id)
        assertNull(WifiMatch.connectedAp(config, connected.copy(bssid = "02:00:00:00:00:00")))
        assertNull(WifiMatch.connectedNetwork(config, connected.copy(rawSsid = "<unknown ssid>")))
        assertNull(WifiMatch.connectedNetwork(config, connected.copy(securityType = WifiMatch.SECURITY_SAE)))
        assertNull(WifiMatch.connectedNetwork(config, connected.copy(securityType = 3)))
        assertEquals(room2, WifiMatch.connectedNetwork(config, ObservedConnection("\"GSM-3-2\"", null, WifiMatch.SECURITY_OPEN))?.id)
        val duplicate = config.copy(networks = config.networks + NetworkConfig("55555555-5555-4555-8555-555555555555", "GSM-3-1", "wpa2-personal", "synthetic-other-room"))
        assertNull(WifiMatch.connectedNetwork(duplicate, connected))
    }

    @Test
    fun suggestionsCoverEveryRoomAndTurningOffRemovesOnlyOurs() {
        val desired = SuggestionPlan.desired(config)
        assertEquals(listOf("GSM-3-1" to "wpa2-personal", "GSM-3-2" to "open"), desired.map { it.key })
        val old = listOf(SuggestionSpec("GSM-OLD", "open", null), SuggestionSpec("GSM-3-1", "wpa2-personal", "previous-password"))
        val changes = SuggestionPlan.changes(old, desired)
        assertEquals(desired, changes.add)
        assertEquals(listOf("GSM-OLD" to "open"), changes.remove.map { it.key })
        assertEquals(old, SuggestionPlan.turnOff(old).remove)
        assertFalse(desired.toString().contains("synthetic"))
    }
}
