package com.mrp.domain.repository

import com.mrp.domain.model.Intruder
import com.mrp.domain.model.MonitoringEvent
import com.mrp.domain.model.MonitoringSettings

interface EventRepository {
    suspend fun saveEvent(event: MonitoringEvent)
    suspend fun getEvents(): List<MonitoringEvent>
    suspend fun getEventsByType(type: String): List<MonitoringEvent>
    suspend fun getEventsByDateRange(start: Long, end: Long): List<MonitoringEvent>
    suspend fun deleteEvent(eventId: String)
    suspend fun clearAllEvents()
}

interface IntruderRepository {
    suspend fun saveIntruder(intruder: Intruder)
    suspend fun getIntruders(): List<Intruder>
    suspend fun getIntruderById(id: String): Intruder?
    suspend fun linkEventToIntruder(eventId: String, intruderId: String)
    suspend fun deleteIntruder(intruderId: String)
}

interface PhotoRepository {
    suspend fun savePhoto(path: String, eventId: String): String
    suspend fun getPhotos(): List<Photo>
    suspend fun deletePhoto(photoId: String)
    suspend fun getPhotoByPath(path: String): Photo?
}

interface SettingsRepository {
    suspend fun getSettings(): MonitoringSettings
    suspend fun saveSettings(settings: MonitoringSettings)
    suspend fun updateSetting(key: String, value: Boolean)
}

data class Photo(
    val id: String,
    val path: String,
    val eventId: String?,
    val timestamp: Long,
    val intruderId: String? = null
)