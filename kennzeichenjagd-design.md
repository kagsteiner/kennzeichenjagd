# Kennzeichenjagd — Design-Notizen

Stand: 2. August 2026
Ergebnis eines gemeinsamen Design-Gesprächs. Enthält getroffene Entscheidungen, offene Punkte und bewusst zurückgestellte Themen.

---

## 1. Grundidee

Man sitzt im Auto, sieht fremde Fahrzeuge und tippt deren Ortskennzeichen ein (z. B. `HD` für Heidelberg). Punkte richten sich nach der Entfernung zwischen dem aktuellen Standort und der Heimatstadt des Kennzeichens: je weiter weg, desto mehr Punkte.

**Zielgruppe:** Beifahrer, Kinder und andere Insassen — ausdrücklich **nicht** der Fahrer. Damit entfallen die üblichen Ablenkungs-Einschränkungen bei der Bedienung.

---

## 2. Punktesystem — zwei Ebenen

Kern der Diskussion war der Konflikt zwischen "einmalig sammeln" und "immer wieder punkten". Ergebnis: beides, aber getrennt.

### Ebene 1 — Punkte pro Fahrt

- Punkte werden **pro Fahrt neu** vergeben.
- Ein Kennzeichen, das man vor einem halben Jahr schon einmal gesehen hat, zählt in einer neuen Fahrt wieder voll.
- Begründung: Derselbe Fund ist unterschiedlich wertvoll, je nachdem wo man ihn macht. `HB` in Bremen ist banal, `HB` in München ist ein echter Treffer. Eine rein globale Einmal-Wertung würde diesen Ortsbezug zerstören.
- Innerhalb einer Fahrt zählt jedes Kennzeichen nur einmal.

### Ebene 2 — Globale Sammlung (Lebensliste)

Fahrtübergreifende Liste aller je gefundenen Kennzeichen. Sie vergibt **keine Punkte**, sondern trägt die Achievements:

- Erstes Kennzeichen aus einem Bundesland
- Alle 16 Bundesländer mindestens einmal gefunden
- Meilensteine: 100 / 200 / 300 … verschiedene Kennzeichen

### Erstfunde

Ein erstmals gefundenes Kennzeichen bekommt einen sichtbaren Moment ("Neu entdeckt!"), aber **keinen Punktebonus**.

Begründung: Sobald es globale Highscores gibt, würden Erstfund-Boni die Rangliste verzerren — wer zufällig noch viele neue Kennzeichen vor sich hat, wäre im Vorteil, ohne dass das etwas mit Spielkönnen zu tun hätte. Anerkennung ja, Punkte nein.

---

## 3. Eingabe

Beide Wege parallel, der Nutzer entscheidet:

1. **Tastatureingabe** — für alle, die das Kürzel kennen und schnell tippen wollen.
2. **Liste "in der Nähe"** — vorgeschlagene Kennzeichen aus der Umgebung zum Antippen.

### Idee: eigene, mitdenkende Tastatur

Statt der Standard-Tastatur eine eigene, die nach jedem Buchstaben nur noch die Buchstaben hervorhebt, die tatsächlich zu einem existierenden Kennzeichen führen. Nach `H` bleiben nur gültige Folgebuchstaben aktiv, der Rest wird ausgegraut.

- Vorteil: schneller als eine Standardtastatur, Fehleingaben praktisch ausgeschlossen.
- Bei rund 400 Kürzeln ist der Suchbaum klein und gut beherrschbar.
- Status: gute Idee, noch nicht final entschieden.

**Nicht geplant:** eine eigene Kindertastatur. Kinder sind nicht die primäre Zielgruppe.

### Performance der Nähe-Liste

Kein Problem. Bei ~400 Kennzeichen ist eine vollständige Neuberechnung und Sortierung nach Entfernung in Millisekunden erledigt.

Trotzdem sinnvoll: Neuberechnung **getaktet**, nicht permanent — etwa alle paar Sekunden oder erst nach einigen hundert Metern Bewegung. Spart Akku, ohne dass es sich träge anfühlt.

---

## 4. Kartendarstellung

Ausgangsproblem: Ganz Deutschland auf einem Handybildschirm wird zur Briefmarke; ein reiner Kartenausschnitt dagegen verwirrt, weil der geografische Kontext fehlt (Erfahrung aus einem früheren Prototyp).

Lösung: **zwei Ansichten für zwei Situationen.**

### Umgebungskarte (aktuelle Fahrt)

