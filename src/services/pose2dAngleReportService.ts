import {
  Pose2DAngleSessionReport,
  POSE_2D_ANGLE_METRIC_KEYS,
  POSE_2D_ANGLE_METRIC_LABELS,
} from "../utils/pose2dAngles";

export interface Pose2DAngleReportMeta {
  sessionId: string;
  patientId?: string;
  patientName?: string;
  sessionDate?: string;
  isRealHardware?: boolean;
}

export interface SavePose2DAngleReportResult {
  success: boolean;
  jsonPath: string;
  anglesCsvPath: string;
  changesCsvPath: string;
  filenamePrefix: string;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function angleOrEmpty(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  return v.toFixed(1);
}

/** Absolute angles CSV: one row per board-synced target */
export function buildAnglesByTargetCsv(
  report: Pose2DAngleSessionReport,
  meta: Pose2DAngleReportMeta
): string {
  const headers = [
    "sessionId",
    "patientId",
    "patientName",
    "stepNumber",
    "targetIndex",
    "targetId",
    "targetName",
    "shortLabel",
    "targetX",
    "targetY",
    "copX",
    "copY",
    "weightKg",
    "boardSynced",
    "poseConfidence",
    "timestampIso",
    ...POSE_2D_ANGLE_METRIC_KEYS.map((k) => POSE_2D_ANGLE_METRIC_LABELS[k].replace(/\s+/g, "_")),
  ];

  const lines = [headers.map(csvEscape).join(",")];
  for (const s of report.snapshots) {
    const row = [
      meta.sessionId,
      meta.patientId ?? "",
      meta.patientName ?? "",
      s.stepNumber,
      s.targetIndex,
      s.targetId,
      s.targetName,
      s.shortLabel,
      s.targetX,
      s.targetY,
      s.copX ?? "",
      s.copY ?? "",
      s.weightKg ?? "",
      s.boardSynced ? "true" : "false",
      s.poseConfidence ?? "",
      new Date(s.timestamp).toISOString(),
      ...POSE_2D_ANGLE_METRIC_KEYS.map((k) => angleOrEmpty(s.angles[k] as number | null)),
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Delta CSV: one row per transition × metric (tidy) + wide summary rows */
export function buildAngleChangesCsv(
  report: Pose2DAngleSessionReport,
  meta: Pose2DAngleReportMeta
): string {
  const headers = [
    "sessionId",
    "patientId",
    "fromStep",
    "toStep",
    "fromLabel",
    "toLabel",
    "fromTargetName",
    "toTargetName",
    "dtSeconds",
    "boardSynced",
    "metric",
    "fromDeg",
    "toDeg",
    "deltaDeg",
  ];
  const lines = [headers.map(csvEscape).join(",")];

  for (const tr of report.transitions) {
    for (const k of POSE_2D_ANGLE_METRIC_KEYS) {
      const fromV = tr.fromAngles[k] as number | null;
      const toV = tr.toAngles[k] as number | null;
      const d = tr.deltas[k];
      lines.push(
        [
          meta.sessionId,
          meta.patientId ?? "",
          tr.fromStep,
          tr.toStep,
          tr.fromLabel,
          tr.toLabel,
          tr.fromTargetName,
          tr.toTargetName,
          (tr.dtMs / 1000).toFixed(2),
          tr.boardSynced ? "true" : "false",
          POSE_2D_ANGLE_METRIC_LABELS[k],
          angleOrEmpty(fromV),
          angleOrEmpty(toV),
          angleOrEmpty(d),
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }
  return lines.join("\r\n") + "\r\n";
}

async function writeTextLocally(filename: string, contents: string): Promise<string> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("save_text_report", { filename, contents });
    } catch (err) {
      console.warn("Tauri save_text_report failed, using browser download:", err);
    }
  }

  // Browser / fallback download
  try {
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("Browser download fallback failed:", e);
  }
  return filename;
}

/**
 * Persist board-synced 2D angle report locally as JSON + two CSVs
 * under the app reports directory (Tauri) or via download fallback.
 */
export class Pose2DAngleReportService {
  public static async saveLocally(
    report: Pose2DAngleSessionReport,
    meta: Pose2DAngleReportMeta
  ): Promise<SavePose2DAngleReportResult> {
    if (!report || !meta?.sessionId) {
      throw new Error("Invalid angle report or missing sessionId.");
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const prefix = `PatientBalanceAI_Pose2DAngles_${meta.sessionId}_${stamp}`;

    const payload = {
      schemaVersion: 1,
      reportType: "board_synced_pose_2d_angles",
      generatedAt: new Date().toISOString(),
      meta,
      syncedTargetCount: report.syncedTargetCount,
      snapshots: report.snapshots,
      transitions: report.transitions,
    };

    const jsonName = `${prefix}.json`;
    const anglesCsvName = `${prefix}_by_target.csv`;
    const changesCsvName = `${prefix}_changes.csv`;

    const jsonPath = await writeTextLocally(jsonName, JSON.stringify(payload, null, 2));
    const anglesCsvPath = await writeTextLocally(
      anglesCsvName,
      buildAnglesByTargetCsv(report, meta)
    );
    const changesCsvPath = await writeTextLocally(
      changesCsvName,
      buildAngleChangesCsv(report, meta)
    );

    return {
      success: true,
      jsonPath,
      anglesCsvPath,
      changesCsvPath,
      filenamePrefix: prefix,
    };
  }
}
