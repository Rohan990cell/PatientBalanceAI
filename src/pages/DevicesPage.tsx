import React, { useState } from "react";
import { Bluetooth, Camera, RefreshCw, Shield, Cpu, Scale, AlertCircle, Compass } from "lucide-react";
import { Card } from "../components/common/Card";
import { StatusBadge } from "../components/common/StatusBadge";
import { useBalanceBoard } from "../context/HardwareContext";
import { useVision } from "../context/VisionContext";
import { isLenovoCameraLabel } from "../services/vision/CameraService";

export const DevicesPage: React.FC = () => {
  const { status, reading, scanAndConnect, directHidConnect, disconnect, tare, isTauri } = useBalanceBoard();
  const {
    visionState,
    isCameraActive,
    startCamera,
    stopCamera,
    switchCamera,
    enumerateCameras,
  } = useVision();
  const [isRefreshingCameras, setIsRefreshingCameras] = useState(false);

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
                <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "4px", fontVariantNumeric: "tabular-nums", minWidth: "6ch", textAlign: "center" }}>
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
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", minWidth: "12ch", display: "inline-block" }}>
                    L: {reading ? `${reading.leftWeight.toFixed(1)} kg (${reading.leftPercent.toFixed(1)}%)` : "--"}
                  </span>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", minWidth: "12ch", display: "inline-block" }}>
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
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", minWidth: "13ch", display: "inline-block" }}>
                    Ant: {reading ? `${reading.anteriorWeight.toFixed(1)} kg (${reading.anteriorPercent.toFixed(1)}%)` : "--"}
                  </span>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", minWidth: "13ch", display: "inline-block" }}>
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
                <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>X (Lateral: Left -X / Right +X): </span>
                    <span style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-main)", minWidth: "12ch", display: "inline-block" }}>
                      {reading ? `${reading.copX >= 0 ? "+" : ""}${reading.copX.toFixed(2)} (${reading.copXMm >= 0 ? "+" : ""}${reading.copXMm.toFixed(1)} mm)` : "--"}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Y (Anteroposterior: Back -Y / Front +Y): </span>
                    <span style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-main)", minWidth: "12ch", display: "inline-block" }}>
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

      {/* Secondary Hardware Card: Camera & Vision Hardware */}
      <Card
        title="Camera & Vision Hardware"
        subtitle="Lenovo Webcam & Intel RealSense D455f Dual-Camera System"
        icon={<Camera size={20} />}
        headerAction={
          <StatusBadge
            status={isCameraActive ? "connected" : visionState.cameraStatus === "starting" ? "scanning" : "ready"}
            label={isCameraActive ? "Active Feed" : "Ready"}
          />
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Dual Camera Ground Truth Inventory */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            {/* Lenovo Webcam Ground Truth Card */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "var(--bg-app)",
                border: "1px solid var(--border-light)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--green-primary)",
                    }}
                  />
                  <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-main)" }}>
                    Lenovo Integrated Camera
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--green-primary)",
                    background: "var(--bg-subtle-mint)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Started / Online
                </span>
              </div>

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div><strong>Hardware ID:</strong> <code>USB\VID_5986&PID_216A</code> (SunplusIT)</div>
                <div><strong>Capabilities:</strong> 2D RGB Stream • MediaPipe 33-Joint Pose</div>
                <div><strong>Status:</strong> {visionState.activeCameraLabel && isLenovoCameraLabel(visionState.activeCameraLabel) ? "Active Video Source" : "Standby / Available"}</div>
              </div>
            </div>

            {/* Intel RealSense D455f Ground Truth Card */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: visionState.isRealSenseAvailable ? "var(--bg-subtle-mint)" : "#FFFBEB",
                border: `1px solid ${visionState.isRealSenseAvailable ? "var(--border-mint)" : "#FDE68A"}`,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: visionState.isRealSenseAvailable ? "var(--green-primary)" : "#D97706",
                    }}
                  />
                  <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-main)" }}>
                    Intel RealSense D455f
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: visionState.isRealSenseAvailable ? "var(--green-primary)" : "#B45309",
                    background: visionState.isRealSenseAvailable ? "var(--bg-subtle-mint)" : "#FEF3C7",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  {visionState.isRealSenseAvailable ? "Connected" : "Disconnected (USB)"}
                </span>
              </div>

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div><strong>Serial Number:</strong> <code>250343060869</code> (Known PnP Device)</div>
                <div><strong>Hardware ID:</strong> <code>USB\VID_8086&PID_0B5C</code> (Depth MI_00, RGB MI_03)</div>
                <div>
                  <strong>RGB Sensor:</strong>{" "}
                  {visionState.isRealSenseAvailable ? (
                    <span style={{ color: "var(--green-primary)", fontWeight: 700 }}>Available</span>
                  ) : (
                    <span style={{ color: "#B45309" }}>Disconnected</span>
                  )}
                  {" • "}
                  <strong>Depth:</strong>{" "}
                  <span style={{ color: "var(--text-muted)" }}>
                    {visionState.isRealSenseAvailable ? "Native Stream (Z16)" : "Disconnected"}
                  </span>
                </div>
                {!visionState.isRealSenseAvailable && (
                  <div style={{ color: "#92400E", fontSize: "0.6875rem", marginTop: "2px" }}>
                    &bull; Plug Intel RealSense D455f into a high-speed USB 3.0 port to enable.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Camera Selection & Stream Diagnostics */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "10px",
              background: "#F8FAFC",
              border: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-muted)" }}>
                Selected Video Input:
              </span>
              <select
                value={visionState.selectedCameraId || (visionState.availableCameras[0]?.deviceId ?? "")}
                onChange={async (e) => {
                  const devId = e.target.value;
                  if (devId === "realsense-disconnected") {
                    alert("Intel RealSense D455f is physically disconnected. Please connect the USB 3.0 cable.");
                    return;
                  }
                  await switchCamera(devId);
                }}
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "#FFFFFF",
                  color: "var(--text-main)",
                  cursor: "pointer",
                }}
              >
                {visionState.availableCameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.isRealSenseRgb
                      ? "Intel RealSense D455f (RGB Active)"
                      : isLenovoCameraLabel(cam.label)
                      ? "Lenovo Integrated Camera"
                      : cam.label || "Webcam"}
                  </option>
                ))}
                {!visionState.isRealSenseAvailable && (
                  <option value="realsense-disconnected">
                    Intel RealSense D455f (Disconnected)
                  </option>
                )}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "0.75rem" }}>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Active Resolution: </span>
                <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {visionState.activeResolution}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>MediaPipe Pose: </span>
                <span style={{ fontWeight: 700, color: visionState.hasPose ? "var(--green-primary)" : "var(--text-muted)" }}>
                  {visionState.hasPose ? "Tracking (33 Joints)" : visionState.modelsLoaded ? "Ready" : "Standby"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px", paddingTop: "6px" }}>
            {!isCameraActive ? (
              <button
                onClick={() => startCamera()}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                <Camera size={16} />
                <span>Start Camera Stream &amp; Vision Engine</span>
              </button>
            ) : (
              <button
                onClick={() => stopCamera()}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                <Camera size={16} />
                <span>Stop Camera Stream</span>
              </button>
            )}

            <button
              onClick={async () => {
                setIsRefreshingCameras(true);
                try {
                  await enumerateCameras(true);
                } finally {
                  setIsRefreshingCameras(false);
                }
              }}
              disabled={isRefreshingCameras}
              className="btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <RefreshCw size={15} className={isRefreshingCameras ? "spin" : ""} />
              <span>{isRefreshingCameras ? "Refreshing..." : "Rescan Cameras"}</span>
            </button>
          </div>
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
