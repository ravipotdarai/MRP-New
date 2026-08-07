export type FenceCircle = {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  name?: string;
};

export type PathMode = "gps" | "roads" | "both";
