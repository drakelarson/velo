/**
 * Reasoning Traces System
 * Capture, store, and analyze agent reasoning processes
 */

import { Database } from "bun:sqlite";

export interface ReasoningStep {
  id: number;
  sessionId: string;
  timestamp: number;
  stepType: "thought" | "action" | "observation" | "tool_call" | "tool_result" | "decision" | "error";
  content: string;
  metadata?: Record<string, unknown>;
  parentId?: number; // For nested reasoning
  tokens?: { prompt: number; completion: number };
  duration?: number; // ms
}

export interface ReasoningTrace {
  id: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  steps: ReasoningStep[];
  status: "active" | "completed" | "failed" | "crashed";
  input: string;
  output?: string;
  totalTokens?: { prompt: number; completion: number };
  totalDuration?: number;
  error?: string;
}

export class ReasoningTracer {
  private db: Database;
  private currentTrace: Map<string, ReasoningTrace> = new Map();
  private stepTimings: Map<number, number> = new Map();

  constructor(dbPath: string) {
    this.db = new Database(dbPath.replace(".db", "_traces.db"));
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS reasoning_traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL,
        status TEXT DEFAULT 'active',
        input TEXT NOT NULL,
        output TEXT,
        total_prompt_tokens INTEGER DEFAULT 0,
        total_completion_tokens INTEGER DEFAULT 0,
        total_duration_ms INTEGER DEFAULT 0,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS reasoning_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL,
        step_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        parent_id INTEGER,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        timestamp REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trace_id) REFERENCES reasoning_traces(id),
        FOREIGN KEY (parent_id) REFERENCES reasoning_steps(id)
      )
    `);

    // Indexes for fast queries
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_traces_session ON reasoning_traces(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_traces_status ON reasoning_traces(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_steps_trace ON reasoning_steps(trace_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_steps_type ON reasoning_steps(step_type)`);
  }

  /**
   * Start a new reasoning trace
   */
  startTrace(sessionId: string, input: string): string {
    const traceId = `${sessionId}:${Date.now()}`;
    
    const trace: ReasoningTrace = {
      id: traceId,
      sessionId,
      startTime: Date.now(),
      steps: [],
      status: "active",
      input,
    };
    
    this.currentTrace.set(sessionId, trace);
    
    // Persist to DB
    this.db.run(
      `INSERT INTO reasoning_traces (id, session_id, start_time, status, input) VALUES (?, ?, ?, ?, ?)`,
      traceId, sessionId, trace.startTime, "active", input
    );
    
    return traceId;
  }

  /**
   * Log a reasoning step
   */
  logStep(
    sessionId: string,
    stepType: ReasoningStep["stepType"],
    content: string,
    metadata?: Record<string, unknown>,
    tokens?: { prompt: number; completion: number }
  ): number {
    const trace = this.currentTrace.get(sessionId);
    if (!trace) {
      // Auto-start a trace if one doesn't exist
      this.startTrace(sessionId, "(auto-started)");
      return this.logStep(sessionId, stepType, content, metadata, tokens);
    }

    const step: ReasoningStep = {
      id: 0, // Will be set by DB
      sessionId,
      timestamp: Date.now(),
      stepType,
      content,
      metadata,
      tokens,
    };
    
    trace.steps.push(step);
    
    // Persist to DB
    const result = this.db.run(
      `INSERT INTO reasoning_steps (trace_id, step_type, content, metadata, prompt_tokens, completion_tokens, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      trace.id, stepType, content, JSON.stringify(metadata || {}), tokens?.prompt || 0, tokens?.completion || 0, step.timestamp
    );
    
    step.id = result.lastInsertRowid as number;
    this.stepTimings.set(step.id, Date.now());
    
    return step.id;
  }

  /**
   * Complete a trace
   */
  completeTrace(sessionId: string, output?: string, error?: string): void {
    const trace = this.currentTrace.get(sessionId);
    if (!trace) return;

    trace.endTime = Date.now();
    trace.status = error ? "failed" : "completed";
    trace.output = output;
    trace.error = error;
    
    // Calculate totals
    trace.totalDuration = trace.endTime - trace.startTime;
    trace.totalTokens = trace.steps.reduce(
      (acc, s) => ({
        prompt: acc.prompt + (s.tokens?.prompt || 0),
        completion: acc.completion + (s.tokens?.completion || 0),
      }),
      { prompt: 0, completion: 0 }
    );

    // Update DB
    this.db.run(
      `UPDATE reasoning_traces 
       SET end_time = ?, status = ?, output = ?, error = ?, 
           total_prompt_tokens = ?, total_completion_tokens = ?, total_duration_ms = ?
       WHERE id = ?`,
      trace.endTime, trace.status, output || null, error || null,
      trace.totalTokens.prompt, trace.totalTokens.completion, trace.totalDuration,
      trace.id
    );
    
    this.currentTrace.delete(sessionId);
  }

  /**
   * Mark trace as crashed (call on recovery)
   */
  markCrashed(sessionId: string): void {
    const trace = this.currentTrace.get(sessionId);
    if (trace) {
      trace.status = "crashed";
      this.db.run(
        `UPDATE reasoning_traces SET status = 'crashed' WHERE id = ?`,
        trace.id
      );
    }
  }

  /**
   * Get a trace by ID
   */
  getTrace(traceId: string): ReasoningTrace | null {
    const row = this.db.prepare(
      `SELECT * FROM reasoning_traces WHERE id = ?`
    ).get(traceId) as any;
    
    if (!row) return null;
    
    const steps = this.db.prepare(
      `SELECT * FROM reasoning_steps WHERE trace_id = ? ORDER BY timestamp`
    ).all(traceId) as any[];
    
    return {
      id: row.id,
      sessionId: row.session_id,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      input: row.input,
      output: row.output,
      totalTokens: { prompt: row.total_prompt_tokens, completion: row.total_completion_tokens },
      totalDuration: row.total_duration_ms,
      error: row.error,
      steps: steps.map(s => ({
        id: s.id,
        sessionId: row.session_id,
        timestamp: s.timestamp,
        stepType: s.step_type,
        content: s.content,
        metadata: JSON.parse(s.metadata || "{}"),
        tokens: { prompt: s.prompt_tokens, completion: s.completion_tokens },
        duration: s.duration_ms,
      })),
    };
  }

  /**
   * Get traces for a session
   */
  getSessionTraces(sessionId: string, limit: number = 10): ReasoningTrace[] {
    const rows = this.db.prepare(
      `SELECT id FROM reasoning_traces WHERE session_id = ? ORDER BY start_time DESC LIMIT ?`
    ).all(sessionId, limit) as any[];
    
    return rows.map(r => this.getTrace(r.id)).filter(Boolean) as ReasoningTrace[];
  }

  /**
   * Get crashed traces (for recovery)
   */
  getCrashedTraces(): ReasoningTrace[] {
    const rows = this.db.prepare(
      `SELECT id FROM reasoning_traces WHERE status IN ('crashed', 'active') ORDER BY start_time DESC`
    ).all() as any[];
    
    return rows.map(r => this.getTrace(r.id)).filter(Boolean) as ReasoningTrace[];
  }

  /**
   * Generate a readable trace report
   */
  formatTrace(trace: ReasoningTrace): string {
    let output = `═════════ REASONING TRACE ═════════\n\n`;
    output += `Trace ID: ${trace.id}\n`;
    output += `Session: ${trace.sessionId}\n`;
    output += `Status: ${trace.status.toUpperCase()}\n`;
    output += `Duration: ${trace.totalDuration ? (trace.totalDuration / 1000).toFixed(2) + "s" : "N/A"}\n`;
    output += `Tokens: ${trace.totalTokens?.prompt || 0} prompt + ${trace.totalTokens?.completion || 0} completion\n\n`;
    
    output += `📥 INPUT:\n${trace.input}\n\n`;
    
    output += `📋 STEPS:\n`;
    for (let i = 0; i < trace.steps.length; i++) {
      const step = trace.steps[i];
      const icon = {
        thought: "💭",
        action: "🎬",
        observation: "👁️",
        tool_call: "🔧",
        tool_result: "✅",
        decision: "🎯",
        error: "❌",
      }[step.stepType] || "•";
      
      output += `\n${icon} [${step.stepType.toUpperCase()}] #${i + 1}\n`;
      output += `   ${step.content.slice(0, 200)}${step.content.length > 200 ? "..." : ""}\n`;
      if (step.tokens) {
        output += `   Tokens: ${step.tokens.prompt}+${step.tokens.completion}\n`;
      }
    }
    
    if (trace.output) {
      output += `\n📤 OUTPUT:\n${trace.output}\n`;
    }
    
    if (trace.error) {
      output += `\n❌ ERROR:\n${trace.error}\n`;
    }
    
    output += `\n═══════════════════════════════`;
    return output;
  }

  /**
   * Clean up old traces (keep last N)
   */
  pruneOldTraces(keepCount: number = 100): void {
    this.db.run(`
      DELETE FROM reasoning_traces WHERE id NOT IN (
        SELECT id FROM reasoning_traces ORDER BY start_time DESC LIMIT ?
      )
    `, keepCount);
  }

  close(): void {
    this.db.close();
  }
}