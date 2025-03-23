import('node-fetch').then(({ default: fetch }) => global.fetch = fetch);
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { parse } = require('csv-parse');

const app = express();
const PORT = 3000;

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoidGF0aGFnYXRhMzEiLCJhIjoiY203dGZpeG9qMHFhbzJqcjJkdHRydm8xeCJ9.B7l1dHUjVmPieh7VEBSd5w'
const OPENWEATHER_API_KEY = 'a05a0e2d301e43dcdd95534d3034699e'; // You'll need to get this from OpenWeatherMap

// Add JSON parser middleware
app.use(express.json()); // <-- THIS IS CRUCIAL
app.use(cors({ origin: "*" })); // Temporarily allow all origins

// Function to read and parse the Accidents CSV file
function readAccidentsData() {
  return new Promise((resolve, reject) => {
    const accidents = [];
    fs.createReadStream('Accidents Sample.csv')
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => {
        console.log('Parsed row:', row);
        accidents.push({
          latitude: Number(row.Latitude),
          longitude: Number(row.Longitude),
          severity: Number(row['severity']),
          weather: row['Weather Condition'],
          roadSurface: row['Road Surface Condition']
        });
      })
      .on('end', () => {
        console.log('Final accidents data:', accidents);
        resolve(accidents);
      })
      .on('error', (error) => reject(error));
  });
}

// Function to read and parse the Hospitals CSV file
function readHospitalsData() {
  return new Promise((resolve, reject) => {
    const hospitals = [];
    fs.createReadStream('Hospitals.csv')
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => {
        hospitals.push({
          name: row['Hospital Name'],
          latitude: Number(row.Latitude),
          longitude: Number(row.Longitude),
          defaultDistance: Number(row.Distance)
        });
      })
      .on('end', () => {
        console.log('Hospitals data loaded:', hospitals.length, 'records');
        resolve(hospitals);
      })
      .on('error', (error) => reject(error));
  });
}

// Store data globally
let accidents = [];
let hospitals = [];

