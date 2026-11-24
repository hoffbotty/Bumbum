# BUMBUM – pink groovebox

Groovebox im Browser, die als App auf Handy und Desktop läuft. Sie nutzt nur die Web Audio API und braucht keinen Build-Schritt.

## Funktionen
- **8 Spuren** mit 16 Klang-Engines: KICK, SNARE, CLAP, HH CL/OP, TOM, RIM, NOISE, SAW, SQUARE, TRI, SINE, SUPERSAW, FM, CHORD, SAMPLE
- **10 Regler pro Spur:** OSC, PITCH, CUTOFF, RESO, EG INT, LEVEL, PAN, ATTACK, DECAY, IFX
- **Step-Sequencer** mit 16 Pads, 1–4 Takten, Velocity, Swing, Mute/Solo und Live-Aufnahme (quantisiert)
- **Piano Roll:** Noten zeichnen, verschieben, Länge ziehen, Velocity-Spur, Oktave transponieren, Zoom
- **Sampler:** Datei laden, mit dem Mikrofon aufnehmen oder Demo-Loop. Dazu Time Slice (1/4, 1/8, 1/16, AUTO-Transienten), SLICE → PADS, Trimmen, Reverse und Normalize
- **Timestretch** (WSOLA, ändert die Tonhöhe nicht): BPM-Sync oder freier Faktor 25–400 %
- **Insert-Effekte pro Spur:** DRIVE, CRUSH, DELAY, REVERB, CHORUS, WAH, COMP
- **Touchpad-Master-FX:** FILTER, DELAY, BUILD (Riser), GATE, ROLL (Stutter), CRUSH, mit HOLD
- 16 Pattern-Speicherplätze, JSON-Export/-Import, Bounce als WAV, Metronom, MIDI-Keyboard und Computer-Tastatur

## Starten
```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```
Über HTTPS (z. B. GitHub Pages) lässt sich die App installieren und läuft dann auch offline.
