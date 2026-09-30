/**
 * Module A - Geospatial exploration & reserve mapping (geologist / admin).
 *
 * Workflow: pick a pre-defined MOIL block or draw a custom polygon, run the
 * analysis, then read the AI breakdown in the side panel with the colour-coded
 * suitability heatmap rendered on the map.
 */

import { useCallback, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';

import MiningBlocks from '../components/map/MiningBlocks.jsx';
import { DrawClickCapture, PolygonDraft, usePolygonDrawer } from '../components/map/PolygonDrawer.jsx';
import SuitabilityHeatmap from '../components/map/SuitabilityHeatmap.jsx';
import ZoneAnalysisPanel from '../components/map/ZoneAnalysisPanel.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { MINING_BLOCKS, blockCenter, blockToGeoJSON } from '../data/miningBlocks.js';
import { analyzeZone } from '../lib/exploration.js';

const INITIAL_CENTER = [22.23, 79.1]; // Balaghat, Madhya Pradesh
const INITIAL_ZOOM = 9;

// Satellite basemap. Overridable via VITE_MAP_TILE_URL in `.env` so a
// deployment can point at a different tile provider without a code change.
const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ??
  'Tiles &copy; Esri - Source: Esri, Maxar, Earthstar Geographics';

/** Keeps the viewport aligned with whatever the user is working on. */
function MapController({ focus }) {
  const map = useMap();
  if (focus) map.flyTo(focus.center, focus.zoom, { duration: 0.8 });
  return null;
}

export default function MapPage() {
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [focus, setFocus] = useState(null);
  const [gridResolution, setGridResolution] = useState(12);

  const drawer = usePolygonDrawer();

  const resetAnalysis = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  function selectBlock(block) {
    drawer.cancel();
    setSelectedBlock(block.id);
    setResult(null);
    setError(null);
    setFocus({ center: blockCenter(block), zoom: 10 });
  }

  function startDrawing() {
    setSelectedBlock(null);
    setResult(null);
    setError(null);
    drawer.start();
  }

  async function runAnalysis() {
    let geometry = null;
    let name = '';

    if (selectedBlock) {
      const block = MINING_BLOCKS.find((b) => b.id === selectedBlock);
      geometry = blockToGeoJSON(block);
      name = block.name;
    } else if (drawer.canClose) {
      geometry = drawer.toGeoJSON();
      name = `Custom zone ${new Date().toLocaleDateString('en-IN')}`;
    }

    if (!geometry) {
      setError('Select a mining block on the map, or draw a polygon with at least 3 points.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // `analyzeZone` returns the full axios response, so unwrap `.data` before
      // it reaches the panel - otherwise every result field reads as undefined.
      const { data } = await analyzeZone({ name, geometry, gridResolution });
      setResult(data);
      drawer.cancel();
    } catch (err) {
      setError(err.userMessage ?? 'Zone analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  const canAnalyze = Boolean(selectedBlock) || drawer.canClose;

  return (
    <div className="flex h-full flex-col gap-4 xl:flex-row">

      {/* Controls */}
      <div className="w-full shrink-0 space-y-3 xl:w-80">
        <div className="card space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Reserve Exploration</h2>
            <p className="text-sm text-slate-500">
              Analyse a mining lease block for lateritic manganese.
            </p>
          </div>

          <div>
            <label htmlFor="blockSelect" className="mb-1.5 block text-sm font-medium text-slate-700">
              Mining block
            </label>
            <select
              id="blockSelect"
              value={selectedBlock ?? ''}
              onChange={(e) => {
                const block = MINING_BLOCKS.find((b) => b.id === e.target.value);
                if (block) selectBlock(block);
                else {
                  drawer.cancel();
                  setSelectedBlock(null);
                  setResult(null);
                }
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">-- Draw custom polygon --</option>
              {MINING_BLOCKS.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name} ({block.district})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={startDrawing} disabled={loading}>
              {drawer.isDrawing ? 'Restart drawing' : 'Draw polygon'}
            </Button>
            {drawer.points.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={drawer.undo} disabled={loading}>
                  Undo point
                </Button>
                <Button variant="ghost" size="sm" onClick={drawer.clear} disabled={loading}>
                  Clear
                </Button>
              </>
            )}
          </div>

          {drawer.isDrawing && (
            <Alert tone="info">
              Click the map to place points. {drawer.points.length} placed - 3 minimum.
            </Alert>
          )}

          <div>
            <label
              htmlFor="gridRes"
              className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700"
            >
              Heatmap resolution
              <span className="font-mono text-xs text-slate-500">
                {gridResolution} x {gridResolution}
              </span>
            </label>
            <input
              id="gridRes"
              type="range"
              min="6"
              max="16"
              step="2"
              value={gridResolution}
              onChange={(e) => setGridResolution(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Higher resolution means more Earth Engine work and a slower analysis.
            </p>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            <span className="text-sm text-slate-700">Show heatmap overlay</span>
          </label>

          <Button className="w-full" onClick={runAnalysis} loading={loading} disabled={!canAnalyze}>
            Analyze Zone
          </Button>

          {!canAnalyze && !loading && (
            <p className="text-center text-xs text-slate-400">
              Select a block or draw a polygon to enable analysis.
            </p>
          )}
        </div>

        <ZoneAnalysisPanel
          result={result}
          loading={loading}
          error={error}
          onClose={resetAnalysis}
          onClear={() => {
            resetAnalysis();
            drawer.clear();
          }}
        />
      </div>

      {/* Map */}
      <div className="min-h-[32rem] flex-1 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <MapContainer
          center={INITIAL_CENTER}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            maxZoom={19}
          />

          <MapController focus={focus} />

          <MiningBlocks selectedId={selectedBlock} onSelect={selectBlock} />

          <DrawClickCapture active={drawer.isDrawing} onAdd={drawer.addPoint} />
          <PolygonDraft points={drawer.points} isDrawing={drawer.isDrawing} />

          {result && (
            <SuitabilityHeatmap
              cells={result.heatmap ?? []}
              boundary={result.boundary?.coordinates?.[0] ?? []}
              visible={showHeatmap}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
