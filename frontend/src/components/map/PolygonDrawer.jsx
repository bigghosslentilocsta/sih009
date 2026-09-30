/**
 * Freehand polygon drawing built on native Leaflet map events.
 *
 * Deliberately dependency-free: `leaflet-draw` / `react-leaflet-draw` are
 * unmaintained for React 18, and the behaviour needed here is small.
 *
 * Usage:
 *   const draw = usePolygonDrawer();
 *   <MapContainer ...>{draw.isDrawing && <DrawClickCapture onAdd={draw.addPoint} />}</MapContainer>
 */

import { useCallback, useMemo, useState } from 'react';
import { CircleMarker, Polygon, Polyline, useMapEvents } from 'react-leaflet';

/** Invisible click target used only while drawing. */
function DrawClickCapture({ onAdd, active }) {
  useMapEvents({
    click(event) {
      if (active) onAdd([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function usePolygonDrawer() {
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);

  const start = useCallback(() => {
    setPoints([]);
    setIsDrawing(true);
  }, []);

  const cancel = useCallback(() => {
    setPoints([]);
    setIsDrawing(false);
  }, []);

  const addPoint = useCallback((point) => {
    setPoints((current) => [...current, point]);
  }, []);

  const undo = useCallback(() => {
    setPoints((current) => current.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setPoints([]);
  }, []);

  // A valid polygon needs at least 3 distinct points.
  const canClose = points.length >= 3;

  const toGeoJSON = useCallback(() => {
    if (points.length < 3) return null;
    // GeoJSON requires the ring to be explicitly closed.
    const ring = [...points, points[0]];
    return { type: 'Polygon', coordinates: [ring] };
  }, [points]);

  const bounds = useMemo(
    () => (points.length ? points.map(([lat, lng]) => [lat, lng]) : null),
    [points],
  );

  return {
    isDrawing,
    points,
    canClose,
    bounds,
    start,
    cancel,
    addPoint,
    undo,
    clear,
    toGeoJSON,
    setPoints,
  };
}

export { DrawClickCapture };

/** Live preview of the polygon being drawn. */
export function PolygonDraft({ points, isDrawing, color = '#38bdf8' }) {
  if (points.length === 0) return null;

  const positions = points.map(([lat, lng]) => [lat, lng]);
  const closed = points.length >= 3;

  return (
    <>
      {/* Vertex handles */}
      {points.map((point, index) => (
        <CircleMarker
          key={`${point[0]}-${point[1]}-${index}`}
          center={point}
          radius={4}
          pathOptions={{ color, weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
          interactive={false}
        />
      ))}

      {closed ? (
        <Polygon
          positions={positions}
          pathOptions={{ color, weight: 2, dashArray: '5 4', fillColor: color, fillOpacity: 0.1 }}
          interactive={false}
        />
      ) : (
        <Polyline
          positions={positions}
          pathOptions={{ color, weight: 2, dashArray: '5 4' }}
          interactive={false}
        />
      )}

      {isDrawing && !closed && (
        <text
          x={points[0][1]}
          y={points[0][0]}
          fill="#fff"
          fontSize="12"
          style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 }}
        >
          {points.length} point{points.length === 1 ? '' : 's'}
        </text>
      )}
    </>
  );
}
