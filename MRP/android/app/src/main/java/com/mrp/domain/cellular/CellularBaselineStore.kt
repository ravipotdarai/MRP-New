package com.mrp.domain.cellular

import android.content.Context

/** Rolling baseline for operator / SIM country — updated on healthy READY samples. */
class CellularBaselineStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Baseline(
        val operatorName: String,
        val simCountryIso: String,
        val updatedAtMs: Long,
    )

    fun read(): Baseline? {
        val op = prefs.getString(KEY_OPERATOR, null) ?: return null
        return Baseline(
            operatorName = op,
            simCountryIso = prefs.getString(KEY_SIM_COUNTRY, "").orEmpty(),
            updatedAtMs = prefs.getLong(KEY_UPDATED, 0L),
        )
    }

    fun updateFromSample(sample: CellularMonitor.Sample) {
        if (sample.simState != "READY") return
        if (sample.operatorName == "Unknown") return
        prefs.edit()
            .putString(KEY_OPERATOR, sample.operatorName)
            .putString(KEY_SIM_COUNTRY, sample.simCountryIso)
            .putLong(KEY_UPDATED, System.currentTimeMillis())
            .apply()
    }

    companion object {
        private const val PREFS = "mrp_cellular_baseline"
        private const val KEY_OPERATOR = "operator"
        private const val KEY_SIM_COUNTRY = "sim_country"
        private const val KEY_UPDATED = "updated_at"
    }
}