- Zeigt die nähere Umgebung mit Fähnchen der auf **dieser Fahrt** gefundenen Kennzeichen.
- Standardansicht während des Spielens.
- **Offen:** Wie groß ist der Radius?

### Globale Deutschlandkarte (Sammlung)

- Alle je gesammelten Kennzeichen über ganz Deutschland, als Fähnchen oder Sternchen.
- Die "Lebenswerk"-Ansicht, gehört zu Ebene 2.

### Der Fund-Moment

Beim Eintippen eines Kennzeichens:

1. Karte zoomt sanft auf ganz Deutschland heraus
2. Verbindungslinie vom aktuellen Standort zum Heimatort des Kennzeichens wird gezeichnet, Punkte erscheinen
3. Karte zoomt zurück in die Umgebungsansicht

**Timing:** insgesamt ca. 2–3 Sekunden — grob 0,5 s raus, ~1 s Standbild, 0,5 s zurück. Lang genug zum Erfassen, kurz genug, um auf der Autobahn nicht zu nerven.

**Wichtig:** Die Animation muss abbrechbar sein, wenn schon der nächste Fund ansteht.

**Kein Auto-Zoom zum Fundort:** Wenn man in München ein Hamburger Auto sieht, springt die Karte *nicht* nach Hamburg. Sonst geht der eigene Bezugspunkt verloren — und genau der Kontrast zwischen "hier bin ich" und "so weit ist das gereist" ist ja der Reiz.

**Idee für später:** stark vereinfachte, fast schematische Deutschlandkarte (nur Umriss und Bundesländer, U-Bahn-Plan-Ästhetik), damit auch die kleine Gesamtansicht sofort lesbar bleibt.

---

## 5. Technik

**Architektur:** reine browserbasierte App, lokal auf dem Gerät. TypeScript, HTML, CSS. **Kein Server**, keine native iOS-/Android-App.

Das trägt für alles oben Beschriebene:

| Anforderung | Umsetzung |
|---|---|
| Kennzeichen-Stammdaten | Tabelle mit Kürzel, Ortsname, GPS-Koordinaten — liegt bereits vor, klein genug für den Client |
| Aktueller Standort | Geolocation-API des Browsers |
| Entfernungsberechnung | Lokal, vernachlässigbarer Aufwand |
| Sammlung & Achievements | Lokale Browser-Speicherung, bleibt zwischen Sitzungen erhalten |
| Karte & Animationen | Modernes Web reicht aus |

---

license_plates.csv enthält eine Liste aller Kennzeichen. Wichtig zur Unterscheidung: city_name enthält den tatsächlichen Namen der Stadt oder des Kreises, zu dem das Kennzeichen gehört. plate_name erläutert, was die Buchstaben des Kennzeichens bedeuten, mit entsprechend groß geschriebenen Buchstaben des Nummernschilds. Also etwa: MTL: city_name="Landkreis Leipzig", plate_name="MuldenTaL" 

## 6. Zurückgestellt

### Globale Highscores

Bewusst **nicht** Teil der ersten Version. Grund: Die Punkte sind pro Fahrt gedacht und nicht darauf ausgelegt, sich zu einer Gesamtsumme aufzuaddieren.

Mögliche Ansätze für später:
- Beste Einzelfahrt
- Summe der besten zehn Fahrten

Beides wertet Qualität statt reiner Zeit im Auto. Ein Erstfund-Bonus wäre in einer solchen Fahrtwertung unkritisch — nur solange Highscores offen sind, bleibt es beim Verzicht darauf.

---

## 7. Offene Punkte

- Radius der Umgebungskarte

Lass uns das konfigurierbar machen, erst mal mit 100 km an der längeren Seite anfangen.

- Eigene Tastatur vs. Standardtastatur — endgültige Entscheidung

Eigene Tastatur. Man sieht immer den Kartenausschnitt. Wenn man irgendwohin tappt, erscheint die Tastatur. Beim letzten Buchstaben verschwindet sie wieder.

- Konkrete Gestaltung der Deutschlandkarte (realistisch vs. schematisch)

Schematisch. 

- Wann genau beginnt und endet eine "Fahrt"? (Bisher nicht besprochen, ist aber die Grundlage der gesamten Punktelogik)

Es gibt am Anfang die Buttons "Fahrt fortsetzen" und "Neue Fahrt". 

- Mehrspieler im selben Auto — bisher nicht besprochen

Erst mal out of scope.
