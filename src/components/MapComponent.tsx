import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, MapPin, Navigation, Loader2 } from 'lucide-react';

// Beautiful SVG-based Leaflet custom markers
const redPinIcon = L.divIcon({
  className: 'custom-red-pin',
  html: `
    <div class="relative flex flex-col items-center">
      <div class="w-8 h-8 bg-rose-600 rounded-full shadow-lg flex items-center justify-center text-white border-2 border-white animate-bounce-short">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
          <circle cx="12" cy="10" r="3" fill="white"/>
        </svg>
      </div>
      <div class="w-2 h-2 bg-rose-600 rotate-45 -mt-1 shadow-md"></div>
    </div>
  `,
  iconSize: [32, 38],
  iconAnchor: [16, 38],
});

interface MapComponentProps {
  lat: number;
  lng: number;
  address: string;
  onChange: (lat: number, lng: number, address: string) => void;
  draggable?: boolean;
}

// Controller component to pan/zoom map smoothly when external lat/lng changes
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 16);
  }, [center, map]);
  return null;
}

export default function MapComponent({
  lat,
  lng,
  address,
  onChange,
  draggable = true,
}: MapComponentProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search address using Nominatim Search API
  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&addressdetails=1`
        );
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
        }
      } catch (err) {
        console.error('Nominatim search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 600);
  };

  const selectSuggestion = (item: any) => {
    const itemLat = parseFloat(item.lat);
    const itemLng = parseFloat(item.lon);
    const itemAddress = item.display_name;
    
    onChange(itemLat, itemLng, itemAddress);
    setSearchQuery(itemAddress);
    setSuggestions([]);
  };

  // Reverse Geocoding using Nominatim
  const performReverseGeocoding = async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    setErrorMsg('');
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
      );
      if (response.ok) {
        const data = await response.json();
        const displayAddress = data.display_name || `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
        onChange(latitude, longitude, displayAddress);
        setSearchQuery(displayAddress);
      } else {
        onChange(latitude, longitude, `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`);
      }
    } catch (err) {
      console.error('Reverse geocoding failed:', err);
      onChange(latitude, longitude, `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Click handler on map
  const MapEventsHandler = () => {
    useMapEvents({
      click(e) {
        if (!draggable) return;
        performReverseGeocoding(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  // Drag handler on Marker
  const markerRef = useRef<any>(null);
  const eventHandlers = React.useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          performReverseGeocoding(latLng.lat, latLng.lng);
        }
      },
    }),
    [draggable]
  );

  // Fetch current GPS location
  const locateUser = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser');
      return;
    }

    setIsGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        performReverseGeocoding(userLat, userLng);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setErrorMsg('Could not fetch current location. Please search manually.');
        setIsGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative w-full h-[450px] border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
      {/* Search Bar Overlay */}
      {draggable && (
        <div className="absolute top-3 left-3 right-3 z-[1000] max-w-md bg-white rounded-lg shadow-md border border-gray-100 p-1 flex flex-col">
          <div className="flex items-center px-2 py-1 gap-2">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search address or landmark..."
              value={searchQuery}
              onChange={handleSearchInput}
              className="flex-1 bg-transparent border-0 outline-none focus:ring-0 text-sm text-gray-800 placeholder-gray-400 py-1"
            />
            {isSearching && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
            <button
              type="button"
              onClick={locateUser}
              title="Use current GPS location"
              className="p-1.5 hover:bg-gray-50 rounded-full transition-colors text-blue-600 shrink-0"
            >
              <Navigation className="w-4 h-4 fill-current" />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="border-t border-gray-100 max-h-52 overflow-y-auto mt-1">
              {suggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectSuggestion(item)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-start gap-2 text-gray-700 transition-colors border-b border-gray-50 last:border-b-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <span className="truncate">{item.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Geocoding State HUD */}
      {isGeocoding && (
        <div className="absolute top-16 left-3 z-[1000] bg-white/95 px-3 py-1.5 rounded-md shadow-sm border border-gray-100 flex items-center gap-2 text-xs text-blue-600 font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Syncing location details...</span>
        </div>
      )}

      {/* Error Banner Overlay */}
      {errorMsg && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-md shadow-sm text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Actual Map Container */}
      <div className="flex-1 w-full h-full">
        <MapContainer
          center={[lat, lng]}
          zoom={14}
          zoomControl={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEventsHandler />
          <ChangeView center={[lat, lng]} />
          <Marker
            position={[lat, lng]}
            icon={redPinIcon}
            draggable={draggable}
            eventHandlers={eventHandlers}
            ref={markerRef}
          />
        </MapContainer>
      </div>

      {/* Map Footer showing selected coordinate status */}
      <div className="bg-gray-50 border-t border-gray-100 px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 font-mono">
        <div className="flex items-center gap-1.5 truncate">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate max-w-[280px] sm:max-w-md font-sans text-gray-600 font-medium">{address || 'No location marked'}</span>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span>LAT: <span className="text-gray-700 font-semibold">{lat.toFixed(6)}</span></span>
          <span>LNG: <span className="text-gray-700 font-semibold">{lng.toFixed(6)}</span></span>
        </div>
      </div>
    </div>
  );
}
