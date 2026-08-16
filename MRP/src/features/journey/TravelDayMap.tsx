import React, {useEffect, useMemo, useRef} from 'react';
import {View, StyleSheet, ActivityIndicator} from 'react-native';
import {WebView} from 'react-native-webview';

type Pt = {latitude: number; longitude: number};

type Props = {
  points: Pt[];
  playIdx: number;
};

function downsample(pts: Pt[], max = 400): Pt[] {
  if (pts.length <= max) return pts;
  const out: Pt[] = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function buildHtml(pts: Pt[]): string {
  const latlng = pts.map(p => [Number(p.latitude.toFixed(6)), Number(p.longitude.toFixed(6))]);
  const json = JSON.stringify(latlng);
  const start = latlng[0] || [18.52, 73.85];
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#c5d4e0}
  .leaflet-control-zoom a{width:36px!important;height:36px!important;line-height:36px!important;font-size:20px!important}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var pts = ${json};
var map = L.map('map', {zoomControl: true, attributionControl: false});
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19
}).addTo(map);
var line = null;
var marker = null;
if (pts.length >= 2) {
  line = L.polyline(pts, {color:'#e85d04', weight:6, opacity:0.95}).addTo(map);
  map.fitBounds(line.getBounds().pad(0.18), {maxZoom: 16});
} else {
  map.setView(pts[0] || [${start[0]}, ${start[1]}], 15);
}
window.setHead = function(lat, lng) {
  var p = [lat, lng];
  if (!marker) {
    marker = L.circleMarker(p, {radius: 10, color: '#fff', weight: 3, fillColor: '#ef4444', fillOpacity: 1}).addTo(map);
  } else {
    marker.setLatLng(p);
  }
};
if (pts[0]) window.setHead(pts[0][0], pts[0][1]);
</script>
</body>
</html>`;
}

export function TravelDayMap({points, playIdx}: Props) {
  const ref = useRef<WebView>(null);
  const path = useMemo(() => downsample(points), [points]);
  const html = useMemo(() => buildHtml(path), [path]);
  const head = points[Math.min(Math.max(0, playIdx), Math.max(0, points.length - 1))];

  const injectHead = (p: Pt | undefined) => {
    if (!p) return;
    ref.current?.injectJavaScript(
      `window.setHead && window.setHead(${p.latitude},${p.longitude}); true;`,
    );
  };

  useEffect(() => {
    injectHead(head);
  }, [playIdx, points]);

  if (!points.length) {
    return <View style={styles.box} />;
  }

  return (
    <View style={styles.box} collapsable={false}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{html, baseUrl: 'https://server.arcgisonline.com'}}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        overScrollMode="never"
        androidLayerType="hardware"
        startInLoadingState
        onLoadEnd={() => injectHead(head)}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#0ea5e9" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 280,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#c5d4e0',
  },
  web: {flex: 1, backgroundColor: '#c5d4e0'},
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c5d4e0',
  },
});
