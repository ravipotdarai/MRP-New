import React, {useEffect, useMemo, useRef} from 'react';
import {View, StyleSheet, ActivityIndicator, Pressable, Text} from 'react-native';
import {WebView} from 'react-native-webview';

type Pt = {latitude: number; longitude: number};

type Props = {
  points: Pt[];
  playIdx: number;
  /** Pan to tip when path grows (live follow). Does not reset user zoom. */
  follow?: boolean;
};

function downsample(pts: Pt[], max = 600): Pt[] {
  if (pts.length <= max) return pts;
  const out: Pt[] = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function toLatLng(pts: Pt[]): [number, number][] {
  return pts.map(p => [
    Number(Number(p.latitude).toFixed(6)),
    Number(Number(p.longitude).toFixed(6)),
  ]);
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#cfd8e3;touch-action:none}
  .leaflet-container{background:#cfd8e3;touch-action:none}
  .leaflet-control-zoom a{width:40px!important;height:40px!important;line-height:40px!important;font-size:22px!important}
  .ep{width:22px;height:22px;border-radius:50%;color:#fff;font:700 11px/22px system-ui,sans-serif;
      text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}
  .ep-a{background:#16a34a}.ep-b{background:#dc2626}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map', {
  zoomControl: true,
  attributionControl: false,
  zoomSnap: 0.5,
  zoomDelta: 0.5
}).setView([20, 78], 5);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  maxNativeZoom: 19
}).addTo(map);
var casing = null;
var line = null;
var startM = null;
var endM = null;
var headM = null;
var userZoomed = false;
var lastLen = 0;

map.on('zoomstart', function() { userZoomed = true; });
map.on('dragstart', function() { userZoomed = true; });

function mkEp(cls, label) {
  return L.divIcon({
    className: '',
    html: '<div class="ep ' + cls + '">' + label + '</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

window.resetFollow = function() { userZoomed = false; };

window.setPath = function(pts, follow) {
  try {
    if (!pts || !pts.length) return;
    if (casing) { map.removeLayer(casing); casing = null; }
    if (line) { map.removeLayer(line); line = null; }
    if (startM) { map.removeLayer(startM); startM = null; }
    if (endM) { map.removeLayer(endM); endM = null; }

    if (pts.length >= 2) {
      casing = L.polyline(pts, {color:'#0f172a', weight:12, opacity:0.5, lineCap:'round', lineJoin:'round'}).addTo(map);
      line = L.polyline(pts, {color:'#2563eb', weight:7, opacity:1, lineCap:'round', lineJoin:'round'}).addTo(map);
    }

    var a = pts[0];
    var b = pts[pts.length - 1];
    startM = L.marker(a, {icon: mkEp('ep-a', 'A'), zIndexOffset: 900}).addTo(map);
    if (pts.length > 1) {
      endM = L.marker(b, {icon: mkEp('ep-b', 'B'), zIndexOffset: 900}).addTo(map);
    }

    if (!headM) {
      headM = L.circleMarker(b, {
        radius: 11, color: '#fff', weight: 3, fillColor: '#ef4444', fillOpacity: 1
      }).addTo(map);
    } else {
      headM.setLatLng(b);
    }

    var grew = pts.length > lastLen;
    lastLen = pts.length;

    if (!userZoomed && pts.length >= 2 && line) {
      map.fitBounds(line.getBounds().pad(0.35), {maxZoom: 17, animate: false});
    } else if (!userZoomed && pts.length === 1) {
      map.setView(a, 16, {animate: false});
    } else if (follow && grew) {
      map.panTo(b, {animate: true, duration: 0.35});
    }
  } catch (e) {
    console.log('setPath', e);
  }
};

window.fitTrail = function() {
  try {
    userZoomed = false;
    map.invalidateSize();
    if (line) {
      map.fitBounds(line.getBounds().pad(0.3), {maxZoom: 17});
    } else if (startM) {
      map.setView(startM.getLatLng(), 16);
    }
  } catch (e) {}
};

window.zoomBy = function(delta) {
  map.setZoom(map.getZoom() + delta);
  userZoomed = true;
};

setTimeout(function() { map.invalidateSize(); }, 80);
setTimeout(function() { map.invalidateSize(); }, 350);
</script>
</body>
</html>`;

export function TravelDayMap({points, playIdx, follow = false}: Props) {
  const ref = useRef<WebView>(null);
  const readyRef = useRef(false);
  const latlngRef = useRef<[number, number][]>([]);
  const followRef = useRef(follow);
  followRef.current = follow;

  const revealed = useMemo(() => {
    if (!points.length) return [];
    const end = Math.min(Math.max(0, playIdx), points.length - 1);
    return downsample(points.slice(0, end + 1));
  }, [points, playIdx]);

  const latlng = useMemo(() => toLatLng(revealed), [revealed]);
  latlngRef.current = latlng;

  const pushPath = (doFollow: boolean) => {
    if (!readyRef.current || !latlngRef.current.length) return;
    const payload = JSON.stringify(latlngRef.current);
    ref.current?.injectJavaScript(
      `window.setPath && window.setPath(${payload}, ${doFollow ? 'true' : 'false'}); true;`,
    );
  };

  useEffect(() => {
    pushPath(followRef.current);
  }, [latlng]);

  if (!points.length) {
    return <View style={styles.box} />;
  }

  return (
    <View style={styles.box} collapsable={false}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{html: MAP_HTML, baseUrl: 'https://server.arcgisonline.com'}}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        overScrollMode="never"
        scrollEnabled={false}
        scalesPageToFit={false}
        bounces={false}
        androidLayerType="hardware"
        startInLoadingState
        onLoadEnd={() => {
          readyRef.current = true;
          const run = () => {
            ref.current?.injectJavaScript(`window.resetFollow && window.resetFollow(); true;`);
            pushPath(false);
            ref.current?.injectJavaScript(`window.fitTrail && window.fitTrail(); true;`);
          };
          setTimeout(run, 100);
          setTimeout(run, 400);
        }}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#2563eb" />
          </View>
        )}
      />
      <View style={styles.zoomCol} pointerEvents="box-none">
        <Pressable
          style={styles.zoomBtn}
          onPress={() =>
            ref.current?.injectJavaScript(`window.zoomBy && window.zoomBy(1); true;`)
          }
          accessibilityLabel="Zoom in">
          <Text style={styles.zoomTxt}>+</Text>
        </Pressable>
        <Pressable
          style={styles.zoomBtn}
          onPress={() =>
            ref.current?.injectJavaScript(`window.zoomBy && window.zoomBy(-1); true;`)
          }
          accessibilityLabel="Zoom out">
          <Text style={styles.zoomTxt}>−</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.fitBtn}
        onPress={() => {
          ref.current?.injectJavaScript(`window.fitTrail && window.fitTrail(); true;`);
          pushPath(false);
        }}
        accessibilityLabel="Fit path on map">
        <Text style={styles.fitBtnText}>Fit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 300,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#cfd8e3',
  },
  web: {flex: 1, backgroundColor: '#cfd8e3'},
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#cfd8e3',
  },
  zoomCol: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    zIndex: 6,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  zoomTxt: {color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 28},
  fitBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(15,23,42,0.88)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    zIndex: 6,
  },
  fitBtnText: {color: '#fff', fontWeight: '800', fontSize: 13},
});
