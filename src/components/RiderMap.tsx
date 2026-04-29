import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Live delivery rider map. Shows the rider's current pin, optionally a
// destination pin (when delivery_lat/lng was captured at checkout) and a
// branch origin pin. Smoothly animates the rider pin between updates so
// the customer sees motion instead of teleporting dots.
//
// We use vanilla Leaflet via refs rather than react-leaflet — fewer deps,
// straightforward enough for our use.

interface MarkerPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface RiderMapProps {
  rider: MarkerPoint | null;
  destination?: MarkerPoint | null;
  origin?: MarkerPoint | null;
  /** Defaults to 14. Use 15-16 if you have rider+destination pins close. */
  zoom?: number;
  className?: string;
}

// Leaflet's default marker icons rely on bundler-resolved asset URLs that
// break in Vite. Use plain CDN URLs so markers always render.
const ICON_DEFAULTS = {
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
  popupAnchor: [1, -34] as [number, number],
  shadowSize: [41, 41] as [number, number],
};

// Custom gold pin for the rider — matches the brand instead of generic blue.
const riderIcon = L.divIcon({
  className: 'rider-pin',
  html: `
    <div style="
      position: relative;
      width: 28px;
      height: 28px;
      transform: translate(-14px, -14px);
    ">
      <span style="
        position: absolute;
        inset: 0;
        background: rgba(193, 120, 32, 0.35);
        border-radius: 50%;
        animation: rider-pulse 1.6s ease-out infinite;
      "></span>
      <span style="
        position: absolute;
        left: 50%;
        top: 50%;
        width: 14px;
        height: 14px;
        background: #c17820;
        border: 2px solid #fff;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 4px 14px rgba(193, 120, 32, 0.55);
      "></span>
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

const destinationIcon = L.icon({
  ...ICON_DEFAULTS,
  iconUrl: ICON_DEFAULTS.iconUrl,
});

const originIcon = L.divIcon({
  className: 'origin-pin',
  html: `
    <div style="
      width: 18px;
      height: 18px;
      background: #fff;
      border: 3px solid #c17820;
      border-radius: 50%;
      transform: translate(-9px, -9px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    "></div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

export default function RiderMap({
  rider,
  destination,
  origin,
  zoom = 14,
  className = 'w-full h-[360px]',
}: RiderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);

  // Initial map setup — runs once on mount. Subsequent prop changes update
  // markers in place without re-creating the map.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngTuple = rider
      ? [rider.lat, rider.lng]
      : destination
        ? [destination.lat, destination.lng]
        : origin
          ? [origin.lat, origin.lng]
          : [17.4239, 78.4738]; // Hyderabad-ish fallback

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
      destMarkerRef.current = null;
      originMarkerRef.current = null;
    };
    // We deliberately depend on nothing — map is created once. The other
    // effects update markers in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rider pin — created/moved/removed as the prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!rider) {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.remove();
        riderMarkerRef.current = null;
      }
      return;
    }

    if (!riderMarkerRef.current) {
      riderMarkerRef.current = L.marker([rider.lat, rider.lng], {
        icon: riderIcon,
        zIndexOffset: 1000,
      }).addTo(map);
      if (rider.label) riderMarkerRef.current.bindTooltip(rider.label);
    } else {
      riderMarkerRef.current.setLatLng([rider.lat, rider.lng]);
    }
  }, [rider]);

  // Destination + origin pins — same pattern.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!destination) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }
    if (!destMarkerRef.current) {
      destMarkerRef.current = L.marker([destination.lat, destination.lng], {
        icon: destinationIcon,
      }).addTo(map);
      if (destination.label)
        destMarkerRef.current.bindTooltip(destination.label);
    } else {
      destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
    }
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }
    if (!originMarkerRef.current) {
      originMarkerRef.current = L.marker([origin.lat, origin.lng], {
        icon: originIcon,
      }).addTo(map);
      if (origin.label) originMarkerRef.current.bindTooltip(origin.label);
    } else {
      originMarkerRef.current.setLatLng([origin.lat, origin.lng]);
    }
  }, [origin]);

  // Auto-fit bounds to whichever pins exist, so the customer always sees
  // both the rider and (when available) the destination.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: L.LatLngTuple[] = [];
    if (rider) points.push([rider.lat, rider.lng]);
    if (destination) points.push([destination.lat, destination.lng]);
    if (origin) points.push([origin.lat, origin.lng]);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], zoom, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points), {
      padding: [40, 40],
      maxZoom: 16,
      animate: true,
    });
  }, [rider, destination, origin, zoom]);

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl overflow-hidden border border-brand-500/20 ${className}`}
    />
  );
}
