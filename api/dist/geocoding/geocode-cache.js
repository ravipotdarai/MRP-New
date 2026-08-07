"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodeCache = void 0;
class GeocodeCache {
    constructor(ttlMs = 10 * 60 * 1000) {
        this.ttlMs = ttlMs;
        this.store = new Map();
    }
    key(parts) {
        return parts.join(':');
    }
    get(key) {
        const hit = this.store.get(key);
        if (!hit)
            return undefined;
        if (Date.now() > hit.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return hit.value;
    }
    set(key, value) {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        if (this.store.size > 5000) {
            const oldest = this.store.keys().next().value;
            if (oldest)
                this.store.delete(oldest);
        }
    }
}
exports.GeocodeCache = GeocodeCache;
//# sourceMappingURL=geocode-cache.js.map