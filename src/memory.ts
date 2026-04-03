import { Database } from "bun:sqlite";
import { getModelPricing, calculateCost, formatCost, type ModelPricing } from "./pricing.ts";
import type { Message } from "./types.ts";
import * as fs from "fs";
import * as path from "path";

// Observation types with icons for progressive disclosure
export const OBSERVATION_TYPES = {
  decision: "🟤",      // Architecture decision
  bugfix: "🟡",        // Problem-solution
  feature: "🟢",       // What-changed
  discovery: "🟣",     // Learning/insight
  gotcha: "🔴",        // Critical edge case
  "how-it-works": "🔵", // Technical explanation
  "trade-off": "⚖️",   // Deliberate compromise
  change: "📌",        // General change
} as const;

export type ObservationType = keyof typeof OBSERVATION_TYPES;

export interface Observation {
  id: number;
  session_id: string;
  channel?: string;
  type: ObservationType;
  title: string;
  narrative: string;
  facts: string[];      // JSON array
  concepts: string[];   // Tags for search
  files_referenced?: string;
  tool_name?: string;
  created_at: number;
}

export interface SessionSummary {
  id: number;
  session_id: string;
  started_at: number;
  ended_at?: number;
  user_goal?: string;
  completed?: string;
  learned?: string;
  next_steps?: string;
  message_count: number;
  token_usage?: number;
}

export interface UserPrompt {
  id: number;
  session_id: string;
  prompt_text: string;
  created_at: number;
}

export class Memory {
  private db: Database;
  private maxMessages: number;

  constructor(dbPath: string, maxMessages: number = 50) {
    // Ensure directory exists before opening database
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.maxMessages = maxMessages;
    this.init();
  }

  private init() {
    // Enable WAL mode for better concurrent performance
    this.db.run("PRAGMA journal_mode = WAL");
    
    // Original tables
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
      
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        confidence REAL DEFAULT 0.6,
        learned_from TEXT DEFAULT '[]',
        last_reinforced INTEGER,
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
      
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS compaction_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        messages_compacted INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
    `);

    // NEW: Observations table (structured learnings)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        channel TEXT,
        type TEXT NOT NULL DEFAULT 'change',
        title TEXT NOT NULL,
        narrative TEXT,
        facts TEXT DEFAULT '[]',
        concepts TEXT DEFAULT '[]',
        files_referenced TEXT,
        tool_name TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at DESC);
    `);

