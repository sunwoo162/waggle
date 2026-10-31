package app.waggle.android.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ServiceOriginTest {
    @Test
    fun httpsOnlyExceptLocalDevelopmentHosts() {
        assertEquals("https://waggle.example", ServiceOrigin.parse(" https://Waggle.example/ "))
        assertEquals("https://waggle.example:8443", ServiceOrigin.parse("https://waggle.example:8443"))
        assertEquals("http://10.0.2.2:3000", ServiceOrigin.parse("http://10.0.2.2:3000"))
        assertEquals("http://localhost:3000", ServiceOrigin.parse("http://localhost:3000/"))
        for (bad in listOf("http://waggle.example", "https://waggle.example/api", "https://user@waggle.example", "https://waggle.example/?x=1", "ftp://waggle.example", "https://"))
            assertThrows(WaggleException::class.java) { ServiceOrigin.parse(bad) }
    }
}
