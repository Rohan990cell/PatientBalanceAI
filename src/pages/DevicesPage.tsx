import React, { useState } from "react";
import { Bluetooth, Camera, RefreshCw, CheckCircle2, Shield, Cpu, Scale, AlertCircle, Compass } from "lucide-react";
import { Card } from "../components/common/Card";
import { StatusBadge } from "../components/common/StatusBadge";
import { useBalanceBoard } from "../context/HardwareContext";

export const DevicesPage: React.FC = () => {
  const { status, reading, scanAndConnect, directHidConnect, disconnect, tare, isTauri } = useBalanceBoard();
  const [webcamTested, setWebcamTested] = useState(false);

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "8px 0 40px 0",
      }}
    >
      {/* Top Banner */}
      <div
        className="medical-card-mint"
        style={{
          padding: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "#FFFFFF",
              border: "1px solid var(--border-mint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--teal-primary)",
            }}
          >
            <Cpu size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)" }}>
              Hardware & Sensors
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Physical Nintendo Wii Balance Board connection and real-time load-cell streaming.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          {status.isConnected ? (
            <button
              onClick={disconnect}
              className="btn-secondary"
              style={{ whiteSpace: "nowrap" }}
            >
              <span>Disconnect</span>
            </button>
          ) : (
            <button
              onClick={scanAndConnect}
              disabled={status.isScanning}
              className="btn-primary"
              style={{ whiteSpace: "nowrap" }}
            >
              <RefreshCw size={15} className={status.isScanning ? "spin" : ""} />
              <span>{status.isScanning ? "Scanning..." : "Scan & Connect"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Browser mode notice */}
      {!isTauri && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            color: "#92400E",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>
            You are previewing in a web browser. Physical Bluetooth &amp; HID access operates through the Tauri desktop shell (run <code>npm run tauri dev</code>).
          </span>
        </div>
      )}

      {/* Error Banner */}
      {status.error && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            fontSize: "0.8125rem",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <AlertCircle size={16} />
            <span>Connection Error</span>
          </div>
          <p style={{ margin: 0, lineHeight: 1.4 }}>{status.error}</p>
        </div>
      )}

      {/* Primary Hardware Card: Nintendo Wii Balance Board */}
      <Card
        title="Wii Balance Board"
        subtitle="Physical force plate (Model: RVL-WBC-01)"
        icon={<Bluetooth size={20} />}
        headerAction={
          <StatusBadge
            status={status.isConnected ? "connected" : status.isScanning ? "scanning" : "disconnected"}
            label={status.isConnected ? "Connected" : status.isScanning ? "Scanning..." : "Not Connected"}
          />
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Status Instruction Bar */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "12px",
              background: status.isConnected ? "var(--bg-subtle-mint)" : "var(--bg-app)",
              border: `1px solid ${status.isConnected ? "var(--border-mint)" : "var(--border-light)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Hardware Status
              </div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginTop: "4px" }}>
                {status.message}
              </div>
            </div>

            {status.isConnected && (
              <button onClick={tare} className="btn-secondary" style={{ padding: "6px 14px", fontSize: "0.8125rem" }}>
                <Scale size={14} />
                <span>Zero Tare</span>
              </button>
            )}
          </div>

          {/* Real-Time Measurements Grid (Phase 1 verified data pipeline) */}
          <div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Scale size={15} color="var(--teal-primary)" />
              <span>Live Sensor Measurements</span>
              {!status.isConnected && (
                <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: "auto" }}>
                  (Values display live Wii Balance Board sensor data upon connection)
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {/* Total Weight */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Total Weight
                </span>
                <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "4px" }}>
                  {reading ? `${reading.totalWeight.toFixed(1)} kg` : "--"}
                </span>
              </div>

              {/* Left / Right Distribution */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Lateral Balance (L / R)
                </span>
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    L: {reading ? `${reading.leftWeight.toFixed(1)} kg (${reading.leftPercent.toFixed(1)}%)` : "--"}
                  </span>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    R: {reading ? `${reading.rightWeight.toFixed(1)} kg (${reading.rightPercent.toFixed(1)}%)` : "--"}
                  </span>
                </div>
              </div>

              {/* Anterior / Posterior Distribution */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Anteroposterior (Ant / Post)
                </span>
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    Ant: {reading ? `${reading.anteriorWeight.toFixed(1)} kg (${reading.anteriorPercent.toFixed(1)}%)` : "--"}
                  </span>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    Post: {reading ? `${reading.posteriorWeight.toFixed(1)} kg (${reading.posteriorPercent.toFixed(1)}%)` : "--"}
                  </span>
                </div>
              </div>
            </div>

            {/* Center of Pressure & 4 Corner Load Cells */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: "12px", marginTop: "12px" }}>
              {/* CoP */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    <Compass size={14} color="var(--teal-primary)" />
                    <span>Center of Pressure</span>
                  </div>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    [-1 to +1]
                  </span>
                </div>
                <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>X (Lateral: Left -X / Right +X): </span>
                    <span style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-main)" }}>
                      {reading ? `${reading.copX >= 0 ? "+" : ""}${reading.copX.toFixed(2)} (${reading.copXMm >= 0 ? "+" : ""}${reading.copXMm.toFixed(1)} mm)` : "--"}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Y (Anteroposterior: Back -Y / Front +Y): </span>
                    <span style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-main)" }}>
                      {reading ? `${reading.copY >= 0 ? "+" : ""}${reading.copY.toFixed(2)} (${reading.copYMm >= 0 ? "+" : ""}${reading.copYMm.toFixed(1)} mm)` : "--"}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  Convention: Left (-X) ← Center → Right (+X) · Front (+Y) ↑ Center ↓ Back (-Y)
                </div>
              </div>

              {/* 4 Load Cells */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                  4 Corner Sensors (Calibrated Force + Raw ADC)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.8125rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#FFFFFF", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Front-Left (FL):</span>
                    <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                      {reading ? `${reading.frontLeft.toFixed(2)} kg` : "--"}
                      {reading && <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "4px" }}>({reading.rawFrontLeft})</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#FFFFFF", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Front-Right (FR):</span>
                    <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                      {reading ? `${reading.frontRight.toFixed(2)} kg` : "--"}
                      {reading && <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "4px" }}>({reading.rawFrontRight})</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#FFFFFF", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Back-Left (BL):</span>
                    <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                      {reading ? `${reading.backLeft.toFixed(2)} kg` : "--"}
                      {reading && <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "4px" }}>({reading.rawBackLeft})</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#FFFFFF", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Back-Right (BR):</span>
                    <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                      {reading ? `${reading.backRight.toFixed(2)} kg` : "--"}
                      {reading && <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "4px" }}>({reading.rawBackRight})</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connection Actions */}
          <div style={{ display: "flex", gap: "12px", paddingTop: "8px", borderTop: "1px solid var(--border-light)" }}>
            {!status.isConnected ? (
              <>
                <button
                  onClick={scanAndConnect}
                  disabled={status.isScanning}
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  <Bluetooth size={16} />
                  <span>{status.isScanning ? "Scanning for RVL-WBC-01..." : "Connect (Scan & Pair)"}</span>
                </button>

                <button
                  onClick={directHidConnect}
                  disabled={status.isScanning}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  <span>Connect via HID (If Already Paired)</span>
                </button>
              </>
            ) : (
              <button
                onClick={disconnect}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                <span>Disconnect Board</span>
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Secondary Hardware Card: Webcam (Phase 1 placeholder preserved) */}
      <Card
        title="Webcam Vision"
        subtitle="Camera for eye, blink, and body tracking (Phase 3)"
        icon={<Camera size={20} />}
        headerAction={
          <StatusBadge
            status={webcamTested ? "ready" : "standby"}
            label={webcamTested ? "Verified" : "Standby"}
          />
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              padding: "14px",
              borderRadius: "10px",
              background: "var(--bg-app)",
              fontSize: "0.8125rem",
            }}
          >
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Vision Model</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                MediaPipe Vision (Pending Phase 3)
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Resolution</span>
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-main)", marginTop: "2px" }}>
                720p @ 30 FPS
              </div>
            </div>
          </div>

          <button
            onClick={() => setWebcamTested(true)}
            className="btn-secondary"
            style={{ width: "fit-content" }}
          >
            <CheckCircle2 size={16} />
            <span>Test Camera Detection</span>
          </button>
        </div>
      </Card>

      {/* Architecture & Protocol Transparency Card */}
      <Card
        title="Hardware Communication Architecture"
        subtitle="Nintendo RVL-WBC-01 Hardware Protocol"
        icon={<Shield size={20} />}
      >
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <p>
            <strong>Connection Protocol:</strong> The board connects via standard Bluetooth HID using Nintendo's legacy PIN ceremony (host Bluetooth adapter MAC address in reversed byte order: <code>pin[i] = adapter_mac[5 - i]</code>).
          </p>
          <p>
            <strong>Data Acquisition:</strong> 4 load cells report high-frequency weight data via HID mode <code>0x34</code>. Factory calibration points are read directly from on-board EEPROM memory (address <code>0x04A40020</code>) and converted via piecewise linear interpolation.
          </p>
        </div>
      </Card>
    </div>
  );
};
