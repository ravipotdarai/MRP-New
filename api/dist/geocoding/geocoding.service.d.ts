import type { NearbyResult, ReverseGeocodeResult } from './geocoding.types';
export declare class GeocodingService {
    private readonly log;
    private reverseCache;
    private nearbyCache;
    private rateByUid;
    private assertRate;
    private roundCoord;
    reverse(uid: string, lat: number, lng: number): Promise<ReverseGeocodeResult>;
    nearby(uid: string, lat: number, lng: number, radiusM?: number, categories?: string[]): Promise<NearbyResult>;
}
