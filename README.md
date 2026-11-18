# North Wildwood Shoreline Viewer

[Open the viewer](https://hondrospj.github.io/north-wildwood-shoreline-viewer/)

A minimal, full-screen map of North Wildwood's historical shorelines, with ShorelySafe's navy and blue styling. Browse 70 recorded years from 1771 through 2025, compare shorelines, play the timeline, switch basemaps, and measure shoreline positions along a transect.

## Local development

This is a static site with no build step or package dependencies. Use Node.js 20 or newer for the tests and Python 3 for the local server.

```sh
npm test
npm start
```

Open `http://localhost:8768`. JavaScript modules require HTTP rather than opening `index.html` directly.

## Publishing

GitHub Pages serves the root of the `main` branch. A push to `main` updates the site. `.nojekyll` keeps the files as a static distribution. All application assets use relative paths so the viewer works under the repository's Pages URL.

## Data and measurement

The archive contains all 71 original shoreline features across 70 years, including both 1989 sampling dates. Original coordinates and attributes are preserved from the ArcGIS GeoJSON export. No missing years or shoreline geometry are synthesized.

Original ArcGIS application: https://stocktonu.maps.arcgis.com/apps/instant/slider/index.html?appid=3e47fcd355d74b4faaaacee5164932ea

Source layer: https://stocktonu.maps.arcgis.com/home/item.html?id=18fc16fc099144c783fcc7fccf28a1e0

Draw a transect from landward A toward seaward B. For each year, the measurement selects the observed crossing nearest the chosen seaward end. Positions are shown in feet relative to the latest measured year by default; negative values are landward and positive values are seaward. Measurements depend on the selected transect and historical source accuracy. See About in the app for details.

## Assets

Leaflet, Esri Leaflet, Esri Leaflet Vector, and Inter are vendored with their respective licenses. Asset source URLs are recorded in `vendor/`. Esri vector basemaps and satellite imagery require internet access. ShorelySafe branding and the shoreline archive retain their original ownership and terms.
