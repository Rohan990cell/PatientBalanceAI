# PatientBalanceAI

AI-powered neuro-rehabilitation and balance analysis desktop app. It combines **Nintendo Wii Balance Board** center-of-pressure (COP) sensing with **camera-based MediaPipe 2D pose** tracking for multimodal exercise sessions, clinical metrics, and exportable reports.

**Repo:** [github.com/Rohan990cell/PatientBalanceAI](https://github.com/Rohan990cell/PatientBalanceAI)

---

## Features

- **Wii Balance Board (RVL-WBC-01)** — HID load-cell COP, weight, and directional target protocols
- **Computer vision** — webcam / Intel RealSense RGB + MediaPipe pose landmarks
- **Directional Weight Shift** — multi-target far layout, shared board↔camera clock (T0 after 3s center hold)
- **COP result board** — per-target coloured paths, solid travel / dotted in-zone movement, path filters, leave→hit transit times, direction arrows
- **Pose 2D angles** — live joint gauges, center-stance person crop + vectors, board-synced snapshots
- **Transit angle box plots** — leave previous border → hit next border; upper then lower joints, then trunk sway; Tukey whiskers + outliers
- **Hold-window graphs** — miss distance (mm) vs time in **seconds**
- **PDF / JSON / CSV reports** — session and pose-angle exports

---

## Stack

| Layer | Tech |
|--------|------|
| Desktop shell | [Tauri v2](https://tauri.app/) (Rust) |
| UI | React 19 + TypeScript + Vite |
| Vision | MediaPipe Tasks Vision, optional RealSense |
| Hardware | Wii Balance Board over HID (Windows) |
| 3D (where used) | Three.js / React Three Fiber |

---

## Requirements

- **Windows 10/11** (primary target)
- **Node.js** 18+ and **npm**
- **Rust** toolchain (`rustup`) for Tauri builds
- Wii Balance Board + Bluetooth/HID stack (for real hardware; simulation mode available)
- Webcam or RealSense for pose features

---

## Quick start

```bash
npm install
npm run tauri dev
```

Frontend-only (no native shell):

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run tauri build
```

---

## Useful scripts

| Command | Purpose |
|---------|---------|
| `npm run tauri dev` | Full desktop app (recommended) |
| `npm run test:directional-weight-shift` | Directional weight-shift unit tests |
| `npm run test:pose` | Pose angle verification |
| `npm run test:multimodal` | Multimodal integration checks |
| `npm test` | Full test suite |

---

## Project layout

```
PatientBalanceAI/
├── src/                    # React frontend
│   ├── components/
│   │   ├── exercise/       # Directional weight shift, hold graphs, …
│   │   ├── vision/         # Angle gauges, stance crop, transit box plots
│   │   └── multimodal/
│   ├── context/            # Hardware + vision providers
│   ├── services/           # Camera, VisionEngine, PDF / angle reports
│   ├── utils/              # COP math, directional exercise, pose2dAngles
│   └── types/
├── src-tauri/              # Tauri + Rust HID / session backend
├── public/                 # Static assets / models
└── scripts/                # Integration & verification scripts
```

---

## Directional Weight Shift (clinical flow)

1. Start with board connected (or simulation).
2. **3s center hold** → shared **T0**; Target 1 begins.
3. Reach each target and hold for the configured duration.
4. Results show:
   - COP trajectory (filter paths with right-side checkboxes)
   - Hold-window error vs **seconds**
   - Board-synced 2D angle report + **leave→hit transit box plots**

Transit angle samples are buffered from the live pose stream while traveling between targets (`≈ transit_seconds × FPS` points).

---

## Hardware notes

- Prefer a stable Bluetooth HID connection to the Wii Balance Board.
- Keep a full-body pose in frame for skeleton lock and angle reports.
- Simulation mode is for UI/protocol testing only — not clinical history.

---

## Docs

- Deeper architecture notes: [`ARCHITECTURE_ANALYSIS.md`](./ARCHITECTURE_ANALYSIS.md)

---

## License

Private / project use unless otherwise stated by the repository owner.
