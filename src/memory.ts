import { Database } from "bun:sqlite";
import type { Message } from "./types.ts";

export class Memory {
  private db: Database;
  private maxMessages: number;

  constructor(path: string, maxMessages: number = 50) {
    this.db = new Database(path);
    this.maxMessages = maxMessages;
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        scheduled_at DATETIME,
        last_run DATETIME,
        result TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    `);
  }

  // Session-based message storage
  addMessage(sessionId: string, role: "user" | "assistant" | "system", content: string): void {
    const stmt = this.db.prepare(
      "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)"
    );
    stmt.run(sessionId, role, content);

    // Trim old messages per session
    this.trimMessages(sessionId);
  }

  getMessages(sessionId: string, limit?: number): Message[] {
    const lim = limit || this.maxMessages;
    const stmt = this.db.prepare(
      "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
    );
    return stmt.all(sessionId, lim).reverse() as Message[];
  }

  private trimMessages(sessionId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM messages WHERE id NOT IN (
        SELECT id FROM messages WHERE session_id = ? 
        ORDER BY created_at DESC LIMIT ?
      ) AND session_id = ?
    `);
    stmt.run(sessionId, this.maxMessages, sessionId);
  }

  // Long-term facts (user preferences, important info)
  setFact(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO facts (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value, value);
  }

  getFact(key: string): string | null {
    const stmt = this.db.prepare("SELECT value FROM facts WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value || null;
  }

  getAllFacts(): Record<string, string> {
    const stmt = this.db.prepare("SELECT key, value from facts");
    const rows = stmt.all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  getAllSessionIds(): string[] {
    const stmt = this.db.prepare(
      "SELECT DISTINCT session_id FROM messages ORDER BY created_at DESC"
    );
    const rows = stmt.all() as { session_id: string }[];
    return rows.map((r) => r.session_id);
  }

  clearSession(sessionId: string): void {
    const stmt = this.db.prepare("DELETE FROM messages WHERE session_id = ?");
    stmt.run(sessionId);
  }

  getMessageCount(sessionId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE session_id = ?"
    );
    const row = stmt.get(sessionId) as { count: number };
    return row?.count || 0;
  }

  // Scheduled tasks
  getPendingTasks(): { id: number; name: string; scheduled_at: string }[] {
    const stmt = this.db.prepare(`
      SELECT id, name, scheduled_at FROM tasks 
      WHERE status = 'pending' AND datetime(scheduled_at) <= datetime('now')
    `);
    return stmt.all() as { id: number; name: string; scheduled_at: string }[];
  }

  markTaskRun(id: number, result: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET status = 'completed', last_run = CURRENT_TIMESTAMP, result = ?
      WHERE id = ?
    `);
    stmt.run(result, id);
  }

  close(): void {
    this.db.close();
  }
}