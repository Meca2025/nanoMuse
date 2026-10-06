package io.github.nanomuse.i18n

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Every nanoMuse string in every language: each locale's `nm_strings.xml` under `res/values-…`
 * carries exactly the keys of the English file, with the same format placeholders (a locale that lacked a key would
 * silently fall back to English on the device). The plural quantities are the locale's own, so only
 * the plural names are compared. Runs from the module directory, as unit tests do.
 */
class NmStringsParityTest {
    private val res: File = listOf("src/main/res", "app/src/main/res").map(::File).first { it.isDirectory }

    private val nameRx = Regex("""<(string|plurals|string-array) name="([^"]+)"""")
    private val stringRx = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
    private val placeholderRx = Regex("""%\d\$[sd]|%[sd]""")

    private fun names(f: File): Set<String> = nameRx.findAll(f.readText()).map { it.groupValues[1] + ":" + it.groupValues[2] }.toSet()

    private fun placeholders(f: File): Map<String, List<String>> =
        stringRx.findAll(f.readText()).associate { m -> m.groupValues[1] to placeholderRx.findAll(m.groupValues[2]).map { it.value }.sorted().toList() }

    private fun localeFiles(): List<File> =
        (res.listFiles() ?: emptyArray()).filter { it.isDirectory && it.name.startsWith("values-") }
            .map { File(it, "nm_strings.xml") }.filter { it.exists() }.sortedBy { it.path }

    @Test fun `every locale carries every key of the English file`() {
        val en = names(File(res, "values/nm_strings.xml"))
        assertTrue(en.size > 800)
        val locales = localeFiles()
        assertTrue("expected the sixteen locale files, found ${locales.size}", locales.size >= 16)
        for (f in locales) {
            val keys = names(f)
            val missing = en - keys
            val extra = keys - en
            assertEquals("${f.parentFile.name} lacks ${missing.size} key(s): ${missing.sorted().take(8)}", emptySet<String>(), missing)
            assertEquals("${f.parentFile.name} has ${extra.size} key(s) English does not: ${extra.sorted().take(8)}", emptySet<String>(), extra)
        }
    }

    @Test fun `format placeholders match the English string`() {
        val en = placeholders(File(res, "values/nm_strings.xml"))
        for (f in localeFiles()) {
            val theirs = placeholders(f)
            val wrong = en.filter { (k, v) -> theirs[k] != null && theirs[k] != v }.keys
            assertEquals("${f.parentFile.name}: placeholders differ from English in ${wrong.sorted().take(8)}", emptySet<String>(), wrong)
        }
    }

    @Test fun `no exclamation marks in the strings`() {
        for (f in localeFiles() + File(res, "values/nm_strings.xml")) {
            val shouting = stringRx.findAll(f.readText()).filter { '!' in it.groupValues[2] || '！' in it.groupValues[2] }.map { it.groupValues[1] }.toList()
            assertEquals("${f.parentFile.name}: ${shouting.take(8)}", emptyList<String>(), shouting)
        }
    }
}
