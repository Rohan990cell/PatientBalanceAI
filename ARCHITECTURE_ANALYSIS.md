# PatientBalanceAI: Technical Architecture Report & Foundation Analysis

**Project Name:** PatientBalanceAI  
**Reference Codebase:** The Balance Toolkit (`C:\Users\Lenovo\Desktop\The-Balance-Toolkit`)  
**Target Environment:** Windows 10/11 | Tauri v2 + Rust + React 19 + TypeScript + Three.js/R3F + MediaPipe Vision  
**Target Hardware:** Nintendo Wii Balance Board (`Nintendo RVL-WBC-01`) + USB/Laptop Webcam  
**Document Version:** 1.0 (Research Architecture & Baseline Audit)

---

## Executive Summary

PatientBalanceAI is an advanced patient rehabilitation, balance-analysis, and exercise-assistance system. It unifies high-frequency biomechanical data from the Nintendo Wii Balance Board with real-time computer vision (webcam pose, face, eye/blink tracking), a 3D interactive human avatar, gamified rehabilitation protocols, and a comprehensive clinical doctor dashboard.

This report establishes the baseline analysis of the reference application, **The Balance Toolkit (TBT)**, answers all 18 technical architectural questions, identifies proven components for reuse, outlines what must remain untouched to prevent hardware regressions, and formulates the comprehensive modular architecture for **PatientBalanceAI**.

---

## Part 1: Comprehensive Reference Audit (The Balance Toolkit)

### 1. Overall Repository Architecture

The Balance Toolkit is organized as a Rust **Cargo Workspace** (edition 2024, resolver 2) combined with a Vite/React desktop frontend and a separate Android project:

```
The-Balance-Toolkit/
├── Cargo.toml                    # Root workspace definition
├── crates/
│   └── toolkit-core/             # Pure Rust hardware, DSP, actor and persistence engine
├── apps/
│   ├── cli/                      # Headless CLI tool (`tbt`) using toolkit-core
│   ├── tauri/
│   │   ├── src-tauri/            # Tauri v2 desktop shell, Specta IPC DTOs and handlers
│   │   └── src/                  # React 19 + TypeScript frontend with Tailwind CSS v4
│   └── android/                  # Separate Kotlin app (does not use toolkit-core)
└── docs/ & tests/                # Verification fixtures, synthetic sensor recordings
```

#### Key Boundary Invariant
- **Strict Decoupling:** `crates/toolkit-core` has zero dependency on Tauri, Webview, or `specta`.
- **Wire DTO Mirroring:** `apps/tauri/src-tauri/src/frontend/dto.rs` defines dedicated Data Transfer Objects (DTOs) that mirror core types with explicit `From` implementations.
- **Type Generation:** `tauri-specta` automatically outputs typed TypeScript definitions to `apps/tauri/src/bindings.ts` from `dto.rs` during debug builds.

---

### 2. Tauri Architecture

- **Tauri Version:** Tauri v2 (`tauri 2.11.5`, `@tauri-apps/api: ^2.11.1`, `@tauri-apps/plugin-dialog: ^2.7.3`).
- **Process Model:**
  1. **Background Supervisor Actor:** In `main.rs`, `tokio::main` initializes logging and calls `toolkit_core::start_manager()`, which launches the central `ConnectionManager` actor on the Tokio runtime.
  2. **Tauri IPC Bridge:** `frontend::tauri::initialize` sets up window configuration, registers `specta_builder().invoke_handler()`, and forwards system events to the Webview.
  3. **High-Frequency Streaming via Tauri Channels:** High-throughput streaming data (100 Hz raw samples, 10 Hz processed DSP frames) does **not** flood standard global window events. Instead, it utilizes **Tauri v2 IPC Channels** (`tauri::ipc::Channel<FrontendBalanceBoardEvent>`). This creates a direct, back-pressured IPC pipe between Rust and the calling frontend instance.

---

### 3. React Frontend Architecture

- **Framework & Tooling:** React 19 (`19.2.8`), Vite 8, TypeScript 7, Tailwind CSS v4.
- **State Management:**
  - **Zustand (`sessionDataStore.tsx`):** Maintains high-throughput ring buffers (`BoardBuffer<T>` with `MAX_FRAMES = 2,000`) for raw and processed frames using `subscribeWithSelector`.
  - **TanStack React Query (`toolkit.ts`):** Handles asynchronous request/response state (users, activities, devices, hardware settings) with automatic caching and invalidation.
