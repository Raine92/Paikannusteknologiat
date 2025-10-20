# Paikannusteknologiat

Tämä projekti sisältää GNSS-paikannuksen reaaliaikaisen seurannan ja simulaation. Se koostuu kolmesta pääosasta: **backend**, **frontend** ja **publisher**. 

## Arkkitehtuuri

UBLOX GNSS (EVB-CO99-F9P)
│
►
Publisher (Live)
│ MQTT
►
Backend (Serveri)
│ Socket.IO
►
Frontend (React)

Simulaatio:
JSON-tallennus --> Publisher (Simulaatio) --> MQTT --> Backend --> Socket.IO --> React


### Komponentit

#### 1. **Publisher**
- **Live mode**:  
  - Lukee sarjaportilta UBLOX NMEA-viestit (RMC ja GGA)
  - Julkaisee sijainnit ja nopeuden MQTT:n kautta serverille
  - Tallentaa viestit JSONiin tarvittaessa
- **Simulation mode**:  
  - Lukee tallennetun JSONin
  - Lähettää sijainnit yksi kerrallaan MQTT:n kautta simuloiden reaaliaikaa

#### 2. **Backend**
- Node.js serveri
- MQTT-client vastaanottaa viestit publisherilta
- Socket.IO välittää sijainnit React frontille
- Axios-reitit frontin hallintaan: `/api/start`, `/api/pause`, `/api/stop`
- Tallennus JSON-tiedostoihin (tarvittaessa)

#### 3. **Frontend**
- React-sovellus
- Kartta (Leaflet) ja sijaintilista
- Live / Simulation toggle
  - Näyttää reaaliaikaiset tai simuloidut sijainnit
- Scrollattava lista ja polyline, jonka väri muuttuu nopeuden mukaan
- Painikkeet: Aloita, Tauko / Jatka, Lopeta, Tyhjennä

## Asennus

1. Kloonaa repositio:
```bash
git clone https://github.com/Raine92/Paikannusteknologiat.git
```

2. Avaa kaikki kolme kansiota eri komentokehotteille:

- `publisher/`
- `backend/`
- `frontend/`

- Eli menet yksitellen jokaiseen kansioon ja kirjoita osoitekenttään
  ```bash
  cmd
  ```
- Näin kaikki kolme on avattuna komentokehotteille

3. Asenna riippuvuudet jokaisessa kansiossa:

```bash
npm install
```

4. Käynnistä komponentit


Backend:

```bash
npm run dev
```

Frontend:

```bash
npm run dev
```
- Frontend käynnistyy oletuksena osoitteeseen http://localhost:5173.


Ja käynnistä julkaisijoista jompi kumpi,
eli joko:

Publisher (simulaatio):

```bash
npm run start:sim
```
tai:

Publisher (live):

```bash
npm run start:live
```


## Käyttö
- Mene osoitteeseen
```bash
  http://localhost:5173
```
-Täällä valitaan tilasta joko:
- simulaatio
 tai
- reaaliaikainen

## Simulaatio

- Tyhjennä: nollaa kartan ja listan frontissa.

## Reaaliaikainen

- Aloita matka: avaa sarjaportin ja alkaa kerätä GNSS-dataa.

- Tauko: pysäyttää datan keruun, mutta ei sulje porttia.

- Lopeta matka: sulkee portin ja kysyy tallennetaanko matka JSON-tiedostoon.

- Tyhjennä: nollaa kartan ja listan frontissa.

Tallennetut matkat löytyvät kansiosta:
```bash
publisher/saved_trips/
```
- Jokainen matka tallennetaan omaksi JSON-tiedostokseen aikaleiman perusteella.

## Teknologiat
- Publisher: Node.js, SerialPort, MQTT

- Backend: Node.js, Express, MQTT.js, Socket.IO

- Frontend: React, Leaflet, Axios, Socket.IO-client

## Kehitysvinkit

- Voit testata ilman laitteistoa ajamalla simulaatiota (npm run start:sim).

- Live-tilassa varmista, että sarjaportin nimi (COM4 tms.) ja baudinopeus vastaavat laitteen asetuksia.

## Tulevaa kehitystä
- Oma MQTT-BROKER
- Tallennuksen tietokantatuki (esim. SQLite/PostgreSQL).
- Käyttöliittymään matkan tilan ja nopeuden visualisointi.

## Huomioita
- Live mode vaatii UBLOX GNSS:n kytkettynä USB-porttiin

- MQTT broker toimii oletuksena mqtt://test.mosquitto.org:1883
  - Joten kuka vaan voi tilata viestit 

- JSON-simulaatiota varten saved_trips/ kansio sisältää tallennetut reitit
  - vaihda publisher.js koodissa tämä kohta:
```bash
// Lue JSON-tiedosto
const data = JSON.parse(fs.readFileSync('./saved_trips/trip_2025-10-20T18-17-14-472Z.json', 'utf8'));
```
- Toiseen, mikä löytyy kansiosta,
  - Esim:

```bash
// Lue JSON-tiedosto
const data = JSON.parse(fs.readFileSync('./saved_trips/trip_2025-10-20T18-30-15-026Z.json', 'utf8'));
```

## Gitignore
- node_modules/
- dist/
- .env
- *.log
