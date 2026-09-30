/**
 * Colour-coded suitability heatmap + the analysed zone outline.
 *
 * Renders one translucent square per grid cell returned by the ai-service,
 * coloured on the shared suitability ramp, plus the zone boundary on top.
 */

import { Polygon, Rectangle } from 'react-leaflet';

import { scoreColor } from './suitability.js';

/** Approximate degree size of a cell so the squares tile without gaps. */
const estimateCellSize = (cells) => {
  if (cells.length < 2) return 0.01;
  const lats = cells.map((c) => c.lat);
  const lngs = cells.map((c) => c.lng);
  const latStep = Math.min(...lats.map((l) => Math.abs(l - lats[0]))) || 0.01;
  const lngStep = Math.min(...lngs.map((l) => Math.abs(l - lngs[0]))) || 0.01;
  return Math.max(latStep, lngStep) * 0.95; // slight overlap avoids hairline gaps
};

export default function SuitabilityHeatmap({ cells = [], boundary = [], visible = true }) {
  if (!visible || cells.length === 0) return null;

  const size = estimateCellSize(cells);
  const half = size / 2;

  return (
    <>
      {cells.map((cell, index) => (
        <Rectangle
          key={`${cell.lat}-${cell.lng}-${index}`}
          bounds={[
            [cell.lat - half, cell.lng - half],
            [cell.lat + half, cell.lng + half],
          ]}
          pathOptions={{
            color: scoreColor(cell.score),
            weight: 0.5,
            opacity: 0.35,
            fillColor: scoreColor(cell.score),
            fillOpacity: 0.55,
          }}
          interactive={false}
        />
      ))}

      {/* Zone outline drawn above the cells */}
      {boundary.length >= 3 && (
        <Polygon
          positions={boundary.map(([lng, lat]) => [lat, lng])}
          pathOptions={{ color: '#ffffff', weight: 2.5, opacity: 0.95, dashArray: '6 4' }}
          interactive={false}
        />
      )}
    </>
  );
}
