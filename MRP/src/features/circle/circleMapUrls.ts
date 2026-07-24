/** Stable colors for Circle members (index % length). */
export const MEMBER_PIN_COLORS = [
  {key: 'red', yandex: 'pm2rdm', osm: 'red-pushpin', hex: '#ef4444'},
  {key: 'blue', yandex: 'pm2blm', osm: 'blue-pushpin', hex: '#3b82f6'},
  {key: 'green', yandex: 'pm2grm', osm: 'green-pushpin', hex: '#22c55e'},
  {key: 'orange', yandex: 'pm2orgm', osm: 'orange-pushpin', hex: '#f97316'},
  {key: 'violet', yandex: 'pm2pbm', osm: 'purple-pushpin', hex: '#a855f7'},
  {key: 'yellow', yandex: 'pm2ylm', osm: 'yellow-pushpin', hex: '#eab308'},
] as const;

export type LiveMapPoint = {
  id: string;
  displayName: string;
  latitude: number;
  longitude: number;
  colorIndex: number;
};

export function pinStyle(colorIndex: number) {
  return MEMBER_PIN_COLORS[Math.abs(colorIndex) % MEMBER_PIN_COLORS.length];
}

/** Multi-member static map URLs (Yandex primary, OSM.de fallback) — Home-style. */
export function buildCircleMapUris(points: LiveMapPoint[]): string[] {
  if (points.length === 0) return [];
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

  const yandexPts = points
    .map(p => {
      const style = pinStyle(p.colorIndex);
      return `${p.longitude},${p.latitude},${style.yandex}`;
    })
    .join('~');

  const osmMarkers = points
    .map(p => {
      const style = pinStyle(p.colorIndex);
      return `${p.latitude},${p.longitude},${style.osm}`;
    })
    .join('|');

  return [
    `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${centerLng},${centerLat}&z=14&l=map&size=600,320&pt=${yandexPts}`,
    `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=14&size=600x320&maptype=mapnik&markers=${osmMarkers}`,
  ];
}
