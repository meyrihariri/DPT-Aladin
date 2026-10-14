/**
 * Helper utilities for parsing and formatting GPS coordinates
 * Supports various Indonesian & International formats:
 * - Comma or dot decimals: "-7,051234" or "-7.051234"
 * - Coordinate pairs: "-7.051234, 113.851234" or "-7,051234, 113,851234"
 * - Google Maps URL or search strings
 */

export function parseCoordinate(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? fallback : val;
  }
  const str = String(val).trim();
  if (!str) return fallback;

  // Replace comma with dot for decimal
  const cleaned = str.replace(/,/g, '.');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || !isFinite(parsed)) return fallback;
  return parsed;
}

export function parseCoordinatePair(rawInput: string): { lat: number; lng: number } | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const input = rawInput.trim();

  // Pattern 1: URL containing @lat,lng e.g. https://www.google.com/maps/@-7.051234,113.851234,17z
  const urlAtMatch = input.match(/@(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/);
  if (urlAtMatch) {
    const lat = parseCoordinate(urlAtMatch[1]);
    const lng = parseCoordinate(urlAtMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Pattern 2: URL containing q=lat,lng or ll=lat,lng
  const urlParamMatch = input.match(/[?&](?:q|ll)=(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/);
  if (urlParamMatch) {
    const lat = parseCoordinate(urlParamMatch[1]);
    const lng = parseCoordinate(urlParamMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Pattern 3: Standard pair "-7.051234, 113.851234" or "-7,051234, 113,851234"
  // Handles comma separating the two numbers, even if decimals also use commas or dots
  // If format is -7,051234, 113,851234 (two commas), split by comma followed by space or comma near middle
  const parts = input.split(/\s*,\s*|\s+/);
  if (parts.length >= 2) {
    // If separated by comma followed by space:
    const lat = parseCoordinate(parts[0]);
    const lng = parseCoordinate(parts[1]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Pattern 4: Regex for two signed float numbers separated by comma, semicolon or space
  const pairMatch = input.match(/(-?\d+(?:[.,]\d+)?)[,\s;]+(-?\d+(?:[.,]\d+)?)/);
  if (pairMatch) {
    const lat = parseCoordinate(pairMatch[1]);
    const lng = parseCoordinate(pairMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function formatCoordinate(val: number, decimals = 6): string {
  if (val === null || val === undefined || isNaN(val)) return '0.000000';
  return Number(val).toFixed(decimals);
}
