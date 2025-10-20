import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

// --- Kartan automaattinen siirto ensimmäiseen pisteeseen ---
const FlyToFirstLocation = ({ locations }) => {
  const map = useMap();
  useEffect(() => {
    if (locations.length === 1) {
      const { latitude, longitude } = locations[0];
      map.flyTo([latitude, longitude], 14, { animate: true });
    }
  }, [locations, map]);
  return null;
};

// --- Lista sijainneista scrollattavana boksiin ---
const ShowLocationsInList = ({ locations }) => (
  <div
    style={{
      marginTop: '1rem',
      maxHeight: '250px',
      overflowY: 'auto',
      border: '1px solid #ccc',
      padding: '0.5rem',
      borderRadius: '8px',
      backgroundColor: '#fafafa'
    }}
  >
    <h2>📍 Sijainnit</h2>
    {locations.length === 0 ? (
      <p>Ei vielä dataa</p>
    ) : (
      <ul style={{ paddingLeft: '1rem' }}>
        {locations.map((loc, i) => (
          <li key={i} style={{ marginBottom: '0.3rem' }}>
            <p style={{ margin: 0 }}>
              <b>Aika:</b> {loc.time} &nbsp;|&nbsp;
              <b>Lat:</b> {loc.latitude.toFixed(6)} &nbsp;|&nbsp;
              <b>Lon:</b> {loc.longitude.toFixed(6)} &nbsp;|&nbsp;
              <b>Korkeus:</b> {loc.height.toFixed(1)} m &nbsp;|&nbsp;
              <b>Nopeus:</b> {loc.speed !== null ? `${loc.speed} km/h` : '-'}
            </p>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// --- Väri nopeuden mukaan ---
function speedToColor(speed) {
  if (speed === null) return 'gray';
  const maxSpeed = 120; // km/h
  const ratio = Math.min(speed / maxSpeed, 1);
  const r = Math.floor(255 * ratio);
  const g = Math.floor(255 * (1 - ratio));
  const b = 255 - r;
  return `rgb(${r},${g},${b})`;
}

// --- Kartta ---
const ShowMap = ({ locations, mode, setMode }) => {
  const positions = locations.map((loc) => [loc.latitude, loc.longitude]);

  // Luo segmentit eri väreillä
  const coloredSegments = [];
  for (let i = 1; i < locations.length; i++) {
    const start = [locations[i - 1].latitude, locations[i - 1].longitude];
    const end = [locations[i].latitude, locations[i].longitude];
    const speed = locations[i].speed ?? 0;
    coloredSegments.push(
      <Polyline
        key={i}
        positions={[start, end]}
        color={speedToColor(speed)}
        weight={5}
        opacity={0.8}
      />
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Live vs simulaatio -valitsin */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'rgba(255,255,255,0.9)',
          borderRadius: '8px',
          padding: '6px 10px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          fontSize: '14px',
          zIndex: 1000
        }}
      >
        <label>
          🛰️ Tila:&nbsp;
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ padding: '2px 6px', borderRadius: '4px' }}
          >
            <option value="live">🚗 Reaaliaikainen</option>
            <option value="simulation">🧩 Simulaatio</option>
          </select>
        </label>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          background: 'rgba(255,255,255,0.9)',
          padding: '6px 10px',
          borderRadius: '8px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          fontSize: '12px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <div style={{ marginBottom: '4px' }}>🌈 Nopeus</div>
        <div
          style={{
            width: '120px',
            height: '12px',
            background: 'linear-gradient(to right, blue, yellow, red)',
            borderRadius: '6px',
            marginBottom: '2px'
          }}
        />
        <div style={{ width: '120px', display: 'flex', justifyContent: 'space-between' }}>
          <span>0 km/h</span>
          <span>120+ km/h</span>
        </div>
      </div>

      <MapContainer
        center={[62.7903, 22.8406]}
        zoom={6}
        style={{
          height: '400px',
          borderRadius: '12px',
          boxShadow: '0 0 10px rgba(0,0,0,0.15)'
        }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToFirstLocation locations={locations} />
        {coloredSegments}
        {locations.length > 0 && (
          <Marker position={positions[positions.length - 1]}>
            <Popup>📡 Viimeisin sijainti</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

// --- Sovellus ---
const App = () => {
  const [locations, setLocations] = useState([]);
  const [paused, setPaused] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('live'); // 🔹 tila live/simulation

  useEffect(() => {
    const socket = io('http://localhost:3001');
    socket.on('locationAdded', (newLocation) => {
      setLocations((prev) => [...prev, newLocation]);
    });
    return () => socket.disconnect();
  }, []);

  const showMessage = (text, duration = 2500) => {
    setMessage(text);
    setTimeout(() => setMessage(''), duration);
  };

  const startJourney = async () => {
    try {
      const res = await axios.post('http://localhost:3001/api/start');
      showMessage(res.data.message || 'Matka aloitettu 🚗');
      setTracking(true);
      setPaused(false);
    } catch {
      showMessage('⚠️ Virhe: palvelin ei vastaa');
    }
  };

  const togglePause = async () => {
    try {
      if (paused) {
        const res = await axios.post('http://localhost:3001/api/start');
        showMessage(res.data.message || 'Jatketaan seurantaa ▶️');
        setPaused(false);
      } else {
        const res = await axios.post('http://localhost:3001/api/pause');
        showMessage(res.data.message || 'Seuranta tauolla ⏸');
        setPaused(true);
      }
    } catch {
      showMessage('⚠️ Virhe: palvelin ei vastaa');
    }
  };

  const stopJourney = async () => {
    try {
      if (window.confirm('Haluatko tallentaa tämän matkan?')) {
        const res = await axios.post('http://localhost:3001/api/stop', { save: true });
        showMessage(res.data.message || 'Matka tallennettu 💾');
      } else {
        const res = await axios.post('http://localhost:3001/api/stop', { save: false });
        showMessage(res.data.message || 'Matkaa ei tallennettu 🗑');
      }
    } catch {
      showMessage('⚠️ Virhe: palvelin ei vastaa');
    }
    setTracking(false);
    setPaused(false);
    setLocations([]);
  };

  const clearJourney = () => setLocations([]);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '1rem', maxWidth: '900px', margin: 'auto' }}>
      <h1>🚗 GNSS Live Map</h1>

      {message && (
        <div
          style={{
            backgroundColor: '#eef6ff',
            border: '1px solid #cce0ff',
            padding: '0.5rem 1rem',
            marginBottom: '1rem',
            borderRadius: '8px'
          }}
        >
          {message}
        </div>
      )}

      {/* Napit tilan mukaan */}
      <div style={{ marginBottom: '1rem' }}>
        {mode === 'live' ? (
          <>
            {!tracking ? (
              <button onClick={startJourney}>Aloita matka</button>
            ) : (
              <button onClick={togglePause}>{paused ? 'Jatka' : 'Tauko'}</button>
            )}
            <button onClick={stopJourney} style={{ marginLeft: '1rem' }}>
              Lopeta
            </button>
            <button onClick={clearJourney} style={{ marginLeft: '1rem' }}>
              Tyhjennä
            </button>
          </>
        ) : (
          <>
            <button onClick={clearJourney}>Tyhjennä simulaatio</button>
          </>
        )}
      </div>

      <ShowMap locations={locations} mode={mode} setMode={setMode} />
      <ShowLocationsInList locations={locations} />
    </div>
  );
};

export default App;
