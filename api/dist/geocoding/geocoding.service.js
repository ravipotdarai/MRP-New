"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GeocodingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingService = void 0;
const common_1 = require("@nestjs/common");
const geocode_cache_1 = require("./geocode-cache");
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const USER_AGENT = process.env.MRP_GEO_USER_AGENT || 'MRP-JPNI/1.0 (contact@pathsync.in)';
let GeocodingService = GeocodingService_1 = class GeocodingService {
    constructor() {
        this.log = new common_1.Logger(GeocodingService_1.name);
        this.reverseCache = new geocode_cache_1.GeocodeCache();
        this.nearbyCache = new geocode_cache_1.GeocodeCache();
        this.rateByUid = new Map();
    }
    assertRate(uid, limit = 40) {
        const now = Date.now();
        const row = this.rateByUid.get(uid) || { count: 0, resetAt: now + 60_000 };
        if (now > row.resetAt) {
            row.count = 0;
            row.resetAt = now + 60_000;
        }
        row.count += 1;
        this.rateByUid.set(uid, row);
        if (row.count > limit) {
            throw new common_1.HttpException('Geocoding rate limit exceeded', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    roundCoord(n, digits = 4) {
        const p = 10 ** digits;
        return Math.round(n * p) / p;
    }
    async reverse(uid, lat, lng) {
        this.assertRate(uid);
        const rLat = this.roundCoord(lat);
        const rLng = this.roundCoord(lng);
        const cacheKey = this.reverseCache.key(['rev', rLat, rLng]);
        const cached = this.reverseCache.get(cacheKey);
        if (cached)
            return cached;
        const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${rLat}&lon=${rLng}&addressdetails=1`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });
        if (!res.ok) {
            throw new common_1.HttpException(`Reverse geocode failed (${res.status})`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = (await res.json());
        const addr = body.address || {};
        const out = {
            lat: rLat,
            lng: rLng,
            displayName: body.display_name || `${rLat}, ${rLng}`,
            address: {
                road: addr.road || addr.pedestrian || addr.footway,
                suburb: addr.suburb || addr.neighbourhood || addr.quarter,
                city: addr.city || addr.town || addr.village || addr.county,
                state: addr.state,
                country: addr.country,
                postcode: addr.postcode,
            },
        };
        this.reverseCache.set(cacheKey, out);
        this.log.log(`reverse uid=${uid.slice(0, 8)}… lat=${rLat} lng=${rLng}`);
        return out;
    }
    async nearby(uid, lat, lng, radiusM = 800, categories) {
        this.assertRate(uid);
        const rLat = this.roundCoord(lat);
        const rLng = this.roundCoord(lng);
        const rRadius = Math.min(3000, Math.max(100, Math.round(radiusM)));
        const cats = (categories?.length ? categories : DEFAULT_CATEGORIES).slice(0, 8);
        const cacheKey = this.nearbyCache.key(['near', rLat, rLng, rRadius, cats.join(',')]);
        const cached = this.nearbyCache.get(cacheKey);
        if (cached)
            return cached;
        const filters = cats.flatMap((c) => CATEGORY_FILTERS[c] || []).join('');
        const query = `
[out:json][timeout:25];
(
  ${filters.replace(/\{lat\}/g, String(rLat)).replace(/\{lng\}/g, String(rLng)).replace(/\{r\}/g, String(rRadius))}
);
out center 30;
`;
        const res = await fetch(OVERPASS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
            body: `data=${encodeURIComponent(query)}`,
        });
        if (!res.ok) {
            throw new common_1.HttpException(`Nearby lookup failed (${res.status})`, common_1.HttpStatus.BAD_GATEWAY);
        }
        const body = (await res.json());
        const places = (body.elements || [])
            .map((el) => {
            const plat = el.lat ?? el.center?.lat;
            const plng = el.lon ?? el.center?.lon;
            if (plat == null || plng == null)
                return null;
            const name = el.tags?.name || el.tags?.brand || el.tags?.amenity || el.tags?.shop || 'Place';
            const category = el.tags?.amenity || el.tags?.shop || el.tags?.tourism || 'place';
            const distanceM = haversineM(rLat, rLng, plat, plng);
            return {
                name,
                category,
                lat: plat,
                lng: plng,
                distanceM,
                direction: bearingLabel(rLat, rLng, plat, plng),
            };
        })
            .filter(Boolean);
        places.sort((a, b) => a.distanceM - b.distanceM);
        const out = {
            lat: rLat,
            lng: rLng,
            radiusM: rRadius,
            places: places.slice(0, 25),
        };
        this.nearbyCache.set(cacheKey, out);
        this.log.log(`nearby uid=${uid.slice(0, 8)}… lat=${rLat} lng=${rLng} n=${out.places.length}`);
        return out;
    }
};
exports.GeocodingService = GeocodingService;
exports.GeocodingService = GeocodingService = GeocodingService_1 = __decorate([
    (0, common_1.Injectable)()
], GeocodingService);
const DEFAULT_CATEGORIES = [
    'restaurant',
    'fuel',
    'hotel',
    'hospital',
    'atm',
    'school',
    'police',
    'park',
];
const CATEGORY_FILTERS = {
    restaurant: [
        `node["amenity"~"restaurant|fast_food|cafe"](around:{r},{lat},{lng});`,
    ],
    fuel: [`node["amenity"="fuel"](around:{r},{lat},{lng});`],
    hotel: [`node["tourism"~"hotel|motel|guest_house"](around:{r},{lat},{lng});`],
    hospital: [`node["amenity"~"hospital|clinic|doctors"](around:{r},{lat},{lng});`],
    atm: [`node["amenity"="atm"](around:{r},{lat},{lng});`],
    school: [`node["amenity"="school"](around:{r},{lat},{lng});`],
    police: [`node["amenity"="police"](around:{r},{lat},{lng});`],
    park: [`node["leisure"="park"](around:{r},{lat},{lng});`],
    mall: [`node["shop"="mall"](around:{r},{lat},{lng});`],
    temple: [`node["amenity"="place_of_worship"]["religion"="hindu"](around:{r},{lat},{lng});`],
    mosque: [`node["amenity"="place_of_worship"]["religion"="muslim"](around:{r},{lat},{lng});`],
    church: [`node["amenity"="place_of_worship"]["religion"="christian"](around:{r},{lat},{lng});`],
    airport: [`node["aeroway"="aerodrome"](around:{r},{lat},{lng});`],
    railway: [`node["railway"="station"](around:{r},{lat},{lng});`],
    bus: [`node["highway"="bus_stop"](around:{r},{lat},{lng});`],
};
function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearingLabel(lat1, lng1, lat2, lng2) {
    const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
        Math.sin((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.cos(((lng2 - lng1) * Math.PI) / 180);
    const brng = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(brng / 45) % 8];
}
//# sourceMappingURL=geocoding.service.js.map