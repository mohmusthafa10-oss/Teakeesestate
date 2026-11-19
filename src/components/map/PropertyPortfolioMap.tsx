import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { Property, PropertyImage, PropertyStatus } from '../../types/crm';
import { formatCurrency } from '../../utils/formatters';
import { getPropertyCoords, getStatusPinStyle } from '../../utils/geo';

interface PropertyPortfolioMapProps {
  properties: Property[];
  images: PropertyImage[];
  currencySymbol: string;
  selectedPropertyId?: string;
  onSelectProperty: (prop: Property) => void;
  onOpenProfile: (prop: Property) => void;
  onEditLocation?: (prop: Property) => void;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPinIcon(status: PropertyStatus, isSelected: boolean): L.DivIcon {
  const style = getStatusPinStyle(status);
  const scale = isSelected ? 1.18 : 1;
  const ring = isSelected
    ? `<circle cx="16" cy="14" r="13" fill="none" stroke="#064E3B" stroke-width="2.5" opacity="0.45" />`
    : '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40" style="transform: scale(${scale}); transform-origin: bottom center; filter: drop-shadow(0 3px 6px rgba(21,29,24,0.28));">
      ${ring}
      <path d="M16 2C9.373 2 4 7.373 4 14c0 8.5 12 22 12 22s12-13.5 12-22c0-6.627-5.373-12-12-12z" fill="${style.fill}" stroke="#FFFFFF" stroke-width="2" />
      <circle cx="16" cy="14" r="4.5" fill="#FFFFFF" />
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    tooltipAnchor: [0, -34],
    popupAnchor: [0, -34],
  });
}

const LEGEND_ITEMS: { status: PropertyStatus; label: string; color: string }[] = [
  { status: 'Available', label: 'Available', color: '#15803D' },
  { status: 'Under Negotiation', label: 'Under Negotiation', color: '#EA580C' },
  { status: 'Reserved', label: 'Reserved', color: '#CA8A04' },
  { status: 'Sold', label: 'Sold', color: '#6B7280' },
  { status: 'Rented', label: 'Rented / Occupied', color: '#2563EB' },
  { status: 'Inactive', label: 'Inactive', color: '#9CA3AF' },
];