- **Micro-Batching via `requestAnimationFrame`:**
  - The board transmits at ~100 Hz, but monitor refresh rates are ~60 Hz.
  - `BalanceBoardChannelManager.tsx` intercepts raw IPC messages in an internal array and dispatches them to the Zustand store **only once per animation frame**. This prevents React re-render thrashing and maintains 60 FPS UI responsiveness.
- **Visualization:**
  - 2D Canvas overlaid onto static SVG/PNG balance board images (`BalanceBoardWithCoPOverlay.tsx`).
  - `uPlot` integration (`UPlot.tsx`, `FFTAmplitudePlot.tsx`, `MultiMetricDsiPlot.tsx`) for fast 2D time-series and frequency graphs.

---

### 4. Rust Backend Architecture

`toolkit-core` is structured as an **Actor-Based Asynchronous Pipeline** using `tokio::sync::mpsc`:

```
               [ User / Frontend IPC ]
                         │  (ToolkitCommand)
                         ▼
               ┌─────────────────────┐
               │  ConnectionManager  │ ◄─── (Central Supervisor Actor)
               └──────────┬──────────┘
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌─────────────┐   ┌───────────────┐   ┌────────────────┐
│ UserState & │   │   Bluetooth   │   │  board_reader  │ (One worker thread
│ Activity    │   │    Service    │   │     Actor      │  per active board)
└─────────────┘   └───────────────┘   └───────┬────────┘
                                              │ (BalanceBoardOutput)
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
             ┌─────────────────┐                             ┌────────────────┐
             │ data_processor  │                             │  file_writer   │
             │   (DSP Loop)    │                             │ (Buffered CSV) │
             └────────┬────────┘                             └────────────────┘
                      │ Arc<ProcessedBoardData>
                      ▼
             ┌─────────────────┐
             │  Tauri Channel  │ ──► Webview
             └─────────────────┘
```

- **Zero-Copy Optimization:** Processed DSP frames contain complex structures (polygon vectors, FFT frequency arrays). They are wrapped in `Arc<ProcessedBoardData>` so observers receive pointer bumps rather than costly heap allocations.

---

### 5 & 6. Bluetooth Implementation & Windows Pairing (The "Secret Sauce")

Connecting a Nintendo Wii Balance Board (`Nintendo RVL-WBC-01`) on Windows is notoriously difficult because Windows expects standard Bluetooth HID PIN entry or Secure Simple Pairing. The Balance Toolkit solves this via a custom hybrid WinRT + Win32 implementation in `crates/toolkit-core/src/bluetooth/windows_bluetooth_service.rs`:

#### Discovery (WinRT):
1. Queries the host PC's primary Bluetooth adapter address via `BluetoothAdapter::GetDefaultAsync()`.
2. Starts a `DeviceWatcher` with `BluetoothDevice::GetDeviceSelectorFromPairingState(false)`.
3. Monitors `Added` and `Updated` events matching device name `"Nintendo RVL-WBC-01"` or `System.ItemNameDisplay`.

#### Pairing (Win32 Legacy PIN Ceremony):
1. **The Nintendo PIN Formula:** The Wii Balance Board requires a legacy Bluetooth PIN equal to the **host adapter's MAC address in reversed byte order**:
   ```rust
   pub fn mac_address_to_wii_pin(mac_address: [u8; 6]) -> [u8; 6] {
       let mut pin = [0u8; 6];
       for i in 0..6 {
           pin[i] = mac_address[5 - i];
       }
       pin
   }
   ```
2. Invokes Win32 API `BluetoothAuthenticateDevice(None, Some(radio), &mut device_info, Some(&pin_wide))` using the 6-byte reversed PIN. Retries if `ERROR_BUSY (170)` occurs.
3. Once authenticated, enables the Human Interface Device (HID) service GUID (`0x00001124-0000-1000-8000-00805f9b34fb`) via `BluetoothSetServiceState`.
4. The board is now exposed as a standard Windows HID peripheral.
5. `hidapi` opens the board by matching its serial number, which corresponds to the board's 12-character hexadecimal MAC address (`format!("{:012x}", mac_address)`).

---

### 7 & 8. Four Sensor Data Acquisition & Raw Data Structure

- **Transport:** Standard USB/Bluetooth HID reports via `hidapi::HidDevice`.
- **Initialization Handshake:**
  1. Turn on front blue LED: `[0x11, 0x10]`
  2. Request EEPROM Factory Calibration Data (32 bytes): Output control command `[0x17, 0x04, 0xA4, 0x00, 0x20, 0x00, 0x20]`
  3. Start continuous data reporting: Mode `0x34` (Core Buttons + 8 Extension bytes): `[0x12, 0x00, 0x34]`
