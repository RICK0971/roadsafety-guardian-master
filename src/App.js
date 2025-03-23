import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import axios from "axios";
import "./App.css";

mapboxgl.accessToken = "YOUR_MAPBOX_ACCESS_TOKEN";

const App = () => {
  const mapContainer = useRef(null);
  const [accidents, setAccidents] = useState([]);

  const fetchAccidents = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/accidents");
      console.log("Accident data:", response.data);
      setAccidents(response.data);
    } catch (error) {
      console.error("Error fetching accident data:", error);
    }
  };

  useEffect(() => {
    fetchAccidents();

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v10",
      center: [77.5946, 12.9716],
      zoom: 12,
    });

    map.on("load", () => {
      map.addSource("accidents", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: accidents.map((accident) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [accident.longitude, accident.latitude],
            },
            properties: {
              severity: accident.severity,
            },
          })),
        },
      });

      map.addLayer({
        id: "accidents-heat",
        type: "heatmap",
        source: "accidents",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "severity"],
            0,
            0,
            10,
            1,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            1,
            9,
            3,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(33,102,172,0)",
            0.2,
            "rgb(103,169,207)",
            0.4,
            "rgb(209,229,240)",
            0.6,
            "rgb(253,219,199)",
            0.8,
            "rgb(239,138,98)",
            1,
            "rgb(178,24,43)",
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            2,
            9,
            20,
          ],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            1,
            9,
            0,
          ],
        },
      });
    });

    return () => map.remove();
  }, [accidents]);

  return (
    <div className="App">
      <div ref={mapContainer} className="map-container" />
    </div>
  );
};

export default App;