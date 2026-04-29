import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader2, MapPin } from 'lucide-react';

// Captures the customer's exact delivery location during /order/checkout.
// The pin shows up as the destination on the customer's /track map and
// on the rider's /rider/<token> map, completing the Blinkit-style "rider
// X km from you" UX.
//
// Two affordances:
//   1. Tap anywhere on the map to drop the pin there.
//   2. "Use my location" button to drop it at the device's GPS.
//
// Falls back gracefully when geolocation is denied — the customer can
// still pan + tap. The pin is fully optional; the order saves without it.

export interface DeliveryPinPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (next: { lat: number; lng: number } | null) => void;
  /** Sensible default — the chosen branch's coords. Hyderabad fallback. */
  initialCenter?: { lat: number; lng: number } | null;
  className?: string;
}

const DEFAULT_CENTER = { lat: 17.4239, lng: 78.4099 }; // Jubilee Hills

const pinIcon = L.divIcon({
  className: 'delivery-pin',
  html: `
    <div style="
      position: relative;
      width: 32px;
      height: 32px;
      transform: translate(-16px, -32px);
    ">
      <span style="
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 14px;
        height: 14px;
        background: #c17820;
        border: 2px solid #fff;
        border-radius: 50%;
        transform: translate(-50%, 50%);
        box-shadow: 0 4px 14px rgba(193, 120, 32, 0.55);
        z-index: 2;
      "></span>
      <span style="
        position: absolute;
        left: 50%;
        bottom: 6px;
        width: 0;
        height: 0;
        border-left: 7px solid transparent;
        border-right: 7px solid transparent;
        border-top: 12px solid #c17820;
        transform: translateX(-50%);
        z-index: 1;
      "></span>
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

export default function DeliveryPinPicker({
  value,
  onChange,
  initialCenter,
  className = 'w-full h-[260px]',
}: DeliveryPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [locating, setLocating] = useState(false);

  // Initial map setup. Re-runs only if the container ref changes
  // (effectively once on mount).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = value ?? initialCenter ?? DEFAULT_CENTER;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // We intentionally don't depend on initialCenter / value / onChange —
    // the map is created once. Subsequent prop changes are picked up by
    // the marker effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebind click handler when onChange changes so we always invoke the
  // latest closure — Leaflet hangs onto the original handler otherwise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [onChange]);

  // Move/create/remove the pin as the value prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([value.lat, value.lng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const m = e.target as L.Marker;
        const ll = m.getLatLng();
        onChange({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    map.panTo([value.lat, value.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function useMyLocation() {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        onChange(next);
        mapRef.current?.setView([next.lat, next.lng], 16, { animate: true });
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`rounded-2xl overflow-hidden border border-brand-500/20 ${className}`}
      />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 border border-brand-500/40 text-brand-500 px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.25em] font-mono hover:bg-brand-500 hover:text-ink transition disabled:opacity-50"
        >
          {locating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Crosshair size={13} />
          )}
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <span className="font-mono text-[10px] tracking-wider text-cream/60 inline-flex items-center gap-1.5">
          <MapPin size={11} className="text-brand-500" />
          {value
            ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
            : 'Tap the map or use your location'}
        </span>
      </div>
    </div>
  );
}