- **Raw Sensor Packet (Input Report 0x34):**
  Reads packets of minimum length 10 bytes:
  ```rust
  struct BalanceBoardSensorRawReading {
      top_right:    i16::from_be_bytes([buf[3], buf[4]]),
      bottom_right: i16::from_be_bytes([buf[5], buf[6]]),
      top_left:     i16::from_be_bytes([buf[7], buf[8]]),
      bottom_left:  i16::from_be_bytes([buf[9], buf[10]]),
  }
  ```
- **Physical Layout of Sensors:**
  - `top_right` (TR): Front-Right load cell
  - `bottom_right` (BR): Rear-Right load cell
  - `top_left` (TL): Front-Left load cell
  - `bottom_left` (BL): Rear-Left load cell

---

### 9. Weight Calculation

The Wii Balance Board contains factory-calibrated load sensors with 3 calibration setpoints stored in EEPROM at address `0x04A40020`:
- `min`: 0 kg
- `mid`: 17 kg
- `max`: 34 kg

#### Piecewise Linear Interpolation Formula:
For each individual sensor reading ($V_{sensor}$):
$$\text{Weight} = \begin{cases} 17.0 \times \frac{V_{sensor} - V_{min}}{\max(1.0, V_{mid} - V_{min})}, & \text{if } V_{sensor} < V_{mid} \\ 17.0 + 17.0 \times \frac{V_{sensor} - V_{mid}}{\max(1.0, V_{max} - V_{mid})}, & \text{if } V_{sensor} \ge V_{mid} \end{cases}$$

#### Total Weight & Tare:
- **Tare Subtraction:** Baseline tare offset is stored per sensor and subtracted immediately upon receipt:
  $$TR = TR_{calibrated} - TR_{tare}, \quad BR = BR_{calibrated} - BR_{tare}$$
  $$TL = TL_{calibrated} - TL_{tare}, \quad BL = BL_{calibrated} - BL_{tare}$$
- **Total Weight (Force in kg):**
  $$\text{Total Weight} = TR + BR + TL + BL$$

---

### 10. Center of Pressure (CoP) Calculation

Center of Pressure represents the instantaneous point of application of the vertical ground reaction force vector.

#### 1. Normalized Coordinates: $[-1.0, +1.0]$:
If $\text{Total Weight} < 0.1\text{ kg}$, $CoP_x = 0.0, CoP_y = 0.0$ (empty board safeguard).
$$\text{CoP}_x = \frac{(TR + BR) - (TL + BL)}{\text{Total Weight}}$$
*(Positive = shift toward Right; Negative = shift toward Left)*

$$\text{CoP}_y = \frac{(TR + TL) - (BR + BL)}{\text{Total Weight}}$$
*(Positive = shift toward Front/Anterior; Negative = shift toward Back/Posterior)*

#### 2. Physical Millimeter Projection:
Physical sensor spacing on the physical board:
- Lateral ($X$-axis): $446.0\text{ mm}$ ($\text{half}_x = 223.0\text{ mm}$)
- Anteroposterior ($Y$-axis): $238.0\text{ mm}$ ($\text{half}_y = 119.0\text{ mm}$)

$$\text{CoP}_{x,\text{mm}} = \text{CoP}_x \times 223.0\text{ mm}$$
$$\text{CoP}_{y,\text{mm}} = \text{CoP}_y \times 119.0\text{ mm}$$

---

### 11. Balance & Stability Calculations (DSP Engine)

The processing loop in `data_processor.rs` executes over a sliding temporal window (default: $5,000\text{ ms}$ window, $100\text{ ms}$ slide rate $\rightarrow 10\text{ Hz}$ update rate):

1. **Interpolation & Regularization:**
   Raw Wiimote Bluetooth packets have irregular jitter. The engine interpolates readings to a uniform $100\text{ Hz}$ grid using Cubic Spline, Linear, or Lagrange Polynomial interpolation.
2. **Stability Index (SI):**
   Root Mean Square (RMS) radial displacement from the window mean:
   $$\text{SI} = \sqrt{\frac{1}{N} \sum_{i=1}^N \left[(x_i - \bar{x})^2 + (y_i - \bar{y})^2\right]} \quad (\text{in mm})$$
