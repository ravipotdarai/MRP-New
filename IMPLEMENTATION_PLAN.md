# Comprehensive Battery Optimization Implementation Plan

## Goals
1. Convert to async/event-driven architecture (95%+ battery savings)
2. Fix camera permission bug
3. Fix permission bugs with OEM detection and graceful degradation

---

## Phase 1: Location System (Flow-based)
- Add Flow-based location updates
- Change interval from 500ms to 5s
- Add caching and debouncing
- Convert all synchronous location calls to async

## Phase 2: Event-Driven Service (State Machine)
- Replace broadcast receivers with Flow-based event processing
- Add hardware event state machine
- Replace timers with WorkManager (30 min)
- Debounce hardware events (500ms)

## Phase 3: Camera (Async with Coroutines)
- Reduce timeout from 5s to 3s
- Reduce retries from 7 to 2
- Add coroutine-based delays

## Phase 4: Usage Tracking (WorkManager)
- Change from 5 min to 30 min intervals
- Add network constraints
- Make it background job-based

## Phase 5: Camera Permission Fix
- Add requestCameraPermission() method
- Add permission check and retry
- Handle permission denial gracefully
- Add "Open Settings" button

## Phase 6: Permission Bug Fixes with OEM Detection
- Detect OEM restrictions for App Usage Stats
- Detect OEM restrictions for Display Over Other Apps
- Disable features with user-friendly messages if restrictions detected
- Provide OEM-specific workarounds

---

## Expected Results
- 95%+ battery improvement
- All features work on most devices
- Graceful degradation on restricted devices
- User-friendly error messages
