import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  CenterStanceSnapshot,
  NamedNormPoint,
  Pose2DAngleVectorSpec,
} from "../../utils/pose2dAngles";

interface CenterStanceVectorPanelProps {
  snapshot: CenterStanceSnapshot;
}

interface NormBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Person crop in normalized image space.
 * Keep FULL frame height (head→feet never clipped) and only trim empty sides.
 */
function personCropBox(snapshot: CenterStanceSnapshot): NormBox {
  const pts: { x: number; y: number }[] = [];
  for (const v of snapshot.vectors) {
    for (const p of v.points) {
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push(p);
    }
  }
  if (snapshot.midHip) pts.push(snapshot.midHip);
  if (snapshot.midShoulder) pts.push(snapshot.midShoulder);
  if (snapshot.leftHip) pts.push(snapshot.leftHip);
  if (snapshot.rightHip) pts.push(snapshot.rightHip);

  if (pts.length === 0) {
    return { x0: 0.08, y0: 0, x1: 0.92, y1: 1 };
  }

  let minX = 1;
  let maxX = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }

  const w = Math.max(0.12, maxX - minX);
  const padX = Math.max(0.12, w * 0.55);
  const x0 = Math.max(0, minX - padX);
  const x1 = Math.min(1, maxX + padX);

  // Always keep full vertical frame so head/feet stay visible
  return { x0, y0: 0, x1, y1: 1 };
}

/** Map normalized full-frame point → pixel inside the cropped bitmap. */
function toCropPixels(
  p: { x: number; y: number },
  box: NormBox,
  cropW: number,
  cropH: number
): { x: number; y: number } {
  const bw = Math.max(1e-6, box.x1 - box.x0);
  const bh = Math.max(1e-6, box.y1 - box.y0);
  return {
    x: ((p.x - box.x0) / bw) * cropW,
    y: ((p.y - box.y0) / bh) * cropH,
  };
}

/** Stable undirected edge id from landmark names. */
function edgeKey(aName: string, bName: string): string {
  return aName < bName ? `${aName}|${bName}` : `${bName}|${aName}`;
}

interface SkeletonEdge {
  key: string;
  a: NamedNormPoint;
  b: NamedNormPoint;
}

/** Unique MediaPipe bone segments from all angle vectors (A–B–C → AB+BC). */
function buildSkeletonEdges(vectors: Pose2DAngleVectorSpec[]): SkeletonEdge[] {
  const map = new Map<string, SkeletonEdge>();
  for (const v of vectors) {
    const pts = v.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const key = edgeKey(a.name, b.name);
      if (!map.has(key)) map.set(key, { key, a, b });
    }
  }
  return [...map.values()];
}

/** Bone keys that belong to the selected joint (become dotted). */
function selectedEdgeKeys(v: Pose2DAngleVectorSpec | null): Set<string> {
  const keys = new Set<string>();
  if (!v) return keys;
  for (let i = 0; i < v.points.length - 1; i++) {
    keys.add(edgeKey(v.points[i]!.name, v.points[i + 1]!.name));
  }
  return keys;
}

/**
 * SVG path for the interior angle arc at B (A–B–C) — the “)” mark that shows
 * which angle is being measured.
 */
function angleArcPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  radius: number
): { d: string; labelX: number; labelY: number } | null {
  const angA = Math.atan2(a.y - b.y, a.x - b.x);
  const angC = Math.atan2(c.y - b.y, c.x - b.x);
  let delta = angC - angA;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  // Sweep the shorter interior arc (matches 0–180° joint angle)
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  const x1 = b.x + Math.cos(angA) * radius;
  const y1 = b.y + Math.sin(angA) * radius;
  const x2 = b.x + Math.cos(angC) * radius;
  const y2 = b.y + Math.sin(angC) * radius;
  const mid = angA + delta / 2;
  return {
    d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    labelX: b.x + Math.cos(mid) * (radius + 16),
    labelY: b.y + Math.sin(mid) * (radius + 16),
  };
}