3. **Sway Kinematics:**
   - Mean absolute velocities along axes: $\bar{v}_x, \bar{v}_y$ (mm/s)
   - Mean resultant velocity: $\bar{v} = \frac{1}{N-1}\sum \frac{\sqrt{\Delta x^2 + \Delta y^2}}{\Delta t}$
   - Total path length (sway length in mm) & velocity moment.
4. **Dynamic Postural Stability Index (DPSI - Wikstrom et al. 2005):**
   - Mediolateral Stability Index: $\text{MLSI} = \sqrt{\frac{1}{N}\sum x_i^2}$
   - Anteroposterior Stability Index: $\text{APSI} = \sqrt{\frac{1}{N}\sum y_i^2}$
   - Vertical Stability Index: $\text{VSI} = \sqrt{\frac{1}{N}\sum \left(\frac{\text{baseline} - z_i}{\text{baseline}}\right)^2}$
   - Overall DPSI: $\text{DPSI} = \sqrt{\frac{1}{N}\sum (x_i^2 + y_i^2 + \Delta z_i^2)}$
5. **Area & Boundary Metrics:**
   - **95% Confidence Bivariate Normal Ellipse:** Computes $2 \times 2$ covariance matrix, determines eigenvalues ($\lambda_1, \lambda_2$) and rotation angle $\theta$, scales by $\chi^2_{df=2}(0.95) = 5.991$, and generates a 180-point boundary polygon.
   - **Convex Hull:** Graham scan algorithm computing the minimum enclosing bounding polygon.
6. **Frequency Analysis:**
   Fast Fourier Transform using `rustfft` computing amplitude power spectra ($0 - 50\text{ Hz}$) for $X$, $Y$, and planar $XY$ sway.

---

### 12. Complete Data Flow (Hardware $\rightarrow$ UI)

```
[Nintendo RVL-WBC-01]
       │ Bluetooth HID Report 0x34 (~100 Hz)
       ▼
[crates/toolkit-core/board_hid_reader]
       │ Piecewise Calibration & Weight Calculation (TR, BR, TL, BL)
       ▼
[crates/toolkit-core/balance_board_actor]
       │ Tare Compensation -> BalanceBoardCalibratedReading
       ▼
[Broadcast Observers]
  ├── [file_writer] ──► Buffered CSV Flush (250 ms)
  └── [data_processor] ──► 5s Window DSP (10 Hz Arc<ProcessedBoardData>)
       │
       ▼
[apps/tauri/src-tauri/frontend/tauri.rs]
       │ DTO conversion -> FrontendBalanceBoardEvent (Raw & Processed)
       │ Tauri IPC Channel (Channel<FrontendBalanceBoardEvent>)
       ▼
[apps/tauri/src/services/BalanceBoardChannelManager.tsx]
       │ Micro-batching via requestAnimationFrame (RAF)
       ▼
[apps/tauri/src/store/sessionDataStore.tsx]
       │ Zustand Store (Ring Buffer, 2,000 frames)
       ▼
[React 19 Components] (Canvas CoP Overlay, uPlot, UI Gauges)
```

---

### 13. Existing APIs, Events, and Commands

- **Tauri IPC Commands (`commands.*`):**
  - Settings: `settingsGetSettings`, `settingsSetSettings`
  - Users: `userPageInformation`, `userSelectUser`, `userCreate`, `userUpdate`, `userDelete`, `userMeasureWeight`, `userStopMeasureWeight`
  - Hardware Devices: `devicesFetchAllDevices`, `devicesScanWithoutTimeout`, `devicesCancelScan`, `devicesIsScanning`, `devicesSelectDevice`, `devicesUnselectDevice`, `devicesUpdateDeviceName`, `devicesRemoveDevice`, `devicesIdentifyDevice`, `devicesTareDevice`, `devicesStartCalibrationStream`, `devicesStopCalibrationStream`, `devicesSubmitCalibration`
  - Sessions: `sessionStartSession` (IPC Channel), `sessionStopSession`, `sessionInformation`, `sessionUpdateSessionConfiguration`, `sessionActivityState`, `sessionTareDevices`
  - Replay: `replayStartReplay`, `replayStopReplay`, `replayInformation`, `replayUpdate`, `replayLoadFile`, `replayClearReplay`, `replayLoadLastSessionInfo`
  - Activities: `activityGetAvailableTimeBlocks`, `activityGetActivities`, `activityGetActivity`, `activityUpdateActivity`, `activityResetActivityToDefault`
- **Tauri Typed Events (`events.*`):**
  - `boardDisconnected`, `newBoard`, `sessionStarted`, `sessionCompleted`, `replayCompleted`, `sessionActivityChanged`

