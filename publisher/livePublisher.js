import mqtt from 'mqtt';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import fs from 'fs';
import path from 'path';

// --- Sarjaportin asetukset ---
const portName = 'COM4';
const baudRate = 38400;

// --- Tallennus ---
const savedTripsDir = path.join(process.cwd(), 'saved_trips');
if (!fs.existsSync(savedTripsDir)) {
  fs.mkdirSync(savedTripsDir);
}
let filePath = null;
let tripData = [];

// --- MQTT-yhteys ---
const clientId = `livePublisher_${Math.random().toString(16).slice(2, 8)}`;
const client = mqtt.connect('mqtt://test.mosquitto.org:1883', {
  clientId,
  keepalive: 30,
  reconnectPeriod: 2000,
  clean: true,
  will: {
    topic: 'gnss/status',
    payload: JSON.stringify({ clientId, status: 'offline' }),
    qos: 1,
    retain: true,
  },
});

let currentPort = null;
let lastSpeed = null;   // viimeisin nopeus RMC-viestistä
let paused = false;     // tauko-tila

client.on('connect', () => {
  console.log(`✅ Connected to MQTT broker (clientId=${clientId})`);
  client.publish(
    'gnss/status',
    JSON.stringify({ clientId, status: 'online' }),
    { qos: 1, retain: true }
  );

  client.subscribe('gnss/control', (err) => {
    if (err) console.error('❌ Control subscription error:', err.message);
    else console.log('📡 Subscribed to gnss/control');
  });
});

// --- Funktio tallennukseen ---
function saveTrip() {
  if (tripData.length > 0 && filePath) {
    fs.writeFileSync(filePath, JSON.stringify(tripData, null, 2));
    console.log(`💾 Tallennettu ${tripData.length} pistettä tiedostoon ${filePath}`);
  } else {
    console.log('ℹ️ Ei tallennettavaa dataa');
  }
}

// --- Funktio sarjaportin avaamiseen ---
function openSerialPort() {
  if (currentPort) {
    console.log('⚠️ Portti on jo auki');
    return;
  }

  console.log(`🔌 Yritetään avata portti ${portName} @ ${baudRate}...`);

  const port = new SerialPort({ path: portName, baudRate }, (err) => {
    if (err) {
      console.error(`❌ Ei voitu avata porttia ${portName}:`, err.message);
      console.log('⏳ Yritetään uudelleen 5 sekunnin kuluttua...');
      setTimeout(openSerialPort, 5000);
    }
  });

  currentPort = port;

  port.on('open', () => {
    console.log(`✅ Portti ${portName} avattu`);
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', (line) => {
      if (paused) return; // ohitetaan rivit tauon aikana

      // --- Nopeus RMC-viestistä ---
      if (line.startsWith('$GNRMC')) {
        const parts = line.split(',');
        if (parts.length > 7 && parts[7]) {
          const speedKnots = parseFloat(parts[7]);
          if (!isNaN(speedKnots)) {
            lastSpeed = speedKnots * 1.852; // km/h
          }
        }
      }

      // --- Sijainti GGA-viestistä ---
      if (line.startsWith('$GNGGA') || line.startsWith('$GPGGA')) {
        const parts = line.split(',');
        if (parts.length > 9 && parts[2] && parts[4]) {
          const latDeg = parseInt(parts[2].slice(0, 2), 10);
          const latMin = parseFloat(parts[2].slice(2));
          let latitude = latDeg + latMin / 60.0;
          if (parts[3] === 'S') latitude *= -1;

          const lonDeg = parseInt(parts[4].slice(0, 3), 10);
          const lonMin = parseFloat(parts[4].slice(3));
          let longitude = lonDeg + lonMin / 60.0;
          if (parts[5] === 'W') longitude *= -1;

          const height = parts[9] ? parseFloat(parts[9]) : 0.0;
          const timestamp = new Date().toISOString();

          const entry = {
            time: timestamp,
            latitude,
            longitude,
            height,
            speed: lastSpeed !== null ? parseFloat(lastSpeed.toFixed(2)) : null
          };

          console.log('📡 GNSS:', entry);

          tripData.push(entry);

          client.publish('gnss/location', JSON.stringify(entry), { qos: 1 }, (err) => {
            if (err) console.error('❌ Publish error:', err);
          });
        }
      }
    });

    port.on('error', (err) => {
      console.error('⚠️ Sarjaportin virhe:', err.message);
    });

    port.on('close', () => {
      console.log(`⚠️ Portti ${portName} sulkeutui.`);
      currentPort = null;
    });
  });
}

// --- Kuunnellaan ohjausviestit ---
client.on('message', (topic, message) => {
  if (topic === 'gnss/control') {
    try {
      const cmd = JSON.parse(message.toString());
      if (cmd.action === 'start') {
        console.log('▶️ Aloitetaan matka');
        paused = false;
        tripData = []; // tyhjennetään vanhat
        // luodaan uusi tiedostonimi jokaiselle matkalle
        const newFilename = `trip_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        filePath = path.join(savedTripsDir, newFilename);
        openSerialPort();
      } else if (cmd.action === 'pause') {
        console.log('⏸ Tauko päällä');
        paused = true;
      } else if (cmd.action === 'stop') {
        console.log('⏹ Lopetetaan matka');
        if (currentPort) {
          currentPort.close();
          currentPort = null;
        }
        if (cmd.save) {
          saveTrip();
        } else {
          console.log('🗑 Matkaa ei tallennettu');
        }
        tripData = [];
      }
    } catch (err) {
      console.error('Virhe ohjausviestissä:', err);
    }
  }
});

// --- SIGINT käsittely ---
process.on('SIGINT', () => {
  console.log('\n🚪 Suljetaan livePublisher');
  saveTrip();
  client.publish(
    'gnss/status',
    JSON.stringify({ clientId, status: 'offline' }),
    { qos: 1, retain: true },
    () => {
      if (currentPort) {
        currentPort.close();
      }
      client.end(true, () => process.exit(0));
    }
  );
});
