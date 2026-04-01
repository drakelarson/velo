import * as os from "os";
import type { Skill } from "../../src/types.ts";
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";
import { OBSERVATION_TYPES, type ObservationType } from "../../src/memory.ts";

export default {
  name: "observe",
  description: "Record an observation (structured learning) for cross-session memory. Usage: observe <type>:<title>|<narrative>[|facts][|concepts]. Types: decision, bugfix, feature, discovery, gotcha, how-it-works, trade-off, change. Example: observe bugfix:Fixed auth timeout|Increased timeout to 120s|auth,timeout",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    
    console.error(`[observe skill] Action: ${action}`);
    
    if (!action || action === "help") {
      const types = Object.entries(OBSERVATION_TYPES)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      return `📋 RECORD OBSERVATION

Usage: observe <type>:<title>|<narrative>[|facts][|concepts]

Types:
  ${types}

Format:
  type:title|narrative|fact1,fact2|concept1,concept2

Examples:
  observe bugfix:Fixed auth timeout|Increased timeout to 120s for slow networks|auth,timeout
  observe decision:Use SQLite for memory|SQLite is fast, embedded, and supports FTS5
  observe gotcha:Don't use setTimeout|setTimeout causes issues in Bun, use sleep instead|async,timing
  observe discovery:Bun:sqlite is fast|Native SQLite bindings, 10x faster than better-sqlite3|database,performance`;
    }

    const dbPath = path.join(os.homedir(), ".velo/data/velo.db");
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new Database(dbPath);

    try {
      // Parse action: type:title|narrative|facts|concepts
      const colonIdx = action.indexOf(":");
      if (colonIdx === -1) {
        return `❌ Invalid format. Use: observe <type>:<title>|<narrative>`;
      }

      const type = action.slice(0, colonIdx).trim() as ObservationType;
      const rest = action.slice(colonIdx + 1);
      const parts = rest.split("|");

      const title = parts[0]?.trim();
      const narrative = parts[1]?.trim() || "";
      const facts = parts[2]?.split(",").map(s => s.trim()).filter(Boolean) || [];
      const concepts = parts[3]?.split(",").map(s => s.trim()).filter(Boolean) || [];

      if (!title) {
        return `❌ Title is required. Use: observe <type>:<title>|<narrative>`;
      }

      // Validate type
      const validTypes = Object.keys(OBSERVATION_TYPES);
      if (!validTypes.includes(type)) {
        return `❌ Invalid type '${type}'. Valid types: ${validTypes.join(", ")}`;
      }

      // Get current session (most recent)
      const sessionRow = db.prepare(
        "SELECT session_id FROM messages ORDER BY created_at DESC LIMIT 1"
      ).get() as { session_id: string } | undefined;
      const sessionId = sessionRow?.session_id || "default";

      // Insert observation
      const stmt = db.prepare(`
        INSERT INTO observations (session_id, type, title, narrative, facts, concepts, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        sessionId,
        type,
        title,
        narrative,
        JSON.stringify(facts),
        JSON.stringify(concepts),
        Math.floor(Date.now() / 1000)
      );

      const icon = OBSERVATION_TYPES[type];
      return `✓ Recorded observation #${result.lastInsertRowid}\n${icon} ${type}: ${title}`;

    } finally {
      db.close();
    }
  },
} as Skill;