// Initialize data and start server
Promise.all([readAccidentsData(), readHospitalsData()])
  .then(([accidentsData, hospitalsData]) => {
    accidents = accidentsData;
    hospitals = hospitalsData;

    // Enable CORS for all routes
    app.use(cors({ origin: "http://localhost:3000" }));

    // Serve map.html at the root URL
    const path = require('path');
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'map.html'));
    });

    // API endpoint to fetch accident data
    app.get("/api/accidents", (req, res) => {
      res.json(accidents);
    });

    // Emergency endpoint (now correctly placed)
    app.post('/api/emergency', (req, res) => {
      try {
        const { userLocation, hospital } = req.body;
        
        if (!userLocation || !hospital) {
          return res.status(400).json({ 
            success: false, 
            error: "User location and hospital information are required" 
          });
        }

        // Log the emergency alert details
        console.log('Emergency Alert Details:');
        console.log('User Location:', userLocation);
        console.log('Hospital:', hospital);

        // Send the emergency alert
        sendEmergencyAlert(hospital);
        
        res.status(200).json({ 
          success: true,
          message: `Alert successfully sent to ${hospital.name}`
        });
        
      } catch (error) {
        console.error('Emergency alert error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Failed to send emergency alert" 
        });
      }
    });

    // Function to get weather data from OpenWeatherMap API
    async function getWeatherData(lat, lon) {
      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
        );
        
        if (!response.ok) {
          throw new Error('Weather API request failed');
        }

        const data = await response.json();
        return {
          temperature: data.main.temp,
          feelsLike: data.main.feels_like,
          humidity: data.main.humidity,
          windSpeed: data.wind.speed,
          weather: data.weather[0].main,
          description: data.weather[0].description,
          visibility: data.visibility,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('Weather API error:', error);
        throw error;
      }
    }

    // Function to analyze weather impact on accidents
    function analyzeWeatherImpact(accidents, weather) {
      const weatherConditions = accidents.map(acc => acc.weather);
      const currentWeather = weather.weather.toLowerCase();
      
      // Count accidents in similar weather conditions
      const similarAccidents = weatherConditions.filter(w => 
        w.toLowerCase().includes(currentWeather)
      ).length;

      // Calculate risk level based on weather and accident history
      let riskLevel = 'LOW';
      if (similarAccidents > 5) {
        riskLevel = 'HIGH';
      } else if (similarAccidents > 2) {
        riskLevel = 'MEDIUM';
      }

      return {
        riskLevel,
        similarAccidents,
        weatherRecommendations: generateWeatherRecommendations(weather, riskLevel)
      };
    }

    // Function to generate weather-based safety recommendations
    function generateWeatherRecommendations(weather, riskLevel) {
      const recommendations = [];
      
      // Temperature-based recommendations
      if (weather.temperature < 5) {
        recommendations.push('⚠️ Cold weather conditions. Watch for ice formation.');
      } else if (weather.temperature > 35) {
        recommendations.push('🌡️ High temperature. Ensure proper vehicle cooling.');
      }

      // Weather condition recommendations
      switch(weather.weather.toLowerCase()) {
        case 'rain':
          recommendations.push('🌧️ Wet conditions. Maintain safe distance and reduce speed.');
          break;
        case 'snow':
          recommendations.push('❄️ Snow conditions. Use winter tires and drive slowly.');
          break;
        case 'fog':
          recommendations.push('🌫️ Foggy conditions. Use fog lights and maintain extra distance.');
          break;
        case 'thunderstorm':
          recommendations.push('⛈️ Thunderstorm conditions. Consider delaying travel if possible.');
          break;
      }

      // Wind speed recommendations
      if (weather.windSpeed > 20) {
        recommendations.push('💨 Strong winds. Keep firm grip on steering wheel.');
      }

      // Visibility recommendations
      if (weather.visibility < 1000) {
        recommendations.push('👁️ Low visibility. Use headlights and maintain extra caution.');
      }

      // Risk level specific recommendations
      if (riskLevel === 'HIGH') {
        recommendations.push('🚨 High accident risk in current conditions. Maximum caution required.');
      } else if (riskLevel === 'MEDIUM') {
        recommendations.push('⚠️ Moderate accident risk. Exercise increased caution.');
      }

      return recommendations;
    }

    // Add new weather endpoint
    app.get('/api/weather', async (req, res) => {
      try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
          return res.status(400).json({ 
            success: false, 
            error: "Latitude and longitude are required" 
          });
        }

        // Get current weather
        const weatherData = await getWeatherData(lat, lng);
        
        // Analyze weather impact on accidents
        const weatherAnalysis = analyzeWeatherImpact(accidents, weatherData);

        res.json({
          success: true,
          weather: weatherData,
          analysis: weatherAnalysis
        });

      } catch (error) {
        console.error('Weather endpoint error:', error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to fetch weather data"
        });
      }
    });

    // Modify the existing hospitals endpoint to include weather data
    app.get('/api/hospitals', async (req, res) => {
      try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
          return res.status(400).json({ 
            success: false, 
            error: "Latitude and longitude are required" 
          });
        }

        // Get weather data
        const weatherData = await getWeatherData(lat, lng);
        const weatherAnalysis = analyzeWeatherImpact(accidents, weatherData);

        // Calculate distances and filter hospitals within 20km
        const hospitalsWithDistance = hospitals.map(hospital => {
          const distance = calculateDistance(
            parseFloat(lat),
            parseFloat(lng),
            hospital.latitude,
            hospital.longitude
          );
          
          const accidentDistance = calculateDistance(
            hospital.latitude,
            hospital.longitude,
            12.9716,
            77.5946
          );

          return {
            name: hospital.name,
            coordinates: [hospital.longitude, hospital.latitude],
            distance: distance,
            address: `${hospital.name} (${accidentDistance.toFixed(2)}km from accident prone area)`
          };
        })
        .filter(hospital => hospital.distance <= 20)
        .sort((a, b) => a.distance - b.distance);

        res.json({ 
          success: true,
          hospitals: hospitalsWithDistance,
          userLocation: { lat: parseFloat(lat), lng: parseFloat(lng) },
          weather: weatherData,
          weatherAnalysis: weatherAnalysis
        });
      } catch (error) {
        console.error('Error fetching hospitals and weather:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Failed to fetch data"
        });
      }
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to load data:', error);
    process.exit(1);
  });

function sendEmergencyAlert(hospital) {
  const timestamp = new Date().toISOString();
  console.log('=== EMERGENCY ALERT ===');
  console.log(`Time: ${timestamp}`);
  console.log(`Hospital Name: ${hospital.name}`);
  console.log(`Location: [${hospital.coordinates.join(', ')}]`);
  console.log(`Distance: ${hospital.distance.toFixed(2)}km`);
  console.log('=====================');
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}