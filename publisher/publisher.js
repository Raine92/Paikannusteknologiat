import mqtt from 'mqtt';
import fs from 'fs';

// Lue JSON-tiedosto
const data = JSON.parse(fs.readFileSync('./saved_trips/trip_2025-10-20T18-17-14-472Z.json', 'utf8'));


// Konfiguroitava julkaisuväli (ms). Oletus 1000 ms = 1 viesti /s
const PUBLISH_INTERVAL_MS = process.env.PUBLISH_INTERVAL_MS
  ? parseInt(process.env.PUBLISH_INTERVAL_MS, 10)
  : 250;

// MQTT-yhteysasetukset - pidä yhteys vakaana ja määritä LWT
const clientId = `publisher_${Math.random().toString(16).slice(2, 8)}`;
const client = mqtt.connect('mqtt://test.mosquitto.org:1883', {
  clientId,
  keepalive: 30, // sekunteina
  reconnectPeriod: 2000, // yritä uudelleen 2 s välein
  clean: true, // julkaisijalla ei välttämättä tarvetta säilyttää sessiota
  will: {
    topic: 'gnss/status',
    payload: JSON.stringify({ clientId, status: 'offline' }),
    qos: 1,
    retain: true,
  },
});

// Käydään läpi data-objektit yksi kerrallaan
let index = 0;
let interval = null;

function startPublishing() {
  if (interval) return; // jo käynnissä

  interval = setInterval(() => {
    if (index >= data.length) {
      console.log('✅ Kaikki data lähetetty.');
      stopPublishing();
      // lähetetään status offline ennen lopetusta
      client.publish('gnss/status', JSON.stringify({ clientId, status: 'offline' }), { qos: 1, retain: true }, () => {
        client.end();
      });
      return;
    }

    if (!client.connected) {
      console.log('⚠️ Broker ei yhteydessä — odotetaan uudelleen yhteyden muodostumista...');
      return; // älä kuluta indeksiä, odotetaan yhteyttä
    }

    const location = data[index];
    const message = JSON.stringify(location);

    // Käytetään QoS 1 varmempaan toimitukseen julkaisijan ja brokerin välillä
    client.publish('gnss/location', message, { qos: 1 }, (err) => {
      if (err) {
        console.error('❌ Julkaisu epäonnistui:', err.message || err);
        return;
      }
      console.log(`📤 Lähetetty (${index + 1}/${data.length}):`, message);
      index++;
    });
  }, PUBLISH_INTERVAL_MS);
}

function stopPublishing() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

client.on('connect', () => {
  console.log(`✅ Publisher connected to MQTT broker (clientId=${clientId})`);
  // Kerrotaan tila ja aloitetaan julkaisu
  client.publish('gnss/status', JSON.stringify({ clientId, status: 'online' }), { qos: 1, retain: true }, (err) => {
    if (err) console.warn('⚠️ Status-päivitys epäonnistui:', err.message || err);
    startPublishing();
  });
});

client.on('reconnect', () => {
  console.log('🔁 Yritetään muodostaa yhteyttä uudelleen...');
});

client.on('offline', () => {
  console.log('⚠️ MQTT client offline');
});

client.on('close', () => {
  console.log('❌ Yhteys suljettu');
  // älä lopeta indeksiä, resume kun yhteys palaa
});

client.on('error', (err) => {
  console.error('MQTT error:', err && err.message ? err.message : err);
});

// jos haluat pysäyttää julkaisut automaattisesti kun prosessi sulkeutuu
process.on('SIGINT', () => {
  console.log('\n🚪 Suljetaan publisher');
  stopPublishing();
  client.publish('gnss/status', JSON.stringify({ clientId, status: 'offline' }), { qos: 1, retain: true }, () => {
    client.end(true, () => process.exit(0));
  });
});

