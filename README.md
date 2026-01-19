# Logic Trainer (Vite + TS)

Statische PWA für Logik-Übungen (Aussagenlogik) mit Formel-Editor, Aufgaben-Templates aus JSON und localStorage-Fortschritt. Vanilla DOM + TypeScript, gebaut mit Vite.

## Features
- Topic-Switch: Aussagenlogik, Prädikatenlogik, Mengenlehre, Rechengrundlagen, Trigonometrie (Gerüst).
- Aussagen-Modi: ⇒ eliminieren, ⇔ eliminieren, Negation bilden (De Morgan), Äquivalenz prüfen (per Wahrheitstabelle).
- Prädikaten-Modi: Quantoren-Negation, eingeschränkte Quantoren umschreiben, Verteilungs-MCQ (erkenne falsche Verteilungen).
- Mengen-Modi: Identitäten umformen, Teilmenge/Disjunktheit, Venn Term→Diagramm (schraffieren), Venn Diagramm→Term, konkrete Mengen rechnen, Zahlenmengen & Intervalle (MC, Umformen).
- Neues Topic „Rechengrundlagen“: 7 Modi (Kopfrechnen, Potenzen, Wurzeln, Binome, Quadratische Ergänzung, Logarithmen, Summen/Produkte) mit Schwierigkeits-Dropdown, Seed-Feld, Timer/Stats pro Modus.
- Formel-/Set-Editor mit Symbol-Buttons (inkl. ∀, ∃, ∈, ∪, ∩, ∖, Δ, ⊆, ∅, Ω, ^c, [ ], ]) und ASCII-Normalisierung (`!`, `&`, `|`, `->`, `<->`, `forall`, `exists`, `in`, `cup`, `cap`, `delta`, `empty`, `omega`, `inf`/`infty` → `∞`, `^c`/`'` für Komplement).
- Aufgaben aus JSON-Vorlagen, automatische Bewertung; Fortschritt und Zeit-Statistiken in `localStorage`. Beispiel-Lösungen kommen aus `src/data/rules.json`.
- PWA: `manifest.webmanifest`, Service Worker (`public/sw.js`) für Offline-Caching, Platzhalter-Icons.

## Setup
Voraussetzungen: Node 18+ (getestet mit 20).

```bash
npm install
npm run dev
```

Entwicklungsserver: `http://localhost:5173/` (Hot Reload).  
Formel-Shortcuts werden beim Tippen normalisiert, Buttons fügen Symbole am Cursor ein.

## Scripts
- `npm run dev` – Vite-Devserver
- `npm run build` – Production-Build (beachtet `BASE_PATH`)
- `npm run preview` – Vorschau für den Build
- `npm run test` – Vitest (Logikfunktionen)
- `npm run lint` – `tsc --noEmit`

## Build & Deploy (GitHub Pages)
Der Vite-`base` kommt aus `process.env.BASE_PATH` (Fallback `/`):

```bash
# lokal (Repo-Name anpassen)
BASE_PATH=/DEIN_REPO/ npm run build
npm run preview
```

Workflow: `.github/workflows/deploy.yml` baut auf Push nach `main` und setzt `BASE_PATH=/${{ github.event.repository.name }}/`, lädt `dist` nach GitHub Pages hoch. Falls der Repo-Name nicht dem Deploy-Pfad entspricht, `BASE_PATH` im Workflow anpassen.

## PWA / Offline
- Manifest und Icons in `public/`.
- Service Worker cached statische Assets und legt gefetchte Dateien on-demand in den Cache.
- Für iOS „Zum Home-Bildschirm“ hinzufügen: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Nach dem ersten Laden stehen Start-Icon und Offline-Seite bereit.

- `src/data/tasks.json` – Aufgaben-Templates (Aussagen + Prädikatenlogik, inkl. MCQs)
- `src/data/sets.tasks.json` – Mengenlehre-Tasks (Identitäten, Venn, konkrete Mengen)
- `src/data/rules.json` – Umformungsregeln für Beispiel-Lösungen
- `src/logic.ts` – Parser, Normalisierung, Wahrheitstabelle, Transformationen
- `src/set-logic.ts` – Parser/Evaluator für Mengen-Terme (Venn)
- `src/main.ts` – UI/State, Progress, PWA-Registrierung
- `public/` – Manifest, Icons, Service Worker

## Hinweise
- Symbole: ¬ ∧ ∨ ⇒ ⇔ sowie A/B/C als Variablen.
- Fortschritt bleibt lokal gespeichert. „Prädikatenlogik“ ist aktuell deaktiviert, UI als Preview sichtbar.
