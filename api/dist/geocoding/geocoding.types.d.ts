export type ReverseGeocodeResult = {
    lat: number;
    lng: number;
    displayName: string;
    address: {
        road?: string;
        suburb?: string;
        city?: string;
        state?: string;
        country?: string;
        postcode?: string;
    };
};
export type NearbyPlace = {
    name: string;
    category: string;
    lat: number;
    lng: number;
    distanceM: number;
    direction: string;
};
export type NearbyResult = {
    lat: number;
    lng: number;
    radiusM: number;
    places: NearbyPlace[];
};
