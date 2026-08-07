import { AuthUser } from '../auth/auth.types';
import { GeocodingService } from './geocoding.service';
export declare class GeocodingController {
    private readonly geo;
    constructor(geo: GeocodingService);
    reverse(user: AuthUser, body: {
        lat?: number;
        lng?: number;
    }): Promise<import("./geocoding.types").ReverseGeocodeResult>;
    nearby(user: AuthUser, body: {
        lat?: number;
        lng?: number;
        radiusM?: number;
        categories?: string[];
    }): Promise<import("./geocoding.types").NearbyResult>;
}