export const PropertyPortfolioMap: React.FC<PropertyPortfolioMapProps> = ({
  properties,
  images,
  currencySymbol,
  selectedPropertyId,
  onSelectProperty,
  onOpenProfile,
  onEditLocation,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelectProperty);
  const onOpenProfileRef = useRef(onOpenProfile);

  onSelectRef.current = onSelectProperty;
  onOpenProfileRef.current = onOpenProfile;

  const { mapped, pending } = useMemo(() => {
    const withCoords: { prop: Property; lat: number; lng: number }[] = [];
    const withoutCoords: Property[] = [];
    properties.forEach((p) => {
      const coords = getPropertyCoords(p);
      if (coords) {
        withCoords.push({ prop: p, lat: coords.lat, lng: coords.lng });
      } else {
        withoutCoords.push(p);
      }
    });
    return { mapped: withCoords, pending: withoutCoords };
  }, [properties]);

  const getPrimaryImage = (propertyId: string) =>
    images.find((i) => i.propertyId === propertyId && i.isPrimary)?.url ||
    images.find((i) => i.propertyId === propertyId)?.url ||
    '';

  const fitAllMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    if (mapped.length === 0) {
      map.setView([12.31, 75.11], 10);
      return;
    }
    if (mapped.length === 1) {
      map.setView([mapped[0].lat, mapped[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(mapped.map((m) => [m.lat, m.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 });
  };

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [12.31, 75.11],
      zoom: 10,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 46,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) =>
        L.divIcon({
          html: `<div class="crm-cluster-badge">${c.getChildCount()}</div>`,
          className: 'crm-cluster-icon',
          iconSize: [40, 40],
        }),
    });

    map.addLayer(cluster);

    // Delegate popup "Open Property Profile" clicks safely
    map.on('popupopen', (e) => {
      const popupEl = e.popup.getElement();
      if (!popupEl) return;
      const btn = popupEl.querySelector<HTMLButtonElement>('[data-open-profile-id]');
      if (btn) {
        btn.onclick = () => {
          const propId = btn.getAttribute('data-open-profile-id');
          const found = properties.find((p) => p.id === propId);
          if (found) onOpenProfileRef.current(found);
        };
      }
    });

    mapRef.current = map;
    clusterRef.current = cluster;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Keep popupopen handler in sync with latest filtered properties array
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlePopupOpen = (e: L.PopupEvent) => {
      const popupEl = e.popup.getElement();
      if (!popupEl) return;
      const btn = popupEl.querySelector<HTMLButtonElement>('[data-open-profile-id]');
      if (btn) {
        btn.onclick = () => {
          const propId = btn.getAttribute('data-open-profile-id');
          const found = properties.find((p) => p.id === propId);
          if (found) onOpenProfileRef.current(found);
        };
      }
    };
    map.off('popupopen');
    map.on('popupopen', handlePopupOpen);
  }, [properties]);

  // Synchronize markers with filtered properties
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    cluster.clearLayers();
    markersByIdRef.current.clear();

    const isTouchDevice =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    mapped.forEach(({ prop, lat, lng }) => {
      const expected = prop.expectedPrice ?? prop.askingPrice;
      const thumb = getPrimaryImage(prop.id);
      const style = getStatusPinStyle(prop.status);
      const isSelected = prop.id === selectedPropertyId;
      const structuredLoc = [prop.locality, prop.panchayath, prop.district]
        .filter(Boolean)
        .join(', ');

      const marker = L.marker([lat, lng], {
        icon: createPinIcon(prop.status, isSelected),
      });

      const thumbHtml = thumb
        ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(prop.title)}" style="width:68px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#E4EBE0;" />`
        : `<div style="width:68px;height:68px;border-radius:8px;background:#E4EBE0;flex-shrink:0;"></div>`;

      // Compact Hover Preview (desktop only; mobile uses tap popup directly)
      if (!isTouchDevice) {
        const tooltipHtml = `
          <div style="width:268px;padding:10px;display:flex;gap:10px;align-items:flex-start;">
            ${thumbHtml}
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;">
                <span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#064E3B;">${escapeHtml(prop.code)} · ${escapeHtml(prop.type)}</span>
                <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:5px;background:#F1F0E8;color:#20251F;border:1px solid #E5E4DA;">${escapeHtml(prop.status)}</span>
              </div>
              <div style="font-size:12px;font-weight:600;color:#20251F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(prop.title)}</div>
              <div style="font-size:10px;color:#77796F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escapeHtml(structuredLoc)}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px;">
                <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#064E3B;">${escapeHtml(formatCurrency(expected, currencySymbol))}</span>
                <span style="font-size:10px;color:#77796F;">${escapeHtml(prop.areaDisplay)}</span>
              </div>
              ${prop.isDemoData ? `<div style="font-size:9px;color:#7A5612;margin-top:3px;">Demo listing</div>` : ''}
            </div>
          </div>
        `;
        marker.bindTooltip(tooltipHtml, {
          direction: 'top',
          opacity: 1,
          className: 'crm-map-tooltip',
        });
      }

      // Click / Tap Popup Card
      const popupThumbHtml = thumb
        ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(prop.title)}" style="width:100%;height:112px;object-fit:cover;display:block;background:#E4EBE0;" />`
        : '';

      const popupHtml = `
        <div style="width:280px;overflow:hidden;">
          ${popupThumbHtml}
          <div style="padding:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#064E3B;">${escapeHtml(prop.code)} · ${escapeHtml(prop.type)} · ${escapeHtml(prop.category)}</span>
              <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:6px;background:${style.fill};color:#FFFFFF;">${escapeHtml(prop.status)}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:#20251F;line-height:1.3;">${escapeHtml(prop.title)}</div>
            <div style="font-size:11px;color:#77796F;margin-top:4px;">${escapeHtml(structuredLoc)}</div>
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #E5E4DA;">
              <div>
                <div style="font-size:10px;color:#77796F;">Expected Price</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#064E3B;">${escapeHtml(formatCurrency(expected, currencySymbol))}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:10px;color:#77796F;">Area</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:#20251F;">${escapeHtml(prop.areaDisplay)}</div>
              </div>
            </div>
            ${prop.isDemoData ? `<div style="font-size:10px;color:#7A5612;background:#F1F0E8;padding:3px 6px;border-radius:5px;margin-top:6px;">Demonstration sample coordinates</div>` : ''}
            <button type="button" data-open-profile-id="${escapeHtml(prop.id)}" style="margin-top:10px;width:100%;height:34px;border:none;border-radius:8px;background:#064E3B;color:#FFFFFF;font-size:12px;font-weight:600;cursor:pointer;">
              Open Property Profile
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'crm-map-popup',
        maxWidth: 300,
      });

      marker.on('click', () => {
        onSelectRef.current(prop);
      });

      cluster.addLayer(marker);
      markersByIdRef.current.set(prop.id, marker);
    });

    fitAllMarkers();
  }, [mapped, images, currencySymbol]);

  // Update selected pin highlight cleanly without resetting zoom
  useEffect(() => {
    mapped.forEach(({ prop }) => {
      const marker = markersByIdRef.current.get(prop.id);
      if (marker) {
        marker.setIcon(createPinIcon(prop.status, prop.id === selectedPropertyId));
      }
    });
  }, [selectedPropertyId, mapped]);

  return (
    <div className="space-y-3">
      {/* Map Frame */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
        {/* Top Legend & Controls Bar */}
        <div className="px-4 py-3 border-b border-[#E5E4DA] flex flex-wrap items-center justify-between gap-3 bg-[#F1F0E8]/40">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#20251F]">
            <span className="font-semibold text-[#064E3B]">
              {mapped.length} Mapped
            </span>
            {pending.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-[#D9AC57]/20 text-[#7A5612] font-medium">
                {pending.length} Location Pending
              </span>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {LEGEND_ITEMS.map((item) => (
                <span key={item.status} className="inline-flex items-center gap-1.5 text-[#77796F]">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block border border-[#FFFFFF] shadow-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              title="Zoom in"
              className="h-8 w-8 rounded-lg bg-[#FFFFFF] border border-[#E5E4DA] hover:bg-[#E4EBE0]/60 flex items-center justify-center text-[#20251F] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              title="Zoom out"
              className="h-8 w-8 rounded-lg bg-[#FFFFFF] border border-[#E5E4DA] hover:bg-[#E4EBE0]/60 flex items-center justify-center text-[#20251F] cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={fitAllMarkers}
              className="h-8 px-3 rounded-lg bg-[#FFFFFF] border border-[#E5E4DA] hover:bg-[#E4EBE0]/60 text-xs font-medium text-[#064E3B] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              Fit All Pins
            </button>
          </div>
        </div>

        {/* Leaflet Map Canvas */}
        <div className="relative h-[500px] sm:h-[560px] w-full">
          <div ref={containerRef} className="h-full w-full z-0" />
          {mapped.length === 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[400]">
              <div className="bg-[#FFFFFF]/95 border border-[#E5E4DA] rounded-xl px-5 py-4 text-center shadow-sm max-w-xs">
                <MapPin className="w-5 h-5 text-[#064E3B] mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-[#20251F]">
                  No mapped coordinates for current filters
                </p>
                <p className="text-[11px] text-[#77796F] mt-0.5">
                  Properties without map pins are listed below under Location Pending.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Properties Flagged as Location Pending */}
      {pending.length > 0 && (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#20251F]">
              Location Pending ({pending.length}) — Missing Map Coordinates
            </p>
            <span className="text-[11px] text-[#77796F]">
              Pin coordinates to display these properties on the map
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pending.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-xl bg-[#F1F0E8]/60 border border-[#E5E4DA] flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(p)}
                    className="font-semibold text-[#20251F] hover:text-[#064E3B] truncate block text-left cursor-pointer"
                  >
                    <span className="font-mono text-[#064E3B] mr-1.5">{p.code}</span>
                    {p.title}
                  </button>
                  <p className="text-[11px] text-[#77796F] truncate">
                    {p.locality}, {p.panchayath}, {p.district}
                  </p>
                </div>
                {onEditLocation && (
                  <button
                    type="button"
                    onClick={() => onEditLocation(p)}
                    className="px-2.5 py-1 rounded-md bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-[11px] font-medium shrink-0 cursor-pointer transition-colors"
                  >
                    Set Pin
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
