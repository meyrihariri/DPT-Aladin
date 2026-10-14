import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Compass, Check, AlertCircle, Layers } from 'lucide-react';
import { isValidLatLng, parseCoordinate, parseCoordinatePair, formatCoordinate } from '../utils/coordinates';

interface MapLocationPickerProps {
  lat: number;
  lng: number;
  radiusMeter?: number;
  onChange: (lat: number, lng: number) => void;
  serverName?: string;
}

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  lat,
  lng,
  radiusMeter = 100,
  onChange,
  serverName = 'Lokasi Server'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapMode, setMapMode] = useState<'satellite' | 'street'>('satellite');
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState('');
  const [pasteSuccess, setPasteSuccess] = useState(false);

  // Local string inputs for smooth typing without premature conversion
  const [latInput, setLatInput] = useState<string>(isValidLatLng(lat, lng) ? String(lat) : '');
  const [lngInput, setLngInput] = useState<string>(isValidLatLng(lat, lng) ? String(lng) : '');

  // Default coordinate if none provided (Ponajan/East Java region)
  const defaultLat = -7.15;
  const defaultLng = 113.48;

  const currentLat = isValidLatLng(lat, lng) ? lat : defaultLat;
  const currentLng = isValidLatLng(lat, lng) ? lng : defaultLng;
  const hasValidPosition = isValidLatLng(lat, lng);

  // Helper to switch Leaflet tile layers dynamically
  const applyTileLayer = (map: L.Map, mode: 'satellite' | 'street') => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    if (mode === 'satellite') {
      // Google Maps Hybrid: Crystal clear satellite imagery with roads and building landmarks
      const satLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 20,
        attribution: '&copy; Citra Satelit Hybrid'
      }).addTo(map);
      tileLayerRef.current = satLayer;
    } else {
      // Standard OpenStreetMap street layout
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      tileLayerRef.current = streetLayer;
    }
  };

  // Create custom Maroon Pin icon with high-contrast shadow and white border for satellite visibility
  const createMaroonPinIcon = () => {
    return L.divIcon({
      className: 'custom-leaflet-maroon-pin',
      html: `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
          <div style="
            position: absolute;
            top: 2px;
            left: 2px;
            width: 30px;
            height: 30px;
            background-color: #800020;
            border: 3px solid #ffffff;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0,0,0,0.25);
          "></div>
          <div style="
            position: absolute;
            top: 11px;
            left: 11px;
            width: 10px;
            height: 10px;
            background-color: #ffffff;
            border-radius: 50%;
            z-index: 2;
          "></div>
          <div style="
            position: absolute;
            bottom: -3px;
            left: 12px;
            width: 10px;
            height: 4px;
            background: rgba(0,0,0,0.5);
            border-radius: 50%;
            filter: blur(1.5px);
          "></div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -34]
    });
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const initialZoom = hasValidPosition ? 17 : 13;
    const map = L.map(mapContainerRef.current, {
      center: [currentLat, currentLng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false
    });

    // Default to Satellite View for crisp aerial rooftop/tower spotting
    applyTileLayer(map, 'satellite');

    // Initial Marker
    const marker = L.marker([currentLat, currentLng], {
      icon: createMaroonPinIcon(),
      draggable: true
    }).addTo(map);

    // Initial Circle (Toleransi Radius) with high-contrast outline on satellite
    const circle = L.circle([currentLat, currentLng], {
      radius: radiusMeter,
      color: '#f43f5e',
      fillColor: '#e11d48',
      fillOpacity: 0.22,
      weight: 2,
      dashArray: '5, 5'
    }).addTo(map);

    if (hasValidPosition) {
      marker.bindPopup(`<b>${serverName}</b><br><span style="font-size: 11px;">Radius Toleransi: ${radiusMeter}m</span>`).openPopup();
    }

    // Handle marker dragend
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      setLatInput(formatCoordinate(pos.lat));
      setLngInput(formatCoordinate(pos.lng));
      onChange(pos.lat, pos.lng);
    });

    // Handle map click
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      circle.setLatLng(e.latlng);
      setLatInput(formatCoordinate(e.latlng.lat));
      setLngInput(formatCoordinate(e.latlng.lng));
      onChange(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    // Force map to adapt to container after short delay
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Update marker and circle position when props change externally
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !circleRef.current) return;
    if (!isValidLatLng(lat, lng)) return;

    const currentPos = markerRef.current.getLatLng();
    if (Math.abs(currentPos.lat - lat) > 0.00001 || Math.abs(currentPos.lng - lng) > 0.00001) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.panTo([lat, lng]);
      setLatInput(formatCoordinate(lat));
      setLngInput(formatCoordinate(lng));
    }
    circleRef.current.setRadius(radiusMeter);
  }, [lat, lng, radiusMeter]);

  // Handler for Geolocation GPS
  const handleGetDeviceLocation = () => {
    if (!navigator.geolocation) {
      setLocateError('Browser / perangkat tidak mendukung sensor GPS.');
      return;
    }

    setIsLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;

        setLatInput(formatCoordinate(newLat));
        setLngInput(formatCoordinate(newLng));
        onChange(newLat, newLng);

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
          circleRef.current.setLatLng([newLat, newLng]);
          mapInstanceRef.current.setView([newLat, newLng], 18);
          markerRef.current.bindPopup(`<b>Lokasi GPS Terdeteksi!</b><br>Akurasi: ±${Math.round(pos.coords.accuracy)}m`).openPopup();
        }
      },
      (err) => {
        setIsLocating(false);
        setLocateError(`Gagal mendapatkan GPS: ${err.message}. Pastikan izin lokasi aktif.`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Handler for pasting coordinates from Google Maps
  const handlePasteCoordinate = (val: string) => {
    setPasteInput(val);
    if (!val.trim()) return;

    const parsed = parseCoordinatePair(val);
    if (parsed) {
      setLatInput(formatCoordinate(parsed.lat));
      setLngInput(formatCoordinate(parsed.lng));
      onChange(parsed.lat, parsed.lng);

      if (mapInstanceRef.current && markerRef.current && circleRef.current) {
        markerRef.current.setLatLng([parsed.lat, parsed.lng]);
        circleRef.current.setLatLng([parsed.lat, parsed.lng]);
        mapInstanceRef.current.setView([parsed.lat, parsed.lng], 18);
      }
      setPasteSuccess(true);
      setTimeout(() => setPasteSuccess(false), 3000);
      setLocateError(null);
    }
  };

  // Manual Lat change
  const handleLatBlur = () => {
    const parsedLat = parseCoordinate(latInput);
    const parsedLng = parseCoordinate(lngInput);
    if (isValidLatLng(parsedLat, parsedLng)) {
      onChange(parsedLat, parsedLng);
      if (mapInstanceRef.current && markerRef.current && circleRef.current) {
        markerRef.current.setLatLng([parsedLat, parsedLng]);
        circleRef.current.setLatLng([parsedLat, parsedLng]);
        mapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  // Manual Lng change
  const handleLngBlur = () => {
    const parsedLat = parseCoordinate(latInput);
    const parsedLng = parseCoordinate(lngInput);
    if (isValidLatLng(parsedLat, parsedLng)) {
      onChange(parsedLat, parsedLng);
      if (mapInstanceRef.current && markerRef.current && circleRef.current) {
        markerRef.current.setLatLng([parsedLat, parsedLng]);
        circleRef.current.setLatLng([parsedLat, parsedLng]);
        mapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <label className="block text-slate-800 font-extrabold text-xs flex items-center space-x-1.5">
          <MapPin className="w-3.5 h-3.5 text-maroon-800" />
          <span>Pin Titik Peta & Koordinat GPS Server</span>
          <span className="text-rose-500">*</span>
        </label>
        
        <button
          type="button"
          onClick={handleGetDeviceLocation}
          disabled={isLocating}
          className="inline-flex items-center space-x-1 text-[11px] font-bold text-maroon-800 hover:text-maroon-900 bg-maroon-50 hover:bg-maroon-100 border border-maroon-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-50"
        >
          <Navigation className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
          <span>{isLocating ? 'Mencari GPS...' : 'Gunakan GPS HP / Saat Ini'}</span>
        </button>
      </div>

      {/* Paste from Google Maps input bar */}
      <div className="relative">
        <input
          type="text"
          value={pasteInput}
          onChange={e => handlePasteCoordinate(e.target.value)}
          placeholder="Tempel dari Google Maps (misal: -7.051234, 113.851234 atau link Maps)"
          className="w-full text-[11px] pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-maroon-800 focus:bg-white text-slate-800 placeholder:text-slate-400 font-medium"
        />
        <Compass className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        {pasteSuccess && (
          <span className="absolute right-2.5 top-2 text-[10px] text-emerald-600 font-bold flex items-center space-x-0.5">
            <Check className="w-3 h-3" />
            <span>Terpasang!</span>
          </span>
        )}
      </div>

      {locateError && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700 flex items-start space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{locateError}</span>
        </div>
      )}

      {/* Leaflet Map Stage with Satellite & Street Layer Toggle */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-300 shadow-md">
        <div
          ref={mapContainerRef}
          className="h-56 sm:h-64 w-full bg-slate-800 z-10"
        />

        {/* Floating Layer Switcher (Satelit vs Jalan) */}
        <div className="absolute top-2.5 right-2.5 z-20">
          <div className="flex items-center bg-slate-900/85 backdrop-blur-md p-1 rounded-xl shadow-lg border border-white/20">
            <button
              type="button"
              onClick={() => {
                setMapMode('satellite');
                if (mapInstanceRef.current) applyTileLayer(mapInstanceRef.current, 'satellite');
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all flex items-center space-x-1 cursor-pointer ${
                mapMode === 'satellite'
                  ? 'bg-maroon-700 text-white shadow-sm ring-1 ring-white/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🛰️ Satelit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMapMode('street');
                if (mapInstanceRef.current) applyTileLayer(mapInstanceRef.current, 'street');
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all flex items-center space-x-1 cursor-pointer ${
                mapMode === 'street'
                  ? 'bg-maroon-700 text-white shadow-sm ring-1 ring-white/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🗺️ Jalan</span>
            </button>
          </div>
        </div>

        {/* Floating guidance overlay */}
        <div className="absolute bottom-2 left-2 right-2 z-20 pointer-events-none">
          <div className="bg-slate-900/85 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-[10px] flex items-center justify-between shadow-md border border-white/10">
            <span className="font-medium">📍 Geser pin merah tepat di atas atap rumah / tower server</span>
            <span className="font-bold text-emerald-300 ml-2 whitespace-nowrap">Radius: {radiusMeter}m</span>
          </div>
        </div>
      </div>

      {/* Synchronized Latitude & Longitude Manual Inputs */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div>
          <label className="block text-slate-600 text-[10px] font-bold mb-0.5">
            Latitude (Garis Lintang)
          </label>
          <input
            type="text"
            required
            value={latInput}
            onChange={e => {
              const val = e.target.value;
              setLatInput(val);
              const pLat = parseCoordinate(val);
              const pLng = parseCoordinate(lngInput);
              if (isValidLatLng(pLat, pLng)) {
                onChange(pLat, pLng);
                if (mapInstanceRef.current && markerRef.current && circleRef.current) {
                  markerRef.current.setLatLng([pLat, pLng]);
                  circleRef.current.setLatLng([pLat, pLng]);
                }
              }
            }}
            onBlur={handleLatBlur}
            placeholder="-7.123456"
            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-maroon-800 focus:bg-white"
          />
        </div>

        <div>
          <label className="block text-slate-600 text-[10px] font-bold mb-0.5">
            Longitude (Garis Bujur)
          </label>
          <input
            type="text"
            required
            value={lngInput}
            onChange={e => {
              const val = e.target.value;
              setLngInput(val);
              const pLat = parseCoordinate(latInput);
              const pLng = parseCoordinate(val);
              if (isValidLatLng(pLat, pLng)) {
                onChange(pLat, pLng);
                if (mapInstanceRef.current && markerRef.current && circleRef.current) {
                  markerRef.current.setLatLng([pLat, pLng]);
                  circleRef.current.setLatLng([pLat, pLng]);
                }
              }
            }}
            onBlur={handleLngBlur}
            placeholder="113.851234"
            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-maroon-800 focus:bg-white"
          />
        </div>
      </div>

      {!hasValidPosition && (
        <p className="text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-lg p-1.5">
          ⚠️ Koordinat server belum ditentukan. Klik pada peta satelit atau gunakan tombol GPS untuk menetapkan lokasi server.
        </p>
      )}
    </div>
  );
};

