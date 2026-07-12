package com.mrp.domain.model

import java.util.Date

data class Intruder(
    val id: String,
    val name: String? = null,
    val photoPaths: MutableList<String> = mutableListOf(),
    val eventIds: MutableList<String> = mutableListOf(),
    val firstSeen: Date,
    val lastSeen: Date,
    val threatLevel: Int = 0 // 0-100
)