# Kennzeichenjagd

## Build

`npm start` (bzw. der pm2-Prozess auf dem VPS) liefert ausschließlich den vorgebauten `dist/`-Ordner aus ([server.mjs](server.mjs)) — Änderungen an `src/` wirken sich dort nicht automatisch aus.

**Nach jeder Änderung an `src/` deshalb immer `npm run build` ausführen**, damit `dist/` aktuell ist, bevor die Änderung als fertig gemeldet wird.