    // NEW: Session summaries table (cross-session context)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        user_goal TEXT,
        completed TEXT,
        learned TEXT,
        next_steps TEXT,
        message_count INTEGER DEFAULT 0,
        token_usage INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_session_summaries_started ON session_summaries(started_at DESC);
    `);

    // NEW: User prompts table (prompt history)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_prompts_session ON user_prompts(session_id);
      CREATE INDEX IF NOT EXISTS idx_user_prompts_created ON user_prompts(created_at DESC);
    `);

    // NEW: FTS5 virtual tables for full-text search
    this.initFTS5();
  }

  private initFTS5() {
    // Check if FTS5 tables already exist
    const checkFTS = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'"
    );
    if (checkFTS.get()) return; // Already initialized

    // FTS5 for observations
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
        title,
        narrative,
        facts,
        concepts,
        content='observations',
        content_rowid='id'
      )
    `);

    // FTS5 for session summaries
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
        user_goal,
        completed,
        learned,
        next_steps,
        content='session_summaries',
        content_rowid='id'
      )
    `);

    // FTS5 for user prompts
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS user_prompts_fts USING fts5(
        prompt_text,
        content='user_prompts',
        content_rowid='id'
      )
    `);

    // Sync triggers for observations
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, narrative, facts, concepts)
        VALUES (new.id, new.title, new.narrative, new.facts, new.concepts);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, narrative, facts, concepts)
        VALUES('delete', old.id, old.title, old.narrative, old.facts, old.concepts);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, narrative, facts, concepts)
        VALUES('delete', old.id, old.title, old.narrative, old.facts, old.concepts);
        INSERT INTO observations_fts(rowid, title, narrative, facts, concepts)
        VALUES (new.id, new.title, new.narrative, new.facts, new.concepts);
      END
    `);

    // Sync triggers for session summaries
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(rowid, user_goal, completed, learned, next_steps)
        VALUES (new.id, new.user_goal, new.completed, new.learned, new.next_steps);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, user_goal, completed, learned, next_steps)
        VALUES('delete', old.id, old.user_goal, old.completed, old.learned, old.next_steps);
      END
    `);

    // Sync triggers for user prompts
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS user_prompts_ai AFTER INSERT ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS user_prompts_ad AFTER DELETE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
      END
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

  // Get ALL messages for a session (for compaction check)
  getAllMessages(sessionId: string): Message[] {
    const stmt = this.db.prepare(
      "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC"
    );
    return stmt.all(sessionId) as Message[];
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

  // Replace old messages with a compaction summary
  compactSession(sessionId: string, keepRecent: number, summary: string): void {
    // Get IDs of messages to delete
    const deleteStmt = this.db.prepare(`
      DELETE FROM messages WHERE session_id = ? 
      AND id NOT IN (
        SELECT id FROM messages WHERE session_id = ? 
        ORDER BY created_at DESC LIMIT ?
      )
    `);
    deleteStmt.run(sessionId, sessionId, keepRecent);

    // Insert summary at the beginning
    const insertStmt = this.db.prepare(
      "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime('now', '-1 minute'))"
    );
    insertStmt.run(sessionId, "system", `[CONVERSATION SUMMARY]\n${summary}\n[END SUMMARY]`);

    // Record compaction
    const recordStmt = this.db.prepare(
      "INSERT INTO compaction_summaries (session_id, summary, messages_compacted) VALUES (?, ?, ?)"
    );
    recordStmt.run(sessionId, summary, keepRecent);

    console.log(`[Memory] Compacted session ${sessionId}, kept ${keepRecent} recent messages`);
  }

  // Get compaction history
  getCompactionHistory(sessionId: string): { summary: string; messages_compacted: number; created_at: string }[] {
    const stmt = this.db.prepare(
      "SELECT summary, messages_compacted, created_at FROM compaction_summaries WHERE session_id = ? ORDER BY created_at DESC"
    );
    return stmt.all(sessionId) as { summary: string; messages_compacted: number; created_at: string }[];
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

  // Token usage tracking
  addUsage(sessionId: string, promptTokens: number, completionTokens: number, totalTokens: number, model?: string): void {
    const stmt = this.db.prepare(
      "INSERT INTO usage (session_id, prompt_tokens, completion_tokens, total_tokens, model) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run(sessionId, promptTokens, completionTokens, totalTokens, model || null);
  }

  getSessionUsage(sessionId: string): { promptTokens: number; completionTokens: number; totalTokens: number; apiCalls: number } {
    const stmt = this.db.prepare(`
      SELECT 
        SUM(prompt_tokens) as promptTokens,
        SUM(completion_tokens) as completionTokens,
        SUM(total_tokens) as totalTokens,
        COUNT(*) as apiCalls
      FROM usage WHERE session_id = ?
    `);
    const row = stmt.get(sessionId) as { promptTokens: number; completionTokens: number; totalTokens: number; apiCalls: number } | undefined;
    return row || { promptTokens: 0, completionTokens: 0, totalTokens: 0, apiCalls: 0 };
  }

  getTotalUsage(): { promptTokens: number; completionTokens: number; totalTokens: number; apiCalls: number; sessions: number } {
    const stmt = this.db.prepare(`
      SELECT 
        SUM(prompt_tokens) as promptTokens,
        SUM(completion_tokens) as completionTokens,
        SUM(total_tokens) as totalTokens,
        COUNT(*) as apiCalls,
        COUNT(DISTINCT session_id) as sessions
      FROM usage
    `);
    const row = stmt.get() as { promptTokens: number; completionTokens: number; totalTokens: number; apiCalls: number; sessions: number } | undefined;
    return row || { promptTokens: 0, completionTokens: 0, totalTokens: 0, apiCalls: 0, sessions: 0 };
  }

  clearUsage(sessionId?: string): void {
    if (sessionId) {
      this.db.run("DELETE FROM usage WHERE session_id = ?", sessionId);
    } else {
      this.db.run("DELETE FROM usage");
    }
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

  // ===========================================
  // NEW: OBSERVATIONS (Structured Learnings)
  // ===========================================

  addObservation(
    sessionId: string,
    type: ObservationType,
    title: string,
    narrative: string,
    facts: string[] = [],
    concepts: string[] = [],
    options?: { channel?: string; files_referenced?: string; tool_name?: string }
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO observations (session_id, channel, type, title, narrative, facts, concepts, files_referenced, tool_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      sessionId,
      options?.channel || null,
      type,
      title,
      narrative,
      JSON.stringify(facts),
      JSON.stringify(concepts),
      options?.files_referenced || null,
      options?.tool_name || null
    );
    return result.lastInsertRowid as number;
  }

  getObservation(id: number): Observation | null {
    const stmt = this.db.prepare("SELECT * FROM observations WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      facts: JSON.parse(row.facts || "[]"),
      concepts: JSON.parse(row.concepts || "[]"),
    } as Observation;
  }

  getObservationsBySession(sessionId: string, limit: number = 50): Observation[] {
    const stmt = this.db.prepare(
      "SELECT * FROM observations WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
    );
    const rows = stmt.all(sessionId, limit) as any[];
    return rows.map((row) => ({
      ...row,
      facts: JSON.parse(row.facts || "[]"),
      concepts: JSON.parse(row.concepts || "[]"),
    })) as Observation[];
  }

  getRecentObservations(limit: number = 50): Observation[] {
    const stmt = this.db.prepare(
      "SELECT * FROM observations ORDER BY created_at DESC LIMIT ?"
    );
    const rows = stmt.all(limit) as any[];
    return rows.map((row) => ({
      ...row,
      facts: JSON.parse(row.facts || "[]"),
      concepts: JSON.parse(row.concepts || "[]"),
    })) as Observation[];
  }

  // ===========================================
  // NEW: SESSION SUMMARIES (Cross-Session Context)
  // ===========================================

  startSession(sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO session_summaries (session_id, started_at, message_count)
      VALUES (?, ?, 0)
    `);
    stmt.run(sessionId, Math.floor(Date.now() / 1000));
  }

  updateSessionSummary(
    sessionId: string,
    updates: {
      user_goal?: string;
      completed?: string;
      learned?: string;
      next_steps?: string;
      message_count?: number;
      token_usage?: number;
    }
  ): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.user_goal !== undefined) {
      fields.push("user_goal = ?");
      values.push(updates.user_goal);
    }
    if (updates.completed !== undefined) {
      fields.push("completed = ?");
      values.push(updates.completed);
    }
    if (updates.learned !== undefined) {
      fields.push("learned = ?");
      values.push(updates.learned);
    }
    if (updates.next_steps !== undefined) {
      fields.push("next_steps = ?");
      values.push(updates.next_steps);
    }
    if (updates.message_count !== undefined) {
      fields.push("message_count = ?");
      values.push(updates.message_count);
    }
    if (updates.token_usage !== undefined) {
      fields.push("token_usage = ?");
      values.push(updates.token_usage);
    }

    if (fields.length === 0) return;

    fields.push("ended_at = ?");
    values.push(Math.floor(Date.now() / 1000));
    values.push(sessionId);

    const stmt = this.db.prepare(
      `UPDATE session_summaries SET ${fields.join(", ")} WHERE session_id = ?`
    );
    stmt.run(...values);
  }

  getSessionSummary(sessionId: string): SessionSummary | null {
    const stmt = this.db.prepare("SELECT * FROM session_summaries WHERE session_id = ?");
    return stmt.get(sessionId) as SessionSummary | null;
  }

  getRecentSessionSummaries(limit: number = 10): SessionSummary[] {
    const stmt = this.db.prepare(
      "SELECT * FROM session_summaries ORDER BY started_at DESC LIMIT ?"
    );
    return stmt.all(limit) as SessionSummary[];
  }

  // ===========================================
  // NEW: USER PROMPTS (Prompt History)
  // ===========================================

  addUserPrompt(sessionId: string, promptText: string): number {
    const stmt = this.db.prepare(
      "INSERT INTO user_prompts (session_id, prompt_text) VALUES (?, ?)"
    );
    const result = stmt.run(sessionId, promptText);
    return result.lastInsertRowid as number;
  }

  getUserPrompts(sessionId: string, limit: number = 20): UserPrompt[] {
    const stmt = this.db.prepare(
      "SELECT * FROM user_prompts WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
    );
    return stmt.all(sessionId, limit) as UserPrompt[];
  }

  // ===========================================
  // NEW: FTS5 FULL-TEXT SEARCH
  // ===========================================

  searchObservations(query: string, type?: ObservationType, limit: number = 10): Observation[] {
    // Escape double quotes for FTS5
    const escapedQuery = query.replace(/"/g, '""');
    
    let sql = `
      SELECT o.id, o.session_id, o.channel, o.type, o.title, o.narrative, o.facts, o.concepts, o.files_referenced, o.tool_name, o.created_at
      FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params: any[] = [escapedQuery];

    if (type) {
      sql += " AND o.type = ?";
      params.push(type);
    }

    sql += " ORDER BY o.created_at DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((row) => ({
      ...row,
      facts: JSON.parse(row.facts || "[]"),
      concepts: JSON.parse(row.concepts || "[]"),
    })) as Observation[];
  }

  searchSessionSummaries(query: string, limit: number = 10): SessionSummary[] {
    const escapedQuery = query.replace(/"/g, '""');
    const stmt = this.db.prepare(`
      SELECT ss.* 
      FROM session_summaries ss
      JOIN session_summaries_fts fts ON ss.id = fts.rowid
      WHERE session_summaries_fts MATCH ?
      ORDER BY ss.started_at DESC
      LIMIT ?
    `);
    return stmt.all(escapedQuery, limit) as SessionSummary[];
  }

  searchUserPrompts(query: string, limit: number = 10): UserPrompt[] {
    const escapedQuery = query.replace(/"/g, '""');
    const stmt = this.db.prepare(`
      SELECT up.* 
      FROM user_prompts up
      JOIN user_prompts_fts fts ON up.id = fts.rowid
      WHERE user_prompts_fts MATCH ?
      ORDER BY up.created_at DESC
      LIMIT ?
    `);
    return stmt.all(escapedQuery, limit) as UserPrompt[];
  }

  // ===========================================
  // NEW: CONTEXT INDEX (Progressive Disclosure)
  // ===========================================

  generateContextIndex(limit: number = 30): string {
    const observations = this.getRecentObservations(limit);

    if (observations.length === 0) {
      return "📋 No previous observations stored yet.";
    }

    let index = `📋 RECENT CONTEXT (${observations.length} observations)\n`;
    index += "| ID | Type | Title |\n";
    index += "|----|------|-------|\n";

    for (const obs of observations) {
      const icon = OBSERVATION_TYPES[obs.type] || "📌";
      const time = new Date(obs.created_at * 1000).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      index += `| #${obs.id} | ${icon} | ${obs.title} |\n`;
    }

    index += `\n💡 Use 'mem-search' to search memory, 'mem-get <id>' to fetch full details.`;
    index += `\n📌 Types: 🟤decision 🟡bugfix 🟢feature 🟣discovery 🔴gotcha 🔵how-it-works ⚖️trade-off`;

    return index;
  }

  // ===========================================
  // NEW: MEMORY STATISTICS
  // ===========================================

  getMemoryStats(): {
    totalObservations: number;
    totalSessions: number;
    totalPrompts: number;
    typesBreakdown: Record<string, number>;
    storageSize: number;
  } {
    const obsCount = this.db.prepare("SELECT COUNT(*) as count FROM observations").get() as { count: number };
    const sessCount = this.db.prepare("SELECT COUNT(*) as count FROM session_summaries").get() as { count: number };
    const promptCount = this.db.prepare("SELECT COUNT(*) as count FROM user_prompts").get() as { count: number };

    const typesStmt = this.db.prepare("SELECT type, COUNT(*) as count FROM observations GROUP BY type");
    const typesRows = typesStmt.all() as { type: string; count: number }[];
    const typesBreakdown = Object.fromEntries(typesRows.map((r) => [r.type, r.count]));

    const dbPath = (this.db as any).filename || "";
    let storageSize = 0;
    try {
      if (dbPath && fs.existsSync(dbPath)) {
        storageSize = fs.statSync(dbPath).size;
      }
    } catch {}

    return {
      totalObservations: obsCount?.count || 0,
      totalSessions: sessCount?.count || 0,
      totalPrompts: promptCount?.count || 0,
      typesBreakdown,
      storageSize,
    };
  }

  close(): void {
    this.db.close();
  }

  /**
   * Get the most recent compaction summary for a session
   */
  getLastCompactionSummary(sessionId: string): { summary: string; messages_compacted: number; created_at: string } | null {
    const row = this.db.prepare(
      "SELECT summary, messages_compacted, created_at FROM compaction_summaries WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(sessionId) as { summary: string; messages_compacted: number; created_at: string } | undefined;
    return row || null;
  }

}