package com.mrp.auth

/** BIP39-style word subset for 12-word recovery codes (index 0..255). */
object RecoveryWords {
    val WORDS: List<String> = listOf(
        "alpha", "bravo", "coral", "delta", "ember", "flint", "grove", "haven",
        "ivory", "jade", "kite", "lunar", "maple", "noble", "ocean", "prism",
        "quartz", "river", "stone", "terra", "ultra", "vivid", "wheat", "xenon",
        "yacht", "zenith", "anchor", "beacon", "cipher", "dawn", "eagle", "frost",
        "glide", "harbor", "inlet", "jewel", "knoll", "ledger", "meadow", "north",
        "orbit", "pearl", "quest", "ridge", "spark", "trail", "union", "valor",
        "watch", "yield", "amber", "blaze", "cloud", "drift", "echo", "flame",
        "grain", "haste", "index", "jolly", "karma", "light", "mirth", "nexus",
        "olive", "pulse", "quiet", "robin", "shade", "tidal", "urban", "vista",
        "waltz", "xylem", "young", "zesty", "arbor", "brook", "cabin", "dunes",
        "elder", "fjord", "giant", "honey", "ideal", "jumbo", "kneel", "latch",
        "mango", "nylon", "opine", "plume", "quill", "rebel", "solar", "tiger",
        "umbra", "vigor", "whale", "xray", "yodel", "zonal", "acorn", "bison",
        "crisp", "daisy", "ember", "fable", "gloss", "hover", "inbox", "joust",
        "kayak", "lemon", "motel", "nudge", "oxide", "piano", "quark", "raven",
        "sable", "tulip", "unify", "vocal", "woven", "xenial", "yearn", "zinc",
        "aloft", "brisk", "chord", "drape", "equip", "fancy", "gleam", "hound",
        "igloo", "jazzy", "koala", "lumen", "mocha", "needy", "ozone", "plaid",
        "quilt", "rusty", "swirl", "thorn", "unite", "vapor", "wispy", "xeric",
        "yucca", "zippy", "adobe", "blunt", "candy", "dodge", "evoke", "fizzy",
        "giddy", "hiker", "incur", "joker", "kiosk", "loyal", "mimic", "nifty",
        "otter", "pivot", "quasi", "relic", "swoop", "tweak", "udder", "vixen",
        "woken", "xylem", "yacht", "zonal", "agile", "bliss", "chalk", "dwarf",
        "ethos", "flock", "gravy", "hippo", "inert", "juror", "knead", "lilac",
        "mossy", "nymph", "ovary", "plush", "quell", "roast", "spicy", "tango",
        "ulcer", "vogue", "widen", "xenon", "yogis", "zonal", "aisle", "blurb",
        "crane", "dizzy", "eject", "flair", "gnome", "hoist", "inlay", "juror",
        "kudos", "lyric", "mural", "nadir", "ovoid", "plank", "quoth", "rodeo",
        "stark", "taffy", "udder", "vowel", "whelp", "xerox", "yucca", "zonal",
    )

    fun generatePhrase(wordCount: Int = 12): String {
        val secure = java.security.SecureRandom()
        val bytes = ByteArray(wordCount)
        secure.nextBytes(bytes)
        return bytes.map { b -> WORDS[(b.toInt() and 0xFF) % WORDS.size] }.joinToString(" ")
    }

    fun normalizePhrase(phrase: String): String =
        phrase.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
}