/**
 * Compact trigger + popup viewer:
 * - Person-cropped camera still (background sides removed via pose bbox)
 * - MediaPipe skeleton overlay; selected joint bones become dotted
 */
export const CenterStanceVectorPanel: React.FC<CenterStanceVectorPanelProps> = ({
  snapshot,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    snapshot.vectors[0]?.key ?? null
  );
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [cropSize, setCropSize] = useState<{ w: number; h: number } | null>(null);
  const [cropReady, setCropReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const cropBox = useMemo(() => personCropBox(snapshot), [snapshot]);

  const selected: Pose2DAngleVectorSpec | null = useMemo(
    () => snapshot.vectors.find((v) => v.key === selectedKey) ?? snapshot.vectors[0] ?? null,
    [snapshot.vectors, selectedKey]
  );

  // Crop full frame → full-body person still (pixel aspect matches source)
  useEffect(() => {
    let cancelled = false;
    setCropReady(false);
    setCroppedUrl(null);
    setCropSize(null);

    if (!snapshot.imageDataUrl) {
      setCropReady(true);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const iw = img.naturalWidth || snapshot.imageWidth || 1;
        const ih = img.naturalHeight || snapshot.imageHeight || 1;
        const sx = Math.floor(cropBox.x0 * iw);
        const sy = Math.floor(cropBox.y0 * ih);
        const sw = Math.max(1, Math.floor((cropBox.x1 - cropBox.x0) * iw));
        const sh = Math.max(1, Math.floor((cropBox.y1 - cropBox.y0) * ih));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fall back to full frame — overlay must use full-frame identity crop
          setCroppedUrl(snapshot.imageDataUrl);
          setCropSize({ w: iw, h: ih });
          setCropReady(true);
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        setCroppedUrl(canvas.toDataURL("image/jpeg", 0.92));
        setCropSize({ w: sw, h: sh });
      } catch {
        const iw = snapshot.imageWidth || 720;
        const ih = snapshot.imageHeight || 540;
        setCroppedUrl(snapshot.imageDataUrl);
        setCropSize({ w: iw, h: ih });
      }
      setCropReady(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setCroppedUrl(snapshot.imageDataUrl);
      setCropSize({
        w: snapshot.imageWidth || 720,
        h: snapshot.imageHeight || 540,
      });
      setCropReady(true);
    };
    img.src = snapshot.imageDataUrl;

    return () => {
      cancelled = true;
    };
  }, [snapshot.imageDataUrl, snapshot.imageWidth, snapshot.imageHeight, cropBox]);

  const displayUrl = croppedUrl ?? snapshot.imageDataUrl;
  const usedCrop =
    croppedUrl !== null &&
    cropSize !== null &&
    croppedUrl !== snapshot.imageDataUrl;
  const overlayBox: NormBox = usedCrop ? cropBox : { x0: 0, y0: 0, x1: 1, y1: 1 };

  // SVG viewBox must match displayed bitmap pixels (fixes person clipped / vectors off-frame)
  const viewW = cropSize?.w ?? Math.max(1, snapshot.imageWidth || 720);
  const viewH = cropSize?.h ?? Math.max(1, snapshot.imageHeight || 540);

  const toPx = useCallback(
    (p: { x: number; y: number }) => toCropPixels(p, overlayBox, viewW, viewH),
    [overlayBox, viewW, viewH]
  );

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const openModal = () => {
    resetView();
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    dragRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const STAGE_H = "min(68vh, 720px)";

  const bumpZoom = (next: number) => {
    const z = Math.max(1, Math.min(4, parseFloat(next.toFixed(2))));
    setZoom(z);
    if (z <= 1) setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    bumpZoom(zoom + delta);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({
      x: d.panX + (e.clientX - d.x),
      y: d.panY + (e.clientY - d.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Compact inline preview / open button
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
          padding: "14px 16px",
          borderRadius: 12,
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
          <div
            style={{
              width: 72,
              height: 96,
              borderRadius: 8,
              overflow: "hidden",
              background: "#E2E8F0",
              border: "1px solid #CBD5E1",
              flexShrink: 0,
            }}
          >
            {displayUrl ? (
              <img
                src={displayUrl}
                alt="Center stance preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#0F766E",
              }}
            >
              Center stance snapshot (3s hold)
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#64748B", lineHeight: 1.45 }}>
              Yellow MediaPipe skeleton. Select a joint — those bones turn dotted in a highlight
              color (same skeleton, not a second overlay).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openModal}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #99F6E4",
            background: "#F0FDFA",
            color: "#0F766E",
            fontWeight: 800,
            fontSize: "0.8125rem",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Maximize2 size={16} />
          Open stance viewer
        </button>
      </div>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Center stance viewer"
            onClick={closeModal}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100000,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              boxSizing: "border-box",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1100px, 96vw)",
                maxHeight: "94vh",
                overflow: "auto",
                background: "#FFFFFF",
                borderRadius: 16,
                border: "1px solid #E2E8F0",
                boxShadow: "0 24px 64px rgba(15, 23, 42, 0.35)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 18px",
                  borderBottom: "1px solid #E2E8F0",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#0F766E",
                    }}
                  >
                    Center stance · person crop
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#64748B", marginTop: 2 }}>
                    Tap a joint — its yellow bones become dotted · scroll / + − to zoom · drag to pan
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => bumpZoom(zoom - 0.25)}
                    style={toolBtnStyle}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      color: "#0F172A",
                      minWidth: 48,
                      textAlign: "center",
                    }}
                  >
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => bumpZoom(zoom + 0.25)}
                    style={toolBtnStyle}
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button type="button" onClick={resetView} style={toolBtnStyle}>
                    Reset
                  </button>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={closeModal}
                    style={{ ...toolBtnStyle, borderColor: "#FECACA", color: "#B91C1C" }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Big image stage — entire person visible at 100% (no mid-body clip) */}
              <div
                style={{
                  position: "relative",
                  background: "#0F172A",
                  overflow: "hidden",
                  height: STAGE_H,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: zoom > 1 ? "grab" : "default",
                  touchAction: "none",
                }}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {!cropReady && (
                  <div style={{ color: "#94A3B8", fontSize: "0.875rem", fontWeight: 600 }}>
                    Cropping person…
                  </div>
                )}
                {cropReady && displayUrl && (
                  <div
                    style={{
                      position: "relative",
                      lineHeight: 0,
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: "center center",
                      transition: dragRef.current ? "none" : "transform 0.08s ease-out",
                    }}
                  >
                    <img
                      src={displayUrl}
                      alt="Center stance person crop"
                      draggable={false}
                      style={{
                        display: "block",
                        // Fit full person inside stage at zoom=1
                        maxHeight: STAGE_H,
                        maxWidth: "min(96%, 900px)",
                        width: "auto",
                        height: "auto",
                        borderRadius: 4,
                        userSelect: "none",
                      }}
                    />
                    <svg
                      viewBox={`0 0 ${viewW} ${viewH}`}
                      preserveAspectRatio="xMidYMid meet"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                      }}
                    >
                      {(() => {
                        const edges = buildSkeletonEdges(snapshot.vectors);
                        const activeKeys = selectedEdgeKeys(selected);
                        // Same skeleton: yellow base → selected bones become dotted highlight
                        const yellow = "#EAB308";
                        const highlight = "#2563EB";

                        return (
                          <g>
                            {/* 1) Full yellow skeleton (solid) */}
                            {edges.map((e) => {
                              const a = toPx(e.a);
                              const b = toPx(e.b);
                              if (activeKeys.has(e.key)) return null;
                              return (
                                <line
                                  key={e.key}
                                  x1={a.x}
                                  y1={a.y}
                                  x2={b.x}
                                  y2={b.y}
                                  stroke={yellow}
                                  strokeWidth={3.25}
                                  strokeLinecap="round"
                                  opacity={0.95}
                                />
                              );
                            })}
                            {/* 2) Selected bones of THAT skeleton — dotted + blue (not a second overlay) */}
                            {edges.map((e) => {
                              if (!activeKeys.has(e.key)) return null;
                              const a = toPx(e.a);
                              const b = toPx(e.b);
                              return (
                                <line
                                  key={`sel-${e.key}`}
                                  x1={a.x}
                                  y1={a.y}
                                  x2={b.x}
                                  y2={b.y}
                                  stroke={highlight}
                                  strokeWidth={4.25}
                                  strokeDasharray="7 5"
                                  strokeLinecap="round"
                                  opacity={1}
                                />
                              );
                            })}
                            {/* Landmark dots — selected joints use highlight */}
                            {edges.flatMap((e) => [e.a, e.b]).filter((p, i, arr) =>
                              arr.findIndex((q) => q.name === p.name) === i
                            ).map((p) => {
                              const pt = toPx(p);
                              const onSelected = selected?.points.some((sp) => sp.name === p.name);
                              return (
                                <circle
                                  key={p.name}
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={onSelected ? 7 : 4}
                                  fill={onSelected ? highlight : "#FFFFFF"}
                                  stroke={onSelected ? highlight : yellow}
                                  strokeWidth={onSelected ? 2.5 : 2}
                                />
                              );
                            })}
                            {/* Angle “)” arc at joint B for the selected A–B–C vectors */}
                            {selected &&
                              selected.points.length >= 3 &&
                              (() => {
                                const A = toPx(selected.points[0]!);
                                const B = toPx(selected.points[1]!);
                                const C = toPx(selected.points[2]!);
                                const lenAB = Math.hypot(A.x - B.x, A.y - B.y);
                                const lenCB = Math.hypot(C.x - B.x, C.y - B.y);
                                const radius = Math.max(
                                  22,
                                  Math.min(48, Math.min(lenAB, lenCB) * 0.38)
                                );
                                const arc = angleArcPath(A, B, C, radius);
                                if (!arc) return null;
                                return (
                                  <g key={`angle-arc-${selected.key}`}>
                                    <path
                                      d={arc.d}
                                      fill="none"
                                      stroke={highlight}
                                      strokeWidth={3.5}
                                      strokeLinecap="round"
                                      opacity={0.95}
                                    />
                                  </g>
                                );
                              })()}
                          </g>
                        );
                      })()}
                      {snapshot.midHip && (
                        (() => {
                          const h = toPx(snapshot.midHip);
                          return (
                            <g>
                              <line x1={h.x - 16} y1={h.y} x2={h.x + 16} y2={h.y} stroke="#DB2777" strokeWidth={3} />
                              <line x1={h.x} y1={h.y - 16} x2={h.x} y2={h.y + 16} stroke="#DB2777" strokeWidth={3} />
                              <circle cx={h.x} cy={h.y} r={6} fill="#DB2777" stroke="#FFFFFF" strokeWidth={2} />
                            </g>
                          );
                        })()
                      )}
                    </svg>
                  </div>
                )}
                {cropReady && !displayUrl && (
                  <div style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
                    No camera image was available at capture time.
                  </div>
                )}
              </div>

              {/* Selected joint caption */}
              {selected && (
                <div
                  style={{
                    padding: "10px 18px",
                    borderTop: "1px solid #F1F5F9",
                    borderBottom: "1px solid #F1F5F9",
                    background: "#F8FAFC",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span style={{ fontWeight: 800, color: selected.color }}>
                    {selected.label}
                  </span>
                  <span style={{ color: "#64748B", marginLeft: 10 }}>{selected.vectorDescription}</span>
                </div>
              )}

              {/* Joint buttons only */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  padding: "14px 18px 18px",
                }}
              >
                {snapshot.vectors.map((v) => {
                  const active = selected?.key === v.key;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => setSelectedKey(v.key)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: active ? `2px solid ${v.color}` : "1px solid #E2E8F0",
                        background: active ? "#FFFFFF" : "#F8FAFC",
                        color: active ? v.color : "#334155",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: active ? `0 0 0 3px ${v.color}22` : undefined,
                      }}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

const toolBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  minWidth: 36,
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 700,
  fontSize: "0.75rem",
  cursor: "pointer",
};