---

### 14. Existing Activities Implementation

- **Data Model:** An `Activity` consists of an ID, title, description, required boards count, `loops`, and a sequence of `TimelineBlock`s (each having an ID, title, and duration in seconds).
- **Clinical Tests Included:**
  - `eyes-open-close` (Romberg protocol: step onto board, eyes open, eyes closed)
  - `functional-reach-test` (Arm forward reaching)
  - `single-leg-stance` (Unipedal balance)
  - `tandem-stance` (Heel-to-toe balance)
- **Current Limitations in TBT:**
  - Exercises are purely passive timers with static 2D vector illustrations.
  - The application cannot tell whether the user actually followed the instructions (e.g., whether eyes were genuinely open or closed, or if the leg was actually lifted).
  - No interactive visual avatar or gamified biofeedback.

---

### 15. Existing Session & Data Storage

- **Storage Location:** Stored as plain files in `~/Documents/the-balance-toolkit/` (or overridden by `TBT_APP_DIR`):
  - Configuration: `settings.json`, `users.json`, `devices.json`, `activities.json`
  - Session Results: `sessions/tbt-YYYY-MM-DDTHH-MM-SS.settings.json`
  - Raw Time-Series CSV: `sessions/tbt-...-raw.csv` (Columns: `timestamp, top_right, bottom_right, top_left, bottom_left`)
  - Processed DSP CSV: `sessions/tbt-...-processed.csv` (Columns: `timestamp, vcopx, vcopy, stability_index, mlsi, apsi, vsi, dpsi`)
- **Limitation:** Lacks relational indexing, longitudinal search, patient session history correlation, or SQL query capabilities.

---

### 16. What Can Be Reused for PatientBalanceAI

| Component / Layer | Source Location | Reusability Strategy |
|---|---|---|
| **Windows Bluetooth Pairing** | `toolkit-core/.../windows_bluetooth_service.rs` | **100% Reuse** (Proven WinRT discovery + reverse MAC legacy PIN authentication). |
| **HID Communication & Calibration** | `toolkit-core/.../board_hid_reader.rs` | **100% Reuse** (EEPROM calibration retrieval, 0x34 packet decoding, piecewise formula). |
| **Biomechanical DSP Engine** | `toolkit-core/.../data_processor.rs` | **100% Reuse** (Spline interpolation, Stability Index, Sway Velocity, DPSI, 95% Confidence Ellipse, FFT). |
| **Tauri Channel IPC Streaming** | `src-tauri/.../tauri.rs` + `src/.../BalanceBoardChannelManager.tsx` | **100% Reuse** (Tauri v2 Channel + RAF batching to Zustand store). |
| **Zustand Ring Buffer** | `src/.../sessionDataStore.tsx` | **Reuse with enhancements** (Add 4-sensor quad weights). |

---

### 17. What Must NOT Be Changed (Critical Invariants)

1. **The Bluetooth Pairing Protocol:** Do not alter the reverse MAC byte ordering for the Win32 authentication PIN or omit the Win32 HID service activation. Windows will reject pairing otherwise.
2. **HID Report Modes & Commands:** Do not alter `0x11, 0x10` (LED enable) or `0x12, 0x00, 0x34` (Report mode 0x34).
3. **Calibration Byte Offsets:** Do not alter the EEPROM address (`0x04A40020`) or the piecewise interpolation thresholds (0 kg, 17 kg, 34 kg).
4. **CoP Coordinate System Convention:** Standard biomechanical convention must remain:
   - Lateral: $+1.0$ (Right), $-1.0$ (Left).
   - Anteroposterior: $+1.0$ (Anterior/Front), $-1.0$ (Posterior/Back).
5. **Physical Dimensions:** Physical board spacing constants ($446.0\text{ mm} \times 238.0\text{ mm}$) must remain fixed to preserve scientific validity.

---

