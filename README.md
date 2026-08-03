# Kennzeichenjagd

Browserspiel für Beifahrer: fremde Ortskennzeichen eintippen, Punkte nach der
Entfernung zwischen dem eigenen Standort und der Heimatstadt des Kennzeichens.
Umsetzung von [kennzeichenjagd-design.md](kennzeichenjagd-design.md).

Reines Frontend — TypeScript, HTML, CSS, kein Server. Standort, Sammlung und
Punkte bleiben auf dem Gerät.

## Starten

```bash
npm install
npm run dev
```

`npm run build` erzeugt den Produktionsstand in `dist/` (statisch ausliefern,
z. B. über GitHub Pages; die Pfade sind relativ). Für die Geolocation-API
braucht der Browser `https://` oder `localhost`.

## Was drin ist

**Zwei Punkte-Ebenen.** Punkte gibt es pro Fahrt: ein Punkt je 10 km Luftlinie,
jedes Kennzeichen zählt innerhalb einer Fahrt einmal, in der nächsten Fahrt
wieder voll. Daneben läuft die fahrtübergreifende Sammlung — sie vergibt keine
Punkte, sondern trägt die Achievements (erstes Kennzeichen je Bundesland, alle
16 Bundesländer, Meilensteine bei 10/50/100/200 … verschiedenen Kennzeichen).
Ein Erstfund wird als „Neu entdeckt!" gefeiert, bringt aber keinen Bonus.

**Eingabe** über die mitdenkende Tastatur: nach jedem Buchstaben bleiben nur
Tasten aktiv, die noch zu einem existierenden Kennzeichen führen. Steht das
Kennzeichen eindeutig fest, wird sofort abgeschickt und die Tastatur
verschwindet; sonst bestätigt „Gefunden" (`HH` ist ein Kennzeichen, `HHM`
ebenfalls — deshalb geht es nicht immer automatisch). Alternativ die Liste
„In der Nähe" zum Antippen.

**Karte** schematisch, nur Umriss und Bundesländer. Die Umgebungskarte zeigt
standardmäßig 100 km an der längeren Bildschirmseite (einstellbar, 40–400 km),
dazu Entfernungsringe als Maßstab und blasse Punkte der umliegenden Orte. Beim
Fund zoomt sie in etwa 0,5 s auf ganz Deutschland heraus, zeigt rund 1 s lang
die Verbindungslinie vom Standort zum Fundort samt Punkten und fährt in 0,5 s
zurück. Ein neuer Fund bricht die laufende Animation sofort ab. Kein Auto-Zoom
zum Fundort — der eigene Bezugspunkt bleibt erhalten.

**Fahrten** beginnen über „Neue Fahrt" und laufen weiter, bis eine neue
gestartet wird; „Fahrt fortsetzen" nimmt die letzte wieder auf. Abgeschlossene
Fahrten stehen mit Punktzahl in der Sammlung.

Ohne Standortfreigabe lässt sich in den Einstellungen ein Ort von Hand setzen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/game/` | Spiellogik: Geometrie, Kennzeichen und Suchbaum, Punkte, Achievements, Standort, Speicherstand |
| `src/ui/` | Bildschirme, Kartenkomponente, Tastatur |
| `src/data/` | erzeugte Daten: `plates.json`, `germany.json` |
| `scripts/build-data.mjs` | erzeugt beide JSON-Dateien |

## Daten neu erzeugen

```bash
npm run data
```

Liest `license_plates.csv` und ordnet jedem Kennzeichen per
Punkt-in-Polygon-Prüfung sein Bundesland zu (Stadtstaaten zuerst, sonst läge
Berlin in Brandenburg); Punkte knapp außerhalb, etwa an der Küste, bekommen das
nächstgelegene Bundesland. Zeilenartefakte der Rohtabelle (Datumsangaben,
Postleitzahlen, ausgeschriebene Kreisnamen) fallen weg — es bleiben 731
Kennzeichen. Aus denselben Geodaten entsteht der schematische Kartenumriss
(~42 kB). Vereinfacht wird über eine Topologie (TopoJSON), nicht Polygon für
Polygon: gemeinsame Grenzen sind dort ein einziger Kantenzug und bleiben
deckungsgleich — sonst driften Nachbarländer auseinander und es klaffen Lücken.

Die Bundesland-Geometrie liegt als `scripts/bundeslaender.raw.geo.json` bei
(aus dem Projekt *deutschlandGeoJSON*, das auf Daten des Bundesamts für
Kartographie und Geodäsie beruht), damit der Schritt ohne Netz läuft.

## Bewusst nicht enthalten

Globale Highscores und Mehrspieler im selben Auto — beides ist im Design
zurückgestellt.
