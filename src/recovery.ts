/**
 * Crash Recovery System
 * Detects and recovers from crashed sessions
 */

import { Database } from "bun:sqlite";

export interface CrashCheckpoint {
  id: number;
  timestamp: number;
  session_id: string;
  status: "active" | "crashed" | "completed";
  last_input: string;
  created_at: string;
}

export class CrashRecovery {
  private db: Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath.replace(".db", "_recovery.db");
    this.db = new Database(this.dbPath);
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS recovery_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp REAL NOT NULL,
        session_id TEXT,
        status TEXT DEFAULT 'active',
        last_input TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Save a checkpoint before processing
  save(sessionId: string, input: string): void {
    this.db.run(
      "INSERT INTO recovery_checkpoints (timestamp, session_id, last_input) VALUES (?, ?, ?)",
      Date.now(), sessionId, input
    );
    // Prune old checkpoints (keep last 10 per session)
    this.db.run(`
      DELETE FROM recovery_checkpoints WHERE id NOT IN (
        SELECT id FROM recovery_checkpoints WHERE session_id = ? ORDER BY timestamp DESC LIMIT 10
      ) AND session_id = ?
    `, sessionId, sessionId);
  }

  // Mark all active checkpoints as crashed (call on startup if recovery needed)
  markCrashed(sessionId?: string): void {
    if (sessionId) {
      this.db.run(
        "UPDATE recovery_checkpoints SET status = 'crashed' WHERE session_id = ? AND status = 'active'",
        sessionId
      );
    } else {
      this.db.run("UPDATE recovery_checkpoints SET status = 'crashed' WHERE status = 'active'");
    }
  }

  // Get crashed checkpoints for recovery
  getCrashed(): CrashCheckpoint[] {
    return this.db
      .prepare("SELECT * FROM recovery_checkpoints WHERE status = 'crashed' ORDER BY timestamp DESC LIMIT 10")
      .all() as CrashCheckpoint[];
  }

  // Mark clean shutdown
  markClean(sessionId?: string): void {
    if (sessionId) {
      this.db.run(
        "UPDATE recovery_checkpoints SET status = 'completed' WHERE session_id = ? AND status = 'active'",
        sessionId
      );
    } else {
      this.db.run("UPDATE recovery_checkpoints SET status = 'completed' WHERE status = 'active'");
    }
  }

  // Check if recovery is needed
  needsRecovery(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM recovery_checkpoints WHERE status = 'crashed'")
      .get() as { count: number };
    return row.count > 0;
  }

  // Get recovery status for display
  getStatus(): string {
    const crashed = this.getCrashed();
    const active = this.db
      .prepare("SELECT COUNT(*) as count FROM recovery_checkpoints WHERE status = 'active'")
      .get() as { count: number };

    let output = "═════════ RECOVERY STATUS ═════════\n\n";

    if (crashed.length > 0) {
      output += "⚠️  CRASHED SESSIONS:\n";
      for (const c of crashed) {
        output += `  [${c.session_id}] ${c.last_input?.slice(0, 40)}...\n`;
        output += `    Time: ${c.created_at}\n`;
      }
      output += "\nRun 'velo recover' to resume.\n";
    } else {
      output += "✓ No crashed sessions found.\n";
    }

    output += `\n📊 Active checkpoints: ${active.count}\n`;
    output += "\n═══════════════════════════════";
    return output;
  }

  close(): void {
    this.db.close();
  }
}