## Part 2: Proposed PatientBalanceAI Architecture

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Nintendo RVL-WBC-01 Hardware                      │
│                  (4x Strain-Gauge Load Cells @ 100 Hz)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Bluetooth HID Report 0x34
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Bluetooth & Hardware Layer (Rust)                    │
│  ├── WinRT DeviceWatcher + Win32 Reverse-MAC PIN Authenticator         │
│  └── hidapi I/O (EEPROM Calibration Read & Report 0x34 Streamer)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Calibrated Raw Weights (TR, BR, TL, BL)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Balance Data Engine (Rust)                        │
│  ├── Dynamic Tare Compensation                                         │
│  ├── CoP Engine (Normalized & Millimeter Physical CoP)                 │
│  └── Biomechanical DSP Pipeline (10 Hz sliding window)                 │
│      ├── Resampling (Cubic Spline / Polynomial)                        │
│      ├── Stability Index & Sway Kinematics (Path Length, Velocity)     │
│      ├── Dynamic Postural Stability Index (DPSI, MLSI, APSI, VSI)       │
│      ├── 95% Confidence Ellipse & Convex Hull                          │
│      └── Fast Fourier Transform (rustfft Amplitude Spectrum)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Tauri v2 IPC Channel Streaming
                                    │ (High-Throughput Raw + DSP Data)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   PatientBalanceAI Core (Desktop UI)                   │
│                                                                        │
│  ┌─────────────────────────┐           ┌────────────────────────────┐  │
│  │     3D Engine (R3F)     │           │   Computer Vision Engine   │  │
│  │ ├── Rigged 3D Avatar    │           │ ├── MediaPipe Pose Model   │  │
│  │ ├── 3D Virtual Board    │ ◄───────► │ ├── Face Mesh & Eye Landm. │  │
│  │ ├── Real-time CoP Trail │           │ ├── Eye Aspect Ratio (EAR) │  │
│  │ └── Weight Shift Rig    │           │ └── Blink & Gaze Detector  │  │
│  └────────────┬────────────┘           └─────────────┬──────────────┘  │
│               │                                      │                 │
│               └──────────────────┬───────────────────┘                 │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      Exercise & Rehab Engine                     │  │
│  │  ├── Automated Romberg Protocol (Eyes Open vs Eyes Closed)       │  │
│  │  ├── Biofeedback Games (Target Center-of-Pressure Shift)         │  │
│  │  ├── Arm Reach & Single Leg Stance CV Validation                 │  │
│  │  └── Compliance & Scoring System                                 │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               Analytics & SQLite Data Store                      │  │
│  │  ├── Patient Demographics & Baseline Physical Data               │  │
│  │  ├── Longitudinal Session Recordings & Stability Scores          │  │
│  │  └── Export Engine (Clinical CSV / JSON / PDF Report)            │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
│                                  │                                     │
│         ┌────────────────────────┴────────────────────────┐            │
│         ▼                                                 ▼            │
│  ┌──────────────────────────────┐        ┌──────────────────────────┐  │
│  │      Patient Experience      │        │     Doctor Dashboard     │  │
│  │ ├── Large, accessible UI     │        │ ├── Patient Roster       │  │
│  │ ├── Real-time Avatar Mirror  │        │ ├── Longitudinal Trends  │  │
│  │ ├── Audio/Visual Prompts     │        │ ├── Detailed Sway Graphs │  │
│  │ └── Gamified Scoring         │        │ └── Exportable Reports   │  │
│  └──────────────────────────────┘        └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Key Architectural Enhancements in PatientBalanceAI

#### 1. Addition of Quad-Sensor Weights to DTO
The existing Toolkit only forwarded `weight`, `cop_x`, `cop_y` in `FrontendRawReadingData`. PatientBalanceAI expands this to include all four calibrated sensor values:
- `top_right`, `bottom_right`, `top_left`, `bottom_left`
- **Direct Benefit:** Allows the frontend to compute and render:
  - **Left / Right Balance %:** $\frac{TL + BL}{\text{Total Weight}} \times 100\%$ vs $\frac{TR + BR}{\text{Total Weight}} \times 100\%$
  - **Front / Back Balance %:** $\frac{TR + TL}{\text{Total Weight}} \times 100\%$ vs $\frac{BR + BL}{\text{Total Weight}} \times 100\%$

#### 2. Computer Vision Engine (MediaPipe Vision)
- **Face Landmarker & Eye Aspect Ratio (EAR):**
  $$\text{EAR} = \frac{\|p_2 - p_6\| + \|p_3 - p_5\|}{2 \|p_1 - p_4\|}$$
  Automatically detects blinks and classifies whether the patient's eyes are open or closed during balance exercises (e.g., verifying compliance during Romberg tests).
- **Pose Landmarker:**
  Tracks shoulder tilt, hip alignment, arm reach distance, and single-leg elevation to validate that physical movements match the prescribed rehabilitation protocol.

#### 3. 3D Engine (Three.js & React Three Fiber)
- Replaces static 2D images with a dynamic 3D humanoid avatar standing on a virtual Wii Balance Board.
- The avatar's center of mass, foot pressure indicators, and skeletal posture lean dynamically in response to real-time CoP shifts and webcam pose estimation.

