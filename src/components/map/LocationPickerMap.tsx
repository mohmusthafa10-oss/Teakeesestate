import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, MapPin, Search, Trash2 } from 'lucide-react';
import { GeocodingResult, isValidLatLng, searchLocationNominatim } from '../../utils/geo';

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  locationAccuracy?: string;
  addressHint?: string;
  onChange: (next: {
    latitude: number | null;
    longitude: number | null;
    locationAccuracy?: string;
  }) => void;
  heightClass?: string;
}

function createPickerIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42" style="filter: drop-shadow(0 4px 8px rgba(21,29,24,0.3));">
        <path d="M17 2C9.82 2 4 7.82 4 15c0 9.2 13 24 13 24s13-14.8 13-24c0-7.18-5.82-13-13-13z" fill="#064E3B" stroke="#FFFFFF" stroke-width="2.5" />
        <circle cx="17" cy="15" r="5" fill="#FFFFFF" />
      </svg>
    `,
    className: '',
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  latitude,
  longitude,
  locationAccuracy,
  addressHint,
  onChange,
  heightClass = 'h-64',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [locatingGps, setLocatingGps] = useState(false);

  const hasPin = isValidLatLng(latitude, longitude);

  // Initialize picker map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = hasPin
      ? [latitude as number, longitude as number]
      : [12.31, 75.11];
    const initialZoom = hasPin ? 15 : 10;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      onChangeRef.current({
        latitude: lat,
        longitude: lng,
        locationAccuracy: 'Map Click',
      });
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync draggable marker with latitude/longitude props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isValidLatLng(latitude, longitude)) {
      const pos: [number, number] = [latitude as number, longitude as number];
      if (!markerRef.current) {
        const marker = L.marker(pos, {
          draggable: true,
          icon: createPickerIcon(),
        }).addTo(map);

        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          onChangeRef.current({
            latitude: Number(ll.lat.toFixed(6)),
            longitude: Number(ll.lng.toFixed(6)),
            locationAccuracy: 'Exact Dragged Pin',
          });
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(pos);
      }
    } else if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [latitude, longitude]);

  const runSearch = async (queryText: string) => {
    if (!queryText.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const found = await searchLocationNominatim(queryText);
      setResults(found);
      if (found.length === 0) {
        setSearchError('No matching map locations found. Try adding district or state.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (r: GeocodingResult) => {
    const lat = Number(r.lat.toFixed(6));
    const lng = Number(r.lng.toFixed(6));
    onChange({
      latitude: lat,
      longitude: lng,
      locationAccuracy: 'Map Search',
    });
    setResults([]);
    setSearchError('');
    mapRef.current?.setView([lat, lng], 15, { animate: true });
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setSearchError('Browser geolocation is unavailable.');
      return;
    }
    setLocatingGps(true);
    setSearchError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        onChange({
          latitude: lat,
          longitude: lng,
          locationAccuracy: `GPS (~${Math.round(pos.coords.accuracy)}m)`,
        });
        mapRef.current?.setView([lat, lng], 16, { animate: true });
        setLocatingGps(false);
      },
      () => {
        setSearchError('Could not access current device location. You can click the map instead.');
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="border border-[#E5E4DA] rounded-xl overflow-hidden bg-[#FFFFFF]">
      {/* Header Status */}
      <div className="px-4 py-2.5 bg-[#F1F0E8]/60 border-b border-[#E5E4DA] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <MapPin className="w-3.5 h-3.5 text-[#064E3B]" />
          <span className="font-semibold text-[#20251F]">Interactive Map Pin</span>
          {hasPin ? (
            <span className="px-2 py-0.5 rounded bg-[#E4EBE0] text-[#064E3B] font-mono text-[11px] font-medium">
              {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
              {locationAccuracy ? ` · ${locationAccuracy}` : ''}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-[#D9AC57]/20 text-[#7A5612] text-[11px] font-medium">
              Location Pending (optional — click map or search to pin)
            </span>
          )}
        </div>

        {hasPin && (
          <button
            type="button"
            onClick={() =>
              onChange({ latitude: null, longitude: null, locationAccuracy: undefined })
            }
            className="text-[11px] text-[#C96C60] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Clear Pin
          </button>
        )}
      </div>

      {/* Location Search & Quick Actions */}
      <div className="p-3 border-b border-[#E5E4DA] space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[#77796F] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch(searchQuery);
                }
              }}
              placeholder="Search place, town, panchayath, or landmark..."
              className="w-full h-9 pl-8 pr-3 text-xs bg-[#F1F0E8]/60 border border-[#E5E4DA] rounded-lg focus:outline-none focus:bg-[#FFFFFF] focus:border-[#064E3B]"
            />
          </div>
          <button
            type="button"
            disabled={searching}
            onClick={() => runSearch(searchQuery)}
            className="h-9 px-3 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] disabled:opacity-60 cursor-pointer"
          >
            {searching ? 'Searching...' : 'Search Map'}
          </button>
          {addressHint && addressHint.trim().length > 2 && (
            <button
              type="button"
              disabled={searching}
              onClick={() => {
                setSearchQuery(addressHint);
                runSearch(addressHint);
              }}
              className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#064E3B] cursor-pointer"
            >
              Find Address
            </button>
          )}
          <button
            type="button"
            disabled={locatingGps}
            onClick={handleUseGps}
            className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#20251F] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#064E3B]" />
            {locatingGps ? 'Locating...' : 'GPS'}
          </button>
        </div>

        {searchError && (
          <p className="text-[11px] text-[#C96C60]">{searchError}</p>
        )}

        {results.length > 0 && (
          <div className="border border-[#E5E4DA] rounded-lg divide-y divide-[#E5E4DA] bg-[#FFFFFF] max-h-40 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.placeId}
                type="button"
                onClick={() => selectResult(r)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-[#E4EBE0]/40 flex items-start justify-between gap-2 cursor-pointer"
              >
                <span className="text-[#20251F] line-clamp-2">{r.displayName}</span>
                <span className="font-mono text-[10px] text-[#064E3B] shrink-0">
                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Map Canvas */}
      <div className={`relative w-full ${heightClass}`}>
        <div ref={containerRef} className="h-full w-full z-0" />
      </div>

      {/* Direct Coordinate Inputs & Tip */}
      <div className="px-3 py-2.5 bg-[#F1F0E8]/40 border-t border-[#E5E4DA] flex flex-wrap items-center justify-between gap-3 text-[11px]">
        <span className="text-[#77796F]">
          Click anywhere on the map to place a pin, or drag the green marker to fine-tune.
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[#77796F]">
            Lat:
            <input
              type="number"
              step="any"
              value={latitude ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') {
                  onChange({ latitude: null, longitude: null });
                  return;
                }
                const num = parseFloat(v);
                if (Number.isFinite(num)) {
                  onChange({
                    latitude: num,
                    longitude: longitude ?? 75.1,
                    locationAccuracy: 'Manual Coordinates',
                  });
                }
              }}
              placeholder="—"
              className="w-24 h-7 px-2 font-mono text-[11px] bg-[#FFFFFF] border border-[#E5E4DA] rounded"
            />
          </label>
          <label className="flex items-center gap-1 text-[#77796F]">
            Lng:
            <input
              type="number"
              step="any"
              value={longitude ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') {
                  onChange({ latitude: null, longitude: null });
                  return;
                }
                const num = parseFloat(v);
                if (Number.isFinite(num)) {
                  onChange({
                    latitude: latitude ?? 12.3,
                    longitude: num,
                    locationAccuracy: 'Manual Coordinates',
                  });
                }
              }}
              placeholder="—"
              className="w-24 h-7 px-2 font-mono text-[11px] bg-[#FFFFFF] border border-[#E5E4DA] rounded"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
