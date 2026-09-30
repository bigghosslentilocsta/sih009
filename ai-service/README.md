# ai-service — SIH 26009

FastAPI service for **manganese reserve identification** and **production
shortfall prediction**. Owns all Earth Engine / raster analysis; the Node
backend and the React frontend never talk to GEE directly.

## Layout

```
ai-service/
├── main.py                     # FastAPI app factory + / , /health , /api/v1/status
├── requirements.txt
├── .env.example
├── app/
│   ├── config.py               # pydantic-settings; GEE_PROJECT lives here
│   ├── models/schemas.py       # Pydantic response models
│   ├── routers/gee.py          # /api/v1/gee/*
│   └── services/gee_client.py  # lazy, thread-safe ee.Initialize()
└── scripts/gee_sample.py       # runnable GEE smoke test
```

## Setup

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

## Run

```powershell
uvicorn main:app --reload --port 8000
```

- Swagger UI → <http://localhost:8000/docs>
- Health → <http://localhost:8000/health>

## Earth Engine

The quota project is configured once in `app/config.py` (and overridable via
`GEE_PROJECT`):

```
GEE_PROJECT=gen-lang-client-0167226131
```

Authentication is **lazy** — the server starts instantly and only contacts
Google Earth Engine on the first request that needs it.

One-time local auth (run once per machine):

```powershell
earthengine authenticate
```

For CI/headless environments, set `GEE_SERVICE_ACCOUNT_KEYFILE` to a service
account JSON path instead.

### Verify the connection

```powershell
python scripts/gee_sample.py
```

### Endpoints

| Method | Path                         | Description                          |
| ------ | ---------------------------- | ------------------------------------ |
| GET    | `/`                          | Service banner                       |
| GET    | `/health`                    | Liveness probe                       |
| GET    | `/api/v1/status`             | Service + Earth Engine status        |
| GET    | `/api/v1/gee/status`         | Earth Engine session status          |
| GET    | `/api/v1/gee/elevation`      | SRTM elevation sample (`lat`, `lon`) |
| POST   | `/api/v1/analyze-zone`       | Module A — analyse a GeoJSON polygon |
| POST   | `/api/v1/operations/risk`    | Module B — production shortfall risk |

## Module A — Manganese suitability (`/api/v1/analyze-zone`)

POST a GeoJSON Polygon and get a 0–100 suitability score with the spectral
proxies behind it.

```jsonc
// request
{
  "name": "Balaghat Block",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[79.05,22.15],[79.25,22.15],[79.25,22.32],[79.05,22.32],[79.05,22.15]]]
  },
  "grid_resolution": 12,      // 4-40, cells per axis for the heatmap
  "cloud_cover_max": 20,      // % cloud per Sentinel-2 scene
  "years_history": 2,
  "allow_simulation_fallback": true
}
```

`Feature` and `FeatureCollection` are unwrapped automatically, so you can post
a block straight from a map editor.

```jsonc
// response (trimmed)
{
  "zone_id": "zone_e624533b3c78",
  "suitability_score": 47.47,
  "classification": "moderate",
  "confidence_level": "high",
  "confidence_score": 0.85,
  "data_source": "earth_engine",       // or "simulated"
  "geological_indicators": {
    "iron_oxide_ratio": 1.7714,         // B4/B2  - ferric iron
    "clay_index": -0.0116,              // (B11-B8)/(B11+B8)
    "ndvi": 0.3896,
    "red_edge_ratio": 1.05,
    "elevation_m": 721.0,
    "slope_deg": 2.65,
    "band_means": { "B2": 0.043, "...": 0.0 }
  },
  "breakdown": { "iron_oxide": 48.2, "clay_mineral": 27.9,
                 "vegetation_exposure": 32.1, "terrain": 100.0 },
  "area_km2": 388.17,
  "heatmap": [{ "lat": 22.31, "lng": 79.06, "score": 50.35 }],
  "boundary": { "type": "Polygon", "coordinates": [[[...]]] },
  "recommendation": "..."
}
```

### How the score is built

Four factors, weighted (`WEIGHTS` in `mineral_suitability.py`):

| Factor            | Weight | Proxy                        | Better when |
| ----------------- | ------ | ---------------------------- | ----------- |
| Iron oxide ratio  | 40%    | B4 / B2                      | **higher**  |
| Clay mineral      | 30%    | (B11−B8) / (B11+B8)          | **lower** (clay absorbs at 2.1 µm) |
| Vegetation        | 15%    | NDVI                         | **lower** (canopy buries laterite) |
| Terrain           | 15%    | SRTM slope                   | **lower** (gentle = easier mining) |

### Data source & confidence

- `data_source: "earth_engine"` — real cloud-filtered Sentinel-2 SR median
  composite plus SRTM 30 m terrain.
- `data_source: "simulated"` — Earth Engine failed; a deterministic model
  seeded from the polygon centroid is used instead. The same zone always returns
  the same numbers, but the result is **capped at low confidence** and flagged
  in the response and the UI. Never use it for decisions.
- Working resolution adapts to zone area (`SCALE_LADDER`) so large blocks stay
  inside Earth Engine's `maxPixels` budget.
- Expect **30–60 s** per call. The backend client times out at 120 s.

### Validation

Self-intersecting ("bowtie") polygons are repaired with `buffer(0)`;
zero-area, non-Polygon, out-of-range and oversized geometries are rejected with
422. Limits: 2000 vertices, 5000 km².

## Module B - Production shortfall risk (`/api/v1/operations/risk`)

The Express backend aggregates MongoDB (fleet + production history) and the
OpenWeatherMap forecast, then posts the result here for scoring.

```jsonc
// request
{
  "weather":  [{ "date": "2026-10-01", "rainfall_mm": 38.0, "description": "heavy rain" }],
  "equipment": [{ "machine_id": "SHV-03", "type": "Shovel", "status": "down",
                  "days_until_maintenance": -3, "failure_probability": 1.0 }],
  "historical_attainment_pct": 90.1,
  "daily_target_tonnes": 900,
  "horizon_days": 7,
  "scenario": { "covered_pit_fraction": 0.5, "labor_shift_fraction": 0.4,
                "maintenance_acceleration": 0.6, "fleet_surge_fraction": 0.3 }
}
```

### The model

A transparent weighted sum, not a black box:

```
shortfall = (100 - historical_attainment)
          + 30.0 * weather_index      * (1 - 0.65 * covered_pit_fraction)
          + 24.0 * equipment_pressure * (1 - 0.70 * maintenance_acceleration)
          - 5.0  * labor_shift_fraction
          - 7.0  * fleet_surge_fraction
```

- `weather_index` blends the **peak** day and the window **mean** of
  `rainfall_mm / 50`, so one severe day registers but so does a wet week.
- `equipment_pressure` blends the unavailable share (50%), mean failure
  probability (35%) and the share due/overdue for maintenance (15%).

Risk bands: `<10 low` � `<25 moderate` � `<45 high` � `>=45 critical`.

### The coefficients are part of the response

`model_coefficients` returns every weight used above. The dashboard's scenario
simulator recomputes projections locally from those values - so the sliders
react instantly instead of issuing a request per drag, and the browser can
never drift from the service. This is verified by an automated parity test
(client mirror vs. server, delta < 0.01pp).

`daily_projection` is a dense, contiguous date series - OpenWeatherMap's
3-hourly slots are re-binned to consecutive days, and missing days are treated
as dry rather than dropped.
