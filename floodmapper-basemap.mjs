// Basemap styling reused from the North Wildwood Flood Mapper.
// Source recorded in vendor/esri/sources.json.
function cloneStyleObject(value) {
      return JSON.parse(JSON.stringify(value || {}));
    }

    function styleEsriBuildingBasemap(style) {
      const next = cloneStyleObject(style);
      if (!Array.isArray(next.layers)) return next;

      // The default MapLibre light intensity produces extreme contrast
      // between roof and wall faces. With thousands of aligned shore-town
      // footprints, those dark wall faces collapse into long horizontal
      // bands at overview scale. A soft viewport light preserves true 3D
      // geometry and the existing material color without the stripe effect.
      next.light = {
        ...(next.light || {}),
        anchor: "viewport",
        color: "#ffffff",
        intensity: 0.18
      };

      next.layers = next.layers.map(layer => {
        const id = String(layer?.id || "").toLowerCase();
        const sourceLayer = String(layer?.["source-layer"] || "").toLowerCase();
        const joined = `${id} ${sourceLayer}`;
        const isSymbolTextLayer = layer?.type === "symbol";
        const isBuildingLayer = /(building|footprint|structure)/.test(joined);

        if (isSymbolTextLayer || /(label|poi|place-name|road-name|road-label|reference-label|admin-label|marine-label|water-label)/.test(joined)) {
          return {
            ...layer,
            layout: {
              ...(layer.layout || {}),
              visibility: "none"
            }
          };
        }

        if (isBuildingLayer) {
          const paint = { ...(layer.paint || {}) };
          if (layer.type === "fill") {
            paint["fill-color"] = "#d8d2c6";
            paint["fill-opacity"] = 0.98;
            // Esri publishes a fill edge and a separate outline for every
            // footprint. At overview scale the stacked edges collapse into
            // the dark dashes and bands visible in dense building blocks.
            // Preserve the established beige fill while neutralizing its edge.
            paint["fill-outline-color"] = "#d8d2c6";
          }
          if (layer.type === "line") {
            return {
              ...layer,
              layout: {
                ...(layer.layout || {}),
                visibility: "none"
              }
            };
          }
          return { ...layer, paint };
        }

        return layer;
      });

      return next;
    }

export function floodmapperBasemap(pane) {
  return L.esri.Vector.vectorTileLayer("https://basemaps.arcgis.com/arcgis/rest/services/OpenStreetMap_v2/VectorTileServer", {pane, preserveDrawingBuffer:true, style:styleEsriBuildingBasemap});
}
