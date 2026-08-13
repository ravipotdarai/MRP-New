package com.mrp.domain.cellular

/**
 * Debounced cellular anomaly scoring with conservative thresholds.
 */
object CellularAnomalyScorer {

    data class AnomalyResult(
        val score: Int,
        val status: String,
        val detail: String,
        val reasons: List<String>,
        val shouldAlert: Boolean,
    )

    fun score(
        sample: CellularMonitor.Sample,
        baseline: CellularBaselineStore.Baseline?,
        locationNetworkCountry: String? = null,
    ): AnomalyResult {
        val reasons = mutableListOf<String>()
        var score = 0

        if (sample.simState != "READY") {
            score += 35
            reasons += "SIM not ready"
        }
        if (sample.roaming) {
            score += 20
            reasons += "Device is roaming"
        }
        if (sample.networkType == "UNKNOWN" || sample.networkType == "NONE") {
            score += 15
            reasons += "Network type unavailable"
        }
        if (sample.operatorName == "Unknown") {
            score += 10
            reasons += "Operator name unavailable"
        }

        // Network vs SIM country mismatch (weak signal for unusual cellular behavior)
        if (sample.networkCountryIso.isNotBlank() && sample.simCountryIso.isNotBlank() &&
            !sample.networkCountryIso.equals(sample.simCountryIso, ignoreCase = true) &&
            !sample.roaming
        ) {
            score += 20
            reasons += "Network country differs from SIM country while not marked roaming"
        }

        locationNetworkCountry?.takeIf { it.isNotBlank() }?.let { locCc ->
            if (sample.networkCountryIso.isNotBlank() &&
                !sample.networkCountryIso.equals(locCc, ignoreCase = true)
            ) {
                score += 15
                reasons += "Carrier network country differs from recent location country"
            }
        }

        baseline?.let { b ->
            if (b.operatorName.isNotBlank() && sample.operatorName != "Unknown" &&
                !sample.operatorName.equals(b.operatorName, ignoreCase = true)
            ) {
                score += 25
                reasons += "Operator differs from usual baseline"
            }
            if (b.simCountryIso.isNotBlank() && sample.simCountryIso.isNotBlank() &&
                sample.simCountryIso != b.simCountryIso
            ) {
                score += 30
                reasons += "SIM country differs from baseline"
            }
        }

        val capped = score.coerceIn(0, 100)
        val status = if (capped >= 40) "attention" else "ok"
        val detail = if (reasons.isEmpty()) {
            "No immediate anomaly indicators"
        } else {
            reasons.joinToString(" · ")
        }
        return AnomalyResult(
            score = capped,
            status = status,
            detail = detail,
            reasons = reasons,
            shouldAlert = capped >= 40,
        )
    }
}