#### 4. Persistence & Database (SQLite)
- Replaces flat JSON files with an embedded SQLite database (`rusqlite` or `@tauri-apps/plugin-sql`).
- Relational schema connecting Patients $\rightarrow$ Sessions $\rightarrow$ Exercise Runs $\rightarrow$ Biomechanical Summary Metrics.
- Enables doctors to view longitudinal progress charts (e.g., Stability Index trend over 6 weeks of rehabilitation).

#### 5. Role-Separated User Interface
- **Patient Portal:** High-contrast, clean glassmorphic design with large interactive visual biofeedback, avatar mirroring, and encouragement cues.
- **Doctor Portal:** Clinical dashboard with patient filtering, session replays, sway area comparison (95% confidence ellipse before vs. after treatment), and exportable clinical reports.

---

## Part 3: Phased Implementation Roadmap

To maintain system stability, the application will be built strictly layer-by-layer:

1. **Phase 1: Project Scaffolding & Core Architecture Setup**
   - Initialize the PatientBalanceAI repository with Tauri v2 + React 19 + TypeScript + Tailwind CSS.
   - Establish directory structures for hardware, 3D, CV, and UI modules.
2. **Phase 2: Hardware & Data Layer Integration**
   - Integrate proven `windows_bluetooth_service` and `board_hid_reader`.
   - Verify physical pairing with the Windows-detected `Nintendo RVL-WBC-01` board.
   - Stream raw 4-sensor data and CoP over Tauri v2 Channels.
3. **Phase 3: Biomechanical DSP & Balance Engine**
   - Integrate real-time tare, weight distribution, Stability Index, Sway Velocity, and 95% Confidence Ellipse calculation.
4. **Phase 4: 3D Virtual Avatar Engine (Three.js / R3F)**
   - Render 3D balance board and rigged avatar with real-time CoP posture-shift biofeedback.
5. **Phase 5: Computer Vision Layer (MediaPipe)**
   - Implement webcam integration for Face/Eye EAR detection (open/closed/blink) and Pose tracking.
6. **Phase 6: Interactive Exercise & Rehabilitation Engine**
   - Build active clinical protocols (Romberg Eyes-Open/Closed, Single-Leg Stance, Weight-Shifting Games).
7. **Phase 7: Doctor Dashboard, SQLite Storage & Exportable Reports**
   - Implement relational patient history, longitudinal graphs, and PDF/CSV export.
8. **Phase 8: Future AI/ML Layer**
   - Movement classification, sway anomaly detection, and automated difficulty adaptation.

---

## Part 4: Scientific Data Integrity Standard — Measured vs. Calculated vs. Unavailable Data

As an evidence-based clinical and research neuro-rehabilitation platform, **PatientBalanceAI** enforces a strict tripartite data integrity model. The application rigorously separates what was physically captured, what was algorithmically derived, and what was absent:

### 1. Measured Data (Direct Physical Telemetry)
*Direct, raw sensory observations physically acquired by hardware sensors or optical camera detectors in real time.*
- **Wii Balance Board Load-Cells:** Raw corner sensor ADC millivolts/kilograms ($TR, BR, TL, BL$) arriving via Bluetooth HID.
- **Vision Keypoint Landmarks:** Raw 2D/3D pixel coordinates from MediaPipe Pose ($x_i, y_i, z_i$) and 468 Face Mesh landmarks.
- **Eye Aperture Distances:** Direct Euclidean distances between upper/lower eyelid landmarks.
- **Time Clock:** Real-time timestamp intervals ($\Delta t$) acquired from high-resolution monotonic clocks (`performance.now()`).

### 2. Calculated Metrics (Algorithmic Derivations)
*Mathematical parameters derived exclusively from real, valid Measured Data frames.*
- **Center of Pressure (CoP $X, Y$):** Derived from the 4 load-cell corner weights using physical platform dimensions.
- **Weight Redistribution (%):** Bilateral (Left/Right) and Anteroposterior (Front/Back) ratios computed from verified positive weight.
- **Normalized Pose Angles:** $0^\circ$-neutral shoulder tilt, hip tilt, and trunk pitch angles computed via trigonometric vectors between detected landmarks.
- **Eye Aspect Ratio (EAR):** Standardized ratio $\frac{\|p_2 - p_6\| + \|p_3 - p_5\|}{2 \|p_1 - p_4\|}$ classifying eye closure.
- **Exercise Performance Score (0–100):** A composite score computed *only* when real underlying sensor frames occurred during active execution.

