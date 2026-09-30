"""
Manganese (lateritic) suitability engine for Module A.

Pipeline
--------
1. Validate + normalise the submitted GeoJSON polygon (shapely / geopandas).
2. Rasterise the polygon onto a coarse analysis grid (rasterio) to build a
   cell mask, and reproject to a UTM CRS for a correct area (geopandas).
3. Build a cloud-filtered Sentinel-2 SR median composite and reduce it over the
   zone (Earth Engine, project from `app.config`).
4. Derive spectral proxies: iron-oxide ratio, clay index, NDVI, red-edge ratio,
   plus SRTM elevation and slope.
5. Blend the factors into a 0-100 suitability score, grade the confidence, and
   emit a per-cell heatmap grid.

If Earth Engine is unavailable the engine falls back to a *deterministic*
pseudo-spectral model seeded from the polygon centroid, so the same zone always
produces the same result. Fallback results are always tagged
`data_source="simulated"` and can never claim high confidence.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from rasterio.windows import Window
from rasterio.windows import bounds as window_bounds
from shapely.geometry import Polygon, shape
from shapely.geometry.base import BaseGeometry

from app.services.gee_client import GEEInitializationError, get_ee

logger = logging.getLogger(__name__)

# Sentinel-2 surface reflectance band ids used by the model.
S2_BANDS = ("B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B11", "B12")

# Reflectance scaling: S2 SR values are 0-10000.
REFLECTANCE_SCALE = 10000.0

# Factor weights - must sum to 1.0.
WEIGHTS = {
    "iron_oxide": 0.40,
    "clay_mineral": 0.30,
    "vegetation_exposure": 0.15,
    "terrain": 0.15,
}

# Calibration anchors. `_rescale` maps linearly between them onto 0-100;
# `invert` flips the direction.
#
#   iron oxide  B4/B2 rises with ferric iron content      -> higher is better
#   clay        (B11-B8)/(B11+B8) falls with SWIR1        -> LOWER is better (clay absorbs at 2.1um)
#   vegetation  NDVI rises with biomass; dense canopy      -> higher is worse
IRON_OXIDE_ANCHORS = (1.00, 2.60)  # barren soil -> strongly oxidised laterite
CLAY_ANCHORS = (-0.30, 0.10)  # strong argillic absorption -> bare rock
NDVI_ANCHORS = (0.55, 0.05)  # dense vegetation -> barren (higher NDVI scores lower)
SLOPE_FLAT_DEG = 8.0  # at or below this, terrain is ideal for open-pit access
SLOPE_STEEP_DEG = 33.0  # at or above this, terrain is unsuitable

MAX_ALLOWED_POINTS = 2000
MAX_ALLOWED_AREA_KM2 = 5000.0


class InvalidGeometryError(ValueError):
    """Raised when the submitted GeoJSON cannot be used for analysis."""

# ---------------------------------------------------------------------------
# Geometry handling
# ---------------------------------------------------------------------------
def parse_polygon(geometry: dict[str, Any]) -> Polygon:
    """Validate the incoming GeoJSON and return a Shapely Polygon."""
    if not isinstance(geometry, dict):
        raise InvalidGeometryError("`geometry` must be a GeoJSON object.")

    gtype = geometry.get("type")
    if gtype != "Polygon":
        raise InvalidGeometryError(
            f"Only GeoJSON Polygon geometries are supported, received ''{gtype}''."
        )

    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or not coords:
        raise InvalidGeometryError("Polygon coordinates are missing or malformed.")

    ring = coords[0]
    if not isinstance(ring, list) or len(ring) < 4:
        raise InvalidGeometryError(
            "A polygon ring needs at least 4 positions (first and last identical)."
        )
    if len(ring) > MAX_ALLOWED_POINTS:
        raise InvalidGeometryError(
            f"Polygon has {len(ring)} vertices; the limit is {MAX_ALLOWED_POINTS}."
        )

    for position in ring:
        if not isinstance(position, (list, tuple)) or len(position) < 2:
            raise InvalidGeometryError(f"Invalid coordinate pair: {position!r}")
        lng, lat = float(position[0]), float(position[1])
        if not (-180 <= lng <= 180) or not (-90 <= lat <= 90):
            raise InvalidGeometryError(f"Coordinate out of range: [{lng}, {lat}]")

    polygon = shape(geometry)

    if polygon.area <= 0:
        raise InvalidGeometryError("Polygon has zero area.")

    if not polygon.is_valid:
        # buffer(0) repairs self-intersections ("bowtie") from bad clicks.
        repaired = polygon.buffer(0)
        if repaired.is_empty or repaired.geom_type != "Polygon":
            raise InvalidGeometryError(
                "Polygon is self-intersecting and could not be repaired automatically."
            )
        logger.warning("Repaired a self-intersecting polygon before analysis")
        polygon = repaired

    return polygon


def polygon_stats(polygon: BaseGeometry) -> dict[str, Any]:
    """Area (km2), centroid and bounds, reprojecting for a correct area."""
    gdf = gpd.GeoDataFrame(geometry=[polygon], crs="EPSG:4326")

    # Geopandas >= 0.12 can pick the right UTM zone automatically.
    try:
        utm_crs = gdf.estimate_utm_crs()
    except Exception:  # noqa: BLE001 - fall back to a global equal-area CRS
        utm_crs = "EPSG:7755"

    area_km2 = float(gdf.to_crs(utm_crs).geometry.area.iloc[0] / 1e6)

    if area_km2 > MAX_ALLOWED_AREA_KM2:
        raise InvalidGeometryError(
            f"Zone is {area_km2:.0f} km2; the limit is {MAX_ALLOWED_AREA_KM2:.0f} km2."
        )

    centroid = polygon.centroid
    minx, miny, maxx, maxy = polygon.bounds

    return {
        "area_km2": area_km2,
        "centroid_lat": float(centroid.y),
        "centroid_lng": float(centroid.x),
        "bounds": [float(minx), float(miny), float(maxx), float(maxy)],
    }


def build_grid_mask(polygon: BaseGeometry, resolution: int) -> tuple[np.ndarray, Any, float, int]:
    """Rasterise the polygon onto a ``resolution`` x ``resolution`` grid.

    Returns:
        (mask, transform, cell_size_deg, inside_cell_count)
    """
    minx, miny, maxx, maxy = polygon.bounds
    if maxx - minx <= 0 or maxy - miny <= 0:
        raise InvalidGeometryError("Polygon has a zero-width or zero-height extent.")

    transform = from_bounds(minx, miny, maxx, maxy, resolution, resolution)
    cell_size = max(maxx - minx, maxy - miny) / resolution

    mask = rasterize(
        [(polygon, 1)],
        out_shape=(resolution, resolution),
        transform=transform,
        fill=0,
        dtype="uint8",
        all_touched=False,
    ).astype(bool)

    if not mask.any():
        # Fall back for polygons smaller than the sampling grid.
        mask = rasterize(
            [(polygon, 1)],
            out_shape=(resolution, resolution),
            transform=transform,
            fill=0,
            dtype="uint8",
            all_touched=True,
        ).astype(bool)

    return mask, transform, cell_size, int(mask.sum())

# ---------------------------------------------------------------------------
# Earth Engine data acquisition
# ---------------------------------------------------------------------------
# Earth Engine caps reduceRegion at 1e9 pixels. A fixed scale blows that budget
# on large blocks, so the working resolution is chosen from the zone area.
MAX_PIXELS = 100_000_000  # 1e8, well under the 1e9 hard limit

# (upper area bound km2, resolution in metres)
SCALE_LADDER = ((25.0, 30), (200.0, 60), (2000.0, 120))


def adaptive_scale(area_km2: float) -> int:
    """Pick a working resolution that keeps the pixel count inside MAX_PIXELS."""
    for upper_km2, metres in SCALE_LADDER:
        if area_km2 <= upper_km2:
            return metres
    return 250


def _sentinel_collection(region: Any, cloud_cover_max: int, years_history: int) -> Any:
    """Cloud-filtered Sentinel-2 SR collection clipped to the zone."""
    ee_mod = get_ee()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=int(365 * years_history))
    return (
        ee_mod.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        .filter(ee_mod.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_cover_max))
    )


def _make_composite(region: Any, cloud_cover_max: int, years_history: int) -> Any:
    """Median composite scaled to 0-1 reflectance."""
    return (
        _sentinel_collection(region, cloud_cover_max, years_history)
        .median()
        .select(list(S2_BANDS))
        .divide(REFLECTANCE_SCALE)
    )


def _ee_polygon(polygon: Polygon) -> Any:
    """Shapely -> ee.Geometry, with best-effort reprojection for large zones."""
    mapping = polygon.__geo_interface__
    return get_ee().Geometry(mapping).transform(maxError=100)


def fetch_gee_zone_means(polygon: Polygon, cloud_cover_max: int, years_history: int,
                        scale: int = 60) -> dict[str, Any]:
    """Mean Sentinel-2 reflectance + SRTM terrain over the whole zone."""
    ee_mod = get_ee()
    region = _ee_polygon(polygon)
    composite = _make_composite(region, cloud_cover_max, years_history)
    srtm = ee_mod.Image("USGS/SRTMGL1_003")
    elevation = srtm.rename("elevation")
    slope = ee_mod.Terrain.slope(srtm).rename("slope")

    stacked = composite.addBands(elevation).addBands(slope)
    result = stacked.reduceRegion(
        reducer=ee_mod.Reducer.mean(),
        geometry=region,
        scale=scale,
        maxPixels=MAX_PIXELS,
        tileScale=4,
    ).getInfo()

    if not result:
        raise RuntimeError("Earth Engine returned an empty result for this zone.")

    scene_count = int(
        _sentinel_collection(region, cloud_cover_max, years_history).size().getInfo() or 0
    )

    return {
        "band_means": {b: float(result[b]) for b in S2_BANDS if result.get(b) is not None},
        "elevation_m": float(result["elevation"]) if result.get("elevation") is not None else None,
        "slope_deg": float(result["slope"]) if result.get("slope") is not None else None,
        "scene_count": int(scene_count or 0),
    }


def fetch_gee_grid(polygon: Polygon, mask: np.ndarray, transform: Any,
                   cloud_cover_max: int, years_history: int,
                   scale: int = 120) -> list[dict[str, Any]] | None:
    """Per-cell mean reflectance via reduceRegions. Returns None if too slow."""
    ee_mod = get_ee()
    resolution = mask.shape[0]
    if resolution > 16:  # keep the feature collection small enough to be fast
        return None

    region = _ee_polygon(polygon)
    composite = _make_composite(region, cloud_cover_max, years_history)

    rows, cols = np.nonzero(mask)
    features = []
    for row, col in zip(rows.tolist(), cols.tolist()):
        cell_bounds = window_bounds(Window(col, row, 1, 1), transform)
        features.append(ee_mod.Feature(ee_mod.Geometry.Rectangle(list(cell_bounds))))

    reduced = (
        composite.reduceRegions(
            collection=ee_mod.FeatureCollection(features),
            reducer=ee_mod.Reducer.mean(),
            scale=scale,
            tileScale=4,
        )
        .getInfo()
    )

    if not reduced or not reduced.get("features"):
        return None

    cells: list[dict[str, Any]] = []
    for index, feature in enumerate(reduced["features"]):
        if index >= len(rows):
            break
        props = feature.get("properties") or {}
        if not any(props.get(b) is not None for b in S2_BANDS):
            continue
        cells.append(
            {
                "row": int(rows[index]),
                "col": int(cols[index]),
                "bands": {b: float(props[b]) for b in S2_BANDS if props.get(b) is not None},
            }
        )
    return cells or None


# ---------------------------------------------------------------------------
# Deterministic fallback model
# ---------------------------------------------------------------------------
def seeded_rng(lat: float, lng: float, salt: str = "sih26009") -> np.random.Generator:
    """Stable RNG for a location so the same zone always scores identically."""
    key = f"{salt}:{round(lat, 4)}:{round(lng, 4)}".encode()
    seed = int.from_bytes(hashlib.sha256(key).digest()[:8], "big")
    return np.random.default_rng(seed)


def simulate_band_means(rng: np.random.Generator) -> dict[str, float]:
    """Pseudo-reflectance for a lateritic surface (0-1 per band)."""
    # Laterites: blue is absorbed, red/red-edge strong, SWIR moderate,
    # NIR moderate (iron oxides are moderately reflective in NIR).
    base = {
        "B2": 0.055, "B3": 0.075, "B4": 0.135, "B5": 0.175, "B6": 0.195,
        "B7": 0.215, "B8": 0.245, "B8A": 0.235, "B11": 0.190, "B12": 0.150,
    }
    noise = rng.normal(1.0, 0.12, size=len(base))
    return {band: float(np.clip(base[band] * n, 0.005, 1.0)) for band, n in zip(base, noise)}


def simulate_zone(lat: float, lng: float) -> dict[str, Any]:
    """Full simulated zone record - stands in for live Earth Engine data."""
    rng = seeded_rng(lat, lng)
    bands = simulate_band_means(rng)
    return {
        "band_means": bands,
        "elevation_m": float(rng.uniform(180, 720)),
        "slope_deg": float(rng.uniform(3, 28)),
        "scene_count": 0,
    }


# ---------------------------------------------------------------------------
# Indicator derivation & scoring
# ---------------------------------------------------------------------------
def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    return numerator / denominator if denominator not in (0, 0.0) else default


def _rescale(value: float, anchors: tuple[float, float], invert: bool = False) -> float:
    """Linearly map `value` between anchors onto 0-100, clamped."""
    low, high = anchors
    span = high - low
    if span == 0:
        return 50.0
    position = (value - low) / span
    if invert:
        position = 1.0 - position
    return float(np.clip(position * 100.0, 0.0, 100.0))


def derive_indicators(bands: dict[str, float], elevation_m: float | None,
                      slope_deg: float | None) -> dict[str, Any]:
    """Turn raw band reflectance into geological proxies."""
    b2 = float(bands.get("B2") or 0.0)
    b3 = float(bands.get("B3") or 0.0)
    b4 = float(bands.get("B4") or 0.0)
    b5 = float(bands.get("B5") or 0.0)
    b8 = float(bands.get("B8") or 0.0)
    b11 = float(bands.get("B11") or 0.0)

    return {
        # Ferric iron oxides absorb blue strongly -> high red/blue ratio.
        "iron_oxide_ratio": round(_safe_div(b4, b2, 0.0), 4),
        # Argillic minerals absorb SWIR1 (2.1um) relative to NIR.
        "clay_index": round(_safe_div(b11 - b8, b11 + b8, 0.0), 4),
        "ndvi": round(_safe_div(b8 - b4, b8 + b4, 0.0), 4),
        "red_edge_ratio": round(_safe_div(b5, b4, 0.0), 4),
        "elevation_m": round(elevation_m, 1) if elevation_m is not None else None,
        "slope_deg": round(slope_deg, 2) if slope_deg is not None else None,
        "band_means": {k: round(float(v), 5) for k, v in bands.items()},
    }


def _terrain_score(slope_deg: float) -> float:
    """Flat ground scores 100, falling linearly to 0 at SLOPE_STEEP_DEG."""
    span = SLOPE_STEEP_DEG - SLOPE_FLAT_DEG
    return float(np.clip(100.0 - (slope_deg - SLOPE_FLAT_DEG) * (100.0 / span), 0.0, 100.0))


def score_from_indicators(indicators: dict[str, Any]) -> tuple[float, dict[str, float]]:
    """Blend the four factors into an overall 0-100 suitability score."""
    # Ferric iron: a high red/blue ratio is a positive laterite signal.
    iron_oxide = _rescale(indicators["iron_oxide_ratio"], IRON_OXIDE_ANCHORS)

    # Clay minerals absorb at ~2.1um (B11), driving the index NEGATIVE.
    # The more negative, the more clay - hence the inversion.
    clay = _rescale(indicators["clay_index"], CLAY_ANCHORS, invert=True)

    # Dense vegetation buries the laterite profile, so high NDVI scores low.
    # With anchors ordered (high, low) and no inversion this already does that.
    vegetation = _rescale(indicators["ndvi"], NDVI_ANCHORS)

    slope = indicators.get("slope_deg")
    terrain = _terrain_score(float(slope)) if slope is not None else 50.0

    breakdown = {
        "iron_oxide": round(iron_oxide, 2),
        "clay_mineral": round(clay, 2),
        "vegetation_exposure": round(vegetation, 2),
        "terrain": round(terrain, 2),
    }

    total = sum(breakdown[key] * weight for key, weight in WEIGHTS.items())
    return round(float(np.clip(total, 0.0, 100.0)), 2), breakdown


def classify(score: float) -> str:
    if score >= 75:
        return "very_high"
    if score >= 60:
        return "high"
    if score >= 40:
        return "moderate"
    if score >= 20:
        return "low"
    return "very_low"


def grade_confidence(data_source: str, band_count: int, scene_count: int) -> tuple[str, float]:
    """Confidence reflects data provenance, never just how high the score is."""
    if data_source != "earth_engine":
        return "low", 0.35

    confidence = 0.60
    confidence += 0.05 * min(band_count, 10) / 10  # more bands -> better
    if scene_count >= 20:
        confidence += 0.20
    elif scene_count >= 8:
        confidence += 0.12
    else:
        confidence += 0.0

    if band_count < 6:
        confidence -= 0.15

    confidence = float(np.clip(confidence, 0.0, 0.95))
    level = "high" if confidence >= 0.75 else "medium" if confidence >= 0.55 else "low"
    return level, round(confidence, 2)


def build_recommendation(score: float, classification: str, indicators: dict[str, Any]) -> str:
    if classification in {"very_high", "high"}:
        return (
            "Strong lateritic manganese proxy. Prioritise for detailed field survey, "
            "drill sampling and assay verification."
        )
    if classification == "moderate":
        return (
            "Anomalous but inconclusive. Recommend reconnaissance sampling along the "
            "highest-scoring cells before committing exploration budget."
        )
    if classification == "low":
        return "Weak indicators. Low priority - consider alternative target areas."
    return "No meaningful lateritic signature detected in this zone."


def build_heatmap(mask: np.ndarray, transform: Any, cell_bands: dict[tuple[int, int], dict[str, float]],
                  elevation_m: float | None, slope_deg: float | None) -> list[dict[str, float]]:
    """Per-cell suitability scores for the Leaflet overlay."""
    cells: list[dict[str, float]] = []
    for (row, col), bands in cell_bands.items():
        indicators = derive_indicators(bands, elevation_m, slope_deg)
        score, _ = score_from_indicators(indicators)

        centre_x, centre_y = transform * (col + 0.5, row + 0.5)
        cells.append(
            {
                "lat": round(float(centre_y), 6),
                "lng": round(float(centre_x), 6),
                "score": score,
            }
        )
    return cells



# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def _zone_id(polygon: Polygon, name: str) -> str:
    """Stable id derived from the zone name + geometry."""
    digest = hashlib.sha256(f"{name}:{polygon.wkt}".encode()).hexdigest()
    return f"zone_{digest[:12]}"


def analyze_zone(
    *,
    geometry: dict[str, Any],
    name: str = "Unnamed Zone",
    grid_resolution: int = 12,
    include_heatmap: bool = True,
    cloud_cover_max: int = 20,
    years_history: int = 2,
    allow_simulation_fallback: bool = True,
) -> dict[str, Any]:
    """Run the full analysis and return the API response payload.

    Raises:
        InvalidGeometryError: the polygon is unusable.
        RuntimeError: Earth Engine failed and fallback was disallowed.
    """
    polygon = parse_polygon(geometry)
    stats = polygon_stats(polygon)
    mask, transform, _cell_size, inside_cells = build_grid_mask(polygon, grid_resolution)

    if inside_cells == 0:
        raise InvalidGeometryError("Polygon does not intersect the analysis grid.")

    data_source = "simulated"
    fallback_reason: str | None = None
    working_scale = adaptive_scale(stats["area_km2"])

    try:
        zone_data = fetch_gee_zone_means(
            polygon, cloud_cover_max, years_history, scale=working_scale
        )
        if not zone_data["band_means"]:
            raise RuntimeError("Earth Engine returned no usable band values.")
        data_source = "earth_engine"
    except (GEEInitializationError, Exception) as exc:  # noqa: BLE001
        fallback_reason = f"{type(exc).__name__}: {exc}"[:300]
        if not allow_simulation_fallback:
            raise RuntimeError(
                f"Earth Engine analysis failed and simulation fallback is disabled: {exc}"
            ) from exc
        logger.warning("Falling back to the simulated model: %s", fallback_reason)
        zone_data = simulate_zone(stats["centroid_lat"], stats["centroid_lng"])

    indicators = derive_indicators(
        zone_data["band_means"], zone_data.get("elevation_m"), zone_data.get("slope_deg")
    )
    score, breakdown = score_from_indicators(indicators)
    classification = classify(score)
    confidence_level, confidence_score = grade_confidence(
        data_source, len(zone_data["band_means"]), zone_data.get("scene_count", 0)
    )

    # --- Heatmap grid ---
    heatmap: list[dict[str, float]] = []
    if include_heatmap:
        cell_bands: dict[tuple[int, int], dict[str, float]] = {}

        gee_cells = None
        if data_source == "earth_engine" and grid_resolution <= 16:
            try:
                gee_cells = fetch_gee_grid(
                    polygon,
                    mask,
                    transform,
                    cloud_cover_max,
                    years_history,
                    scale=max(working_scale, 120),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Per-cell reduceRegions failed, using modelled grid: %s", exc)

        if gee_cells:
            for cell in gee_cells:
                cell_bands[(cell["row"], cell["col"])] = cell["bands"]
        else:
            rows, cols = np.nonzero(mask)
            for row, col in zip(rows.tolist(), cols.tolist()):
                centre_x, centre_y = transform * (col + 0.5, row + 0.5)
                cell_bands[(row, col)] = simulate_band_means(
                    seeded_rng(float(centre_y), float(centre_x), salt="cell")
                )

        heatmap = build_heatmap(
            mask, transform, cell_bands, zone_data.get("elevation_m"), zone_data.get("slope_deg")
        )

    return {
        "zone_id": _zone_id(polygon, name),
        "name": name,
        "suitability_score": score,
        "classification": classification,
        "confidence_level": confidence_level,
        "confidence_score": confidence_score,
        "data_source": data_source,
        "fallback_reason": fallback_reason,
        "geological_indicators": indicators,
        "breakdown": breakdown,
        "area_km2": round(stats["area_km2"], 3),
        "cell_count": inside_cells,
        "heatmap": heatmap,
        "boundary": {
            "type": "Polygon",
            "coordinates": [
                [[round(float(x), 6), round(float(y), 6)] for x, y in polygon.exterior.coords]
            ],
        },
        "recommendation": build_recommendation(score, classification, indicators),
        "analyzed_at": datetime.now(timezone.utc),
    }

