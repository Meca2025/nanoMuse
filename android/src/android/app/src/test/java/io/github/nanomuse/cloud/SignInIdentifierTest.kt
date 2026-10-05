package io.github.nanomuse.cloud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Text-message codes reach mainland-China numbers only: the screen says so before asking. */
class SignInIdentifierTest {

    @Test fun `what reads as a phone number`() {
        assertTrue(SignInIdentifier.looksLikePhone("13800000000"))
        assertTrue(SignInIdentifier.looksLikePhone("+86 138 0000 0000"))
        assertTrue(SignInIdentifier.looksLikePhone("+1 (415) 555-0100"))
        assertFalse(SignInIdentifier.looksLikePhone("someone@example.org"))
        assertFalse(SignInIdentifier.looksLikePhone("bob"))
        assertFalse(SignInIdentifier.looksLikePhone(""))
    }

    @Test fun `mainland numbers, with or without the country code`() {
        assertTrue(SignInIdentifier.isMainlandPhone("13800000000"))
        assertTrue(SignInIdentifier.isMainlandPhone("+8613800000000"))
        assertTrue(SignInIdentifier.isMainlandPhone("+86 138-0000-0000"))
        assertTrue(SignInIdentifier.isMainlandPhone("008613800000000"))
        assertTrue(SignInIdentifier.isMainlandPhone("8613800000000"))
        assertFalse(SignInIdentifier.isMainlandPhone("+14155550100"))
        assertFalse(SignInIdentifier.isMainlandPhone("+44 20 7946 0958"))
        assertFalse(SignInIdentifier.isMainlandPhone("+852 9123 4567"))
        assertFalse(SignInIdentifier.isMainlandPhone("+886 912 345 678"))
        assertFalse(SignInIdentifier.isMainlandPhone("23800000000")) // eleven digits, not a mobile prefix
        assertFalse(SignInIdentifier.isMainlandPhone("1380000000")) // ten digits
    }

    @Test fun `the warning shows for a number from elsewhere, not while typing, never for e-mail`() {
        assertTrue(SignInIdentifier.phoneOutsideMainland("+14155550100"))
        assertTrue(SignInIdentifier.phoneOutsideMainland("+852 9123 4567"))
        assertTrue(SignInIdentifier.phoneOutsideMainland("0044 20 7946 0958"))
        assertFalse(SignInIdentifier.phoneOutsideMainland("13800000000"))
        assertFalse(SignInIdentifier.phoneOutsideMainland("+86 138 0000 0000"))
        assertFalse(SignInIdentifier.phoneOutsideMainland("+1 415")) // still typing
        assertFalse(SignInIdentifier.phoneOutsideMainland("138"))
        assertFalse(SignInIdentifier.phoneOutsideMainland("someone@example.org"))
        assertFalse(SignInIdentifier.phoneOutsideMainland(""))
    }
}
