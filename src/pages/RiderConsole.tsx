import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Phone,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import RiderMap from '../components/RiderMap';

// Rider-side delivery console. Multi-order ("trip") aware: a single
// shared rider_token can carry multiple stops, and we list them all
// here with per-stop "Mark delivered" buttons. Geolocation streams
// once and the edge function fans the position out to every stop.

interface RiderStop {
  id: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_landmark: string | null;
  delivery_pincode: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  total: number | null;
}

interface RiderTripBranch {
  name: string;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const POLL_INTERVAL_MS = 10_000;
const ACTIVE_STATUSES = new Set([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
]);

export default function RiderConsole() {
  const { token = '' } = useParams<{ token: string }>();

  const [stops, setStops] = useState<RiderStop[] | null>(null);
  const [branch, setBranch] = useState<RiderTripBranch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const lastPushRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  // Bootstrap: pull every stop on this trip.
  useEffect(() => {
    if (!token) {
      setLoadError('Missing token in URL');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        orders?: RiderStop[];
        branch?: RiderTripBranch | null;
        error?: string;
      }>('rider-update', { body: { token, action: 'whoami' } });
      if (cancelled) return;
      if (error || !data?.ok || !data.orders) {
        setLoadError(data?.error ?? error?.message ?? 'Could not load trip');
        return;
      }
      setStops(data.orders);
      setBranch(data.branch ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const remainingStops = useMemo(
    () => stops?.filter((s) => ACTIVE_STATUSES.has(s.status)) ?? [],
    [stops]
  );
  const allDone = stops !== null && remainingStops.length === 0;

  // Geolocation streaming. Runs while at least one stop is still
  // active. Updates throttled to once per POLL_INTERVAL_MS.
  useEffect(() => {
    if (!stops || allDone) return;
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported in this browser');
      return;
    }
    setStreaming(true);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords(pos.coords);
        setGeoError(null);
        const now = Date.now();
        if (now - lastPushRef.current < POLL_INTERVAL_MS) return;
        lastPushRef.current = now;
        void supabase.functions.invoke('rider-update', {
          body: {
            token,
            action: 'location',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
        });
      },
      (err) => setGeoError(err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      }
    );
    watchIdRef.current = id;

    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
      setStreaming(false);
    };
  }, [stops, allDone, token]);

  // Once all stops are closed, stop watching position.
  useEffect(() => {
    if (allDone && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, [allDone]);

  async function markDelivered(stopId: string) {
    if (
      !window.confirm(
        'Mark this stop as delivered? You can keep delivering the other stops on this trip.'
      )
    ) {
      return;
    }
    setMarkingId(stopId);
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      error?: string;
    }>('rider-update', {
      body: { token, action: 'delivered', order_id: stopId },
    });
    setMarkingId(null);
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? 'Could not mark delivered');
      return;
    }
    setStops((prev) =>
      prev
        ? prev.map((s) => (s.id === stopId ? { ...s, status: 'served' } : s))
        : prev
    );
    toast.success('Stop delivered');
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <span className="inline-flex w-14 h-14 rounded-full border border-red-500/40 bg-red-500/10 items-center justify-center text-red-400 mb-4">
            <ShieldAlert size={22} />
          </span>
          <h1 className="font-display italic text-3xl text-cream mb-3">
            We can&apos;t open this delivery
          </h1>
          <p className="text-cream/60 text-sm mb-6">{loadError}</p>
          <Link
            to="/"
            className="inline-block border border-brand-500/40 text-brand-500 px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.25em] font-mono hover:bg-brand-500 hover:text-ink transition"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!stops) {
    return (
      <div className="min-h-screen bg-obsidian text-cream flex items-center justify-center">
        <span className="font-mono text-xs text-brand-500 tracking-[0.3em] uppercase animate-pulse inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          Loading trip…
        </span>
      </div>
    );
  }

  const totalStops = stops.length;
  const doneCount = stops.filter((s) => s.status === 'served').length;

