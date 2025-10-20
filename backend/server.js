import express, { json } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mqtt from 'mqtt';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(json());

// Alustavat esimerkkipisteet (voi olla tyhjäkin)
const locations = []; 

// ----- MQTT-yhteys -----
const mqttClient = mqtt.connect('mqtt://test.mosquitto.org:1883');

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT broker test.mosquitto.org');
  mqttClient.subscribe('gnss/location', err => {
    if (err) console.error('Subscription error:', err);
    else console.log('Subscribed to topic gnss/location');
  });
});

mqttClient.on('message', (topic, message) => {
  if (topic === 'gnss/location') {
    try {
      const loc = JSON.parse(message.toString());
      console.log('Received via MQTT:', loc);

      // Luo id ja lisää listaan
      const newLocation = {
        id: locations.length + 1,
        latitude: loc.latitude,
        longitude: loc.longitude,
        height: loc.height,
        time: loc.time,
        speed: loc.speed ?? null
      };

      locations.push(newLocation);

      // Lähetä kaikille yhdistetyille frontin Socket.IO-asiakkaille
      io.emit('locationAdded', newLocation);
    } catch (err) {
      console.error('Error parsing MQTT message:', err);
    }
  }
});

// ----- REST-reitit -----
app.get('/api/locations', (req, res) => {
  res.json({
    success: true,
    data: locations,
    count: locations.length
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Location Data API',
    endpoints: [
      'GET /api/locations - Get all locations'
    ]
  });
});

app.post('/api/locations', (req, res) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const newLocation = {
      id: locations.length + 1,
      latitude,
      longitude
    };
    locations.push(newLocation);
    io.emit('locationAdded', newLocation);
    return res.status(201).json({ success: true, data: newLocation });
  }
  res.status(400).json({ success: false, message: 'Invalid location data' });
});

app.post('/api/start', (req, res) => {
  mqttClient.publish('gnss/control', JSON.stringify({ action: 'start' }));
  res.json({ success: true, message: 'Journey started' });
});

app.post('/api/pause', (req, res) => {
  mqttClient.publish('gnss/control', JSON.stringify({ action: 'pause' }));
  res.json({ success: true, message: 'Journey paused' });
});

app.post('/api/stop', (req, res) => {
  const { save } = req.body;
  mqttClient.publish('gnss/control', JSON.stringify({ action: 'stop', save }));
  res.json({ success: true, message: save ? 'Journey stopped and saved' : 'Journey stopped without saving' });
});



// ----- Socket.IO -----
io.on('connection', socket => {
  console.log('Frontend connected:', socket.id);
  socket.emit('initialLocations', locations);
  socket.on('disconnect', () => console.log('Frontend disconnected'));
});

// ----- Käynnistys -----
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
