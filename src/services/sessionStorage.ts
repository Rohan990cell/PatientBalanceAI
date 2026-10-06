import { BalanceSession, SavedSessionSummary } from "../types/session";

/**
 * Service to handle persistent storage of balance sessions.
 * Interacts with Tauri native backend commands when running in desktop mode,
 * with fallback to persistent browser storage for dev/testing.
 */
export class SessionStorageService {
  private static isTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  }

  /**
   * Save a completed BalanceSession to local disk.
   * Returns the file path where the session JSON was written.
   */
  public static async saveSession(session: BalanceSession): Promise<string> {
    if (!session || !session.sessionId) {
      throw new Error("Invalid session: Missing sessionId");
    }

    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const filePath = await invoke<string>("save_balance_session", { session });
        return filePath;
      } catch (err) {
        console.error("Tauri save_balance_session failed:", err);
        throw new Error(`Failed to save session to disk: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // Browser / Test Runner fallback persistence
      try {
        const key = `pb_session_${session.sessionId}`;
        localStorage.setItem(key, JSON.stringify(session));

        // Update index list
        const indexKey = "pb_sessions_index";
        const rawIndex = localStorage.getItem(indexKey);
        const index: SavedSessionSummary[] = rawIndex ? JSON.parse(rawIndex) : [];

        // Remove duplicate if exists
        const filtered = index.filter((s) => s.sessionId !== session.sessionId);
        filtered.unshift({
          sessionId: session.sessionId,
          patientId: session.patientId,
          patientName: session.patientName,
          startTime: session.startTime,
          durationMs: session.durationMs,
          durationFormatted: session.summary.durationFormatted,
          measurementCount: session.measurementCount,
          dataSource: session.dataSource,
          filePath: `localstorage://${session.sessionId}.json`,
        });

        localStorage.setItem(indexKey, JSON.stringify(filtered));
        return `localstorage://${session.sessionId}.json`;
      } catch (err) {
        console.error("Browser fallback save failed:", err);
        throw new Error(`Failed to save session locally: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Load and verify a saved BalanceSession by sessionId.
   */
  public static async loadSession(sessionId: string): Promise<BalanceSession> {
    if (!sessionId) {
      throw new Error("Missing sessionId");
    }

    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const session = await invoke<BalanceSession>("load_balance_session", { sessionId });
        return session;
      } catch (err) {
        console.error("Tauri load_balance_session failed:", err);
        throw new Error(`Failed to load session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      const key = `pb_session_${sessionId}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        throw new Error(`Session ${sessionId} not found in local storage`);
      }
      return JSON.parse(raw) as BalanceSession;
    }
  }

  /**
   * List all saved session summaries.
   */
  public static async listSavedSessions(): Promise<SavedSessionSummary[]> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const list = await invoke<SavedSessionSummary[]>("list_saved_sessions");
        return list;
      } catch (err) {
        console.error("Tauri list_saved_sessions failed:", err);
        return [];
      }
    } else {
      try {
        const indexKey = "pb_sessions_index";
        const rawIndex = localStorage.getItem(indexKey);
        return rawIndex ? JSON.parse(rawIndex) : [];
      } catch {
        return [];
      }
    }
  }
}
