import ee
import geemap  # optional, but great for map visualization later

# Initialize using your quota project
ee.Initialize(project='gen-lang-client-0167226131')

# Test a simple query (prints NASA SRTM elevation data sample)
img = ee.Image('USGS/SRTMGL1_003')
print("Earth Engine Initialized Successfully! Test Image ID:", img.id().getInfo())