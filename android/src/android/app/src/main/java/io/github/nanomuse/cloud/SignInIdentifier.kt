package io.github.nanomuse.cloud

/**
 * What the person typed into the sign-in box, before the relay sees it. Text-message codes
 * go to mainland-China numbers only (`phone_region` at the relay): a number from anywhere
 * else is told so on the screen, before a code is asked for, and pointed to e-mail.
 */
object SignInIdentifier {
    /** Digits, with the usual spaces, dashes and dots people type between them. */
    private val separators = Regex("[\\s\\-.()]")

    /** A phone number rather than an address: it opens with a digit or a plus and has no letters. */
    fun looksLikePhone(input: String): Boolean {
        val t = input.trim()
        if (t.isEmpty()) return false
        if (!(t[0].isDigit() || t[0] == '+')) return false
        return t.none { it.isLetter() || it == '@' }
    }

    /** A mainland-China mobile number: eleven digits starting with 1, with or without +86 / 0086 in front. */
    fun isMainlandPhone(input: String): Boolean {
        var digits = separators.replace(input.trim(), "")
        if (digits.startsWith("+")) {
            digits = digits.substring(1)
            if (!digits.startsWith("86")) return false
            digits = digits.substring(2)
        } else if (digits.startsWith("0086")) {
            digits = digits.substring(4)
        } else if (digits.startsWith("86") && digits.length == 13) {
            digits = digits.substring(2)
        }
        return digits.length == 11 && digits[0] == '1' && digits.all { it.isDigit() }
    }

    /** A number the relay cannot text: say so before asking for a code. Still typing (fewer than 7 digits) is not a verdict yet. */
    fun phoneOutsideMainland(input: String): Boolean {
        if (!looksLikePhone(input)) return false
        val digits = input.count { it.isDigit() }
        if (digits < 7) return false
        return !isMainlandPhone(input)
    }
}
