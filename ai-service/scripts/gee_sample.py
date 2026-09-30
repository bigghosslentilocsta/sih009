"""Sample Earth Engine script for SIH 26009.

Replaces the ad-hoc `test_gee.py` at the repo root with a reusable script that
reads the same configuration as the API service.

Run from the `ai-service` directory:

    python scripts/gee_sample.py

Or point it at any other cloud project:

    set GEE_PROJECT=my-other-project && python scripts/gee_sample.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/gee_sample.py` to import the `app` package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ee  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.services.gee_client import GEEInitializationError, initialize_gee  # noqa: E402


def main() -> int:
    settings = get_settings()
    project = settings.gee_project

    print(f"[SIH 26009] Initialising Earth Engine (project: {project}) ...")
    try:
        initialize_gee(project)
    except GEEInitializationError as exc:
        print(f"[SIH 26009] FAILED: {exc}")
        print(
            "[SIH 26009] Tip: run `earthengine authenticate` once, or set "
            "GEE_SERVICE_ACCOUNT_KEYFILE to a service account JSON."
        )
        return 1

    print("Earth Engine initialised successfully!")

    # --- 1. Confirm a known dataset is reachable -----------------------
    srtm = ee.Image("USGS/SRTMGL1_003")
    # Note: `.id().getInfo()` returns None for a non-computed image, so read
    # the asset id from the image description instead.
    print("  Test image ID (SRTM 30m DEM):", srtm.getInfo().get("id"))

    # --- 2. Sample terrain over a known manganese belt ----------------
    # Nagarnandil, East Singhbhum district, Jharkhand - a reference point in
    # India's principal Mn ore-bearing belts.
    point = ee.Geometry.Point([86.35, 22.35])
    elevation = (
        srtm.reduceRegion(
            reducer=ee.Reducer.first(),
            geometry=point,
            scale=30,
            maxPixels=1,
        )
        .get("elevation")
        .getInfo()
    )
    print(f"  Elevation @ (22.35N, 86.35E): {elevation} m")

    # --- 3. Terrain derivatives useful for laterite Mn screening -------
    # In the Python API terrain products live on `ee.Terrain`
    # (`Image.terrain()` is JavaScript-only), and `addBands()` takes a single
    # source image per call, so bands are chained.
    slope = ee.Terrain.slope(srtm).rename("slope")
    aspect = ee.Terrain.aspect(srtm).rename("aspect")
    derivatives = srtm.addBands(slope).addBands(aspect)
    sample = (
        derivatives.reduceRegion(
            reducer=ee.Reducer.first(),
            geometry=point,
            scale=30,
            # One pixel per band - the derivatives image has 3 bands.
            maxPixels=64,
        )
        .getInfo()
    )
    print(f"  Terrain derivatives: {sample}")

    # --- 4. Interactive view (requires `pip install geemap`) -----------
    if "--map" in sys.argv:
        try:
            import geemap

            m = geemap.Map(center=[22.35, 86.35], zoom=9)
            m.add_basemap("SATELLITE")
            m.add_layer(derivatives, {"bands": ["slope", "aspect"]}, "Terrain")
            m
        except ImportError:
            print("  (install geemap to enable the interactive map: pip install geemap)")

    print("[SIH 26009] Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