### 3. Unavailable Data (Absent / Inactive Sensors)
*Sensor channels that were physically disconnected, toggled off, or occluded during an exercise session.*
- **Zero Fabrication Principle:** The system will **never** generate, infer, or fabricate balance or posture measurements when the required sensor is unavailable.
- **No Deceptive Fallbacks:** Missing hardware is **never** silently substituted with default values (such as `60/100`), random values, or synthetic sways.
- **Explicit `null` Representation:** In-memory models and data payloads store absent channels strictly as `null` (e.g., `balanceStabilityPercent: null`, `postureCompliancePercent: null`).
- **User Interface Transparency:** The UI displays `"--"` or `"Not available"` with an explicit rationale (e.g., *"Wii Balance Board was not connected during this session"* or *"Camera inactive"*), rather than displaying `0%` which falsely implies patient inability.
- **Session Telemetry Modes:** Each session is transparently categorized as `FULL_MULTIMODAL` (both active), `VISION_ONLY` (camera only), `BALANCE_ONLY` (board only), or `UNASSISTED` (neither active, performance score omitted).

---

*Analysis completed and verified against `C:\Users\Lenovo\Desktop\The-Balance-Toolkit` without any modifications to the reference repository.*

---

## Part 5: Optical Sensor Architecture & Hardware Camera Enumeration Audit (Phase 5)

### 1. Physical Hardware & Operating System Device Enumeration
Windows PNP device enumeration verifies the physical connection of the dual-sensor Intel RealSense 455f system alongside integrated laptop cameras:
- **Intel RealSense 455f RGB:** `USB\VID_8086&PID_0B5C&MI_03` — Device Class: Camera, Status: OK
- **Intel RealSense 455f Depth:** `USB\VID_8086&PID_0B5C&MI_00` — Device Class: Camera, Status: OK
- **Integrated Camera:** `USB\VID_5986&PID_216A&MI_00` — Device Class: Camera, Status: OK
- **Lenovo Virtual Camera:** Registered as Windows Virtual Camera fallback driver

### 2. Browser W3C MediaDevices Discovery & Label Unmasking
Under the W3C Media Capture specification implemented by Chromium / Edge WebView2:
1. `navigator.mediaDevices.enumerateDevices()` masks device `label` values (returning `""`) until an initial `getUserMedia` permission has been granted for the origin.
2. In PatientBalanceAI, `CameraService` logs the complete videoinput device array during development and re-queries `enumerateDevices()` immediately after permission acquisition, unmasking full hardware labels.
3. **Intel RealSense RGB Detection:** Identified via device label pattern matching (`Intel(R) RealSense(TM) Depth Camera 455f RGB` or labels containing both `RealSense`/`455` and `RGB`).
4. **Phase 5 Depth Stream Isolation:** The raw Depth videoinput (`... Depth Camera 455f Depth`) is strictly excluded from standard RGB selector lists, preventing infrared 16-bit stream collisions with MediaPipe 2D vision models.

### 3. Stream Switching & Non-Substitution Safeguard
- **Zero Silent Substitution (Requirement 14):** If the RealSense RGB camera is selected or requested but unavailable to the browser environment, the system refuses silent fallback to Lenovo Virtual Camera. Instead, it transitions to status `Unavailable` and displays:
  > *"Intel RealSense RGB camera is not available to the browser."*
- **Exact Device Constraints (Requirement 7):** When selected, the stream is requested using:
  ```json
  {
    "video": {
      "deviceId": {
        "exact": "<selectedDeviceId>"
      }
    }
  }
  ```
- **Track Lifecycle (Requirement 8 & 9):** Previous `MediaStreamTrack` instances are explicitly stopped (`track.stop()`) and detached from `videoElement.srcObject` before acquiring the new stream, preventing device locking and enabling instant, in-page camera switching without refresh.
- **Formal State Machine (Requirement 13):**
  - `Ready` — Camera subsystem initialized, standing by
  - `Starting` — Requesting stream constraints and initializing MediaPipe models
  - `Connected` — Active video stream feeding MediaPipe Pose and Face EAR pipelines
  - `Unavailable` — Requested hardware absent or restricted by browser
  - `Permission Denied` — OS or browser camera permission blocked
  - `Error` — Hardware in use or initialization failure
- **Live Diagnostic Telemetry (Requirement 15):** Exposes Camera Name, Device ID detected (Yes/No), Resolution, FPS, and Stream Status in real time.