  return (
    <div className="min-h-screen bg-obsidian text-cream pb-32">
      <header className="px-5 md:px-8 pt-6 pb-4 flex items-center justify-between gap-4 border-b border-brand-500/10 bg-obsidian-100/60 backdrop-blur sticky top-0 z-30">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-brand-500">
            Rider trip
          </p>
          <h1 className="font-display italic text-2xl md:text-3xl text-cream leading-tight">
            {totalStops === 1
              ? '1 stop'
              : `${doneCount} of ${totalStops} delivered`}
          </h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/75 mb-1">
            From
          </p>
          <p className="font-display italic text-lg text-cream leading-tight">
            {branch?.name ?? 'Van Lavino'}
          </p>
        </div>
      </header>

      <main className="px-5 md:px-8 mt-6 max-w-3xl mx-auto space-y-5">
        {/* Streaming status */}
        <div
          className={`rounded-2xl p-4 border flex items-start gap-3 ${
            allDone
              ? 'bg-green-500/10 border-green-500/30'
              : geoError
                ? 'bg-amber-500/10 border-amber-500/30'
                : streaming
                  ? 'bg-brand-500/10 border-brand-500/30'
                  : 'bg-obsidian-100 border-brand-500/10'
          }`}
        >
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border ${
              allDone
                ? 'bg-green-500/20 border-green-500/40 text-green-400'
                : geoError
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-brand-500/15 border-brand-500/40 text-brand-500'
            }`}
          >
            {allDone ? (
              <CheckCircle2 size={16} />
            ) : geoError ? (
              <ShieldAlert size={16} />
            ) : (
              <MapPin size={16} />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display italic text-lg text-cream leading-tight">
              {allDone
                ? 'All stops delivered'
                : geoError
                  ? 'Location unavailable'
                  : streaming
                    ? coords
                      ? 'Sharing your live location'
                      : 'Waiting for GPS lock…'
                    : 'Starting…'}
            </p>
            <p className="text-cream/65 text-sm mt-1">
              {allDone
                ? 'Thanks for closing the trip out — stay safe.'
                : geoError
                  ? geoError
                  : 'Customers see your pin move on their tracking pages. Keep this tab open while you ride.'}
            </p>
            {coords && !allDone && (
              <p className="font-mono text-[10px] tracking-wider text-cream/70 mt-2">
                {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                {' · ±'}
                {Math.round(coords.accuracy)} m
              </p>
            )}
          </div>
        </div>

        {/* Map preview — your own pin + first remaining destination so you
            can sanity-check the next drop. */}
        {coords && (
          <RiderMap
            rider={{ lat: coords.latitude, lng: coords.longitude, label: 'You' }}
            origin={
              branch?.lat != null && branch?.lng != null
                ? {
                    lat: branch.lat,
                    lng: branch.lng,
                    label: branch.name ?? 'Bakery',
                  }
                : null
            }
            destination={(() => {
              const next = remainingStops.find(
                (s) => s.delivery_lat != null && s.delivery_lng != null
              );
              if (!next) return null;
              return {
                lat: next.delivery_lat as number,
                lng: next.delivery_lng as number,
                label: next.customer_name ?? 'Next stop',
              };
            })()}
            className="w-full h-[260px]"
          />
        )}

        {/* Stops */}
        <div className="space-y-3">
          {stops.map((stop, i) => (
            <StopCard
              key={stop.id}
              stop={stop}
              index={i + 1}
              busy={markingId === stop.id}
              onDeliver={() => markDelivered(stop.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function StopCard({
  stop,
  index,
  busy,
  onDeliver,
}: {
  stop: RiderStop;
  index: number;
  busy: boolean;
  onDeliver: () => void;
}) {
  const done = stop.status === 'served';
  return (
    <article
      className={`bg-obsidian-100 border rounded-2xl p-5 transition-colors ${
        done
          ? 'border-green-500/30 opacity-80'
          : 'border-brand-500/15 hover:border-brand-500/30'
      }`}
    >
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="inline-flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[11px] font-bold ${
              done
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-brand-500 text-ink'
            }`}
          >
            {done ? '✓' : index}
          </span>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-cream/75">
            Stop {index} · #{stop.id.slice(-6).toUpperCase()}
          </p>
        </div>
        {done && (
          <span className="font-mono text-[10px] tracking-wider text-green-400 uppercase">
            Delivered
          </span>
        )}
      </header>

      <p className="font-display italic text-xl text-cream leading-tight">
        {stop.customer_name ?? 'Customer'}
      </p>
      <p className="text-cream/85 text-sm leading-relaxed whitespace-pre-wrap mt-2">
        {stop.delivery_address ?? '—'}
      </p>
      {(stop.delivery_landmark || stop.delivery_pincode) && (
        <p className="font-mono text-[11px] text-cream/75 mt-1.5 tracking-wider">
          {stop.delivery_landmark}
          {stop.delivery_landmark && stop.delivery_pincode ? ' · ' : ''}
          {stop.delivery_pincode}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {stop.customer_phone && (
          <a
            href={`tel:+91${stop.customer_phone}`}
            className="inline-flex items-center gap-2 border border-brand-500/40 text-brand-500 px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono hover:bg-brand-500 hover:text-ink transition"
          >
            <Phone size={12} />
            +91 {stop.customer_phone}
          </a>
        )}
        {stop.delivery_lat != null && stop.delivery_lng != null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${stop.delivery_lat},${stop.delivery_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-cream/20 text-cream/70 px-3 py-2 rounded-full text-[11px] uppercase tracking-[0.2em] font-mono hover:text-brand-500 hover:border-brand-500/40 transition"
          >
            <MapPin size={12} />
            Open in Maps
          </a>
        )}
        {stop.total != null && (
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-cream/65 ml-auto">
            ₹{Number(stop.total).toFixed(2)}
          </span>
        )}
      </div>

      {!done && (
        <button
          onClick={onDeliver}
          disabled={busy}
          className="mt-4 w-full bg-brand-500 text-ink py-3 rounded-full font-medium tracking-wide hover:bg-brand-400 hover:shadow-glow transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCircle2 size={15} />
          )}
          {busy ? 'Marking…' : 'Mark this stop delivered'}
        </button>
      )}
    </article>
  );
}
