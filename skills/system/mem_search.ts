import type { Skill } from "../../src/types.ts";
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { OBSERVATION_TYPES, type ObservationType } from "../../src/memory.ts";

export default {
  name: "mem-search",
  description: "Search agent memory for past observations, decisions, bugfixes, and learnings. Usage: mem-search <query> [type] [limit]. Types: decision, bugfix, feature, discovery, gotcha, how-it-works, trade-off, change. Examples: mem-search 'auth bug', mem-search 'database' bugfix 5",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    
    console.error(`[mem-search] Action: ${action}`);
    
    if (!action || action === "help") {
      return `📋 MEMORY SEARCH

Usage: mem-search <query> [type] [limit]

Arguments:
  query  - Search term or phrase (required)
  type   - Filter by observation type (optional)
  limit  - Max results, default 10 (optional)

Types:
  🟤 decision     - Architecture or design decisions
  🟡 bugfix       - Bug fixes and corrections
  🟢 feature      - New features or capabilities
  🟣 discovery    - Learnings or insights
  🔴 gotcha       - Critical edge cases or pitfalls
  🔵 how-it-works - Technical explanations
  ⚖️ trade-off    - Deliberate compromises
  📌 change       - General changes

Examples:
  mem-search authentication
  mem-search "timeout issue" bugfix
  mem-search database 5
  mem-search "memory leak" gotcha 3`;
    }

    const dbPath = path.join(os.homedir(), ".velo/data/velo.db");
    if (!fs.existsSync(dbPath)) {
      return "❌ Memory database not found. No observations have been recorded yet.";
    }

    const db = new Database(dbPath);

    try {
      // Parse arguments
      const parts = action.split(/\s+/);
      const query = parts[0];
      let type: ObservationType | undefined;
      let limit = 10;

      // Check if second argument is a type or number
      if (parts[1]) {
        const validTypes = Object.keys(OBSERVATION_TYPES);
        if (validTypes.includes(parts[1])) {
          type = parts[1] as ObservationType;
        } else if (!isNaN(parseInt(parts[1]))) {
          limit = parseInt(parts[1]);
        }
      }

      // Check if third argument is limit
      if (parts[2] && !isNaN(parseInt(parts[2]))) {
        limit = parseInt(parts[2]);
      }

      // Escape query for FTS5
      const escapedQuery = query.replace(/"/g, '""');

      // Build query
      let sql = `
        SELECT o.id, o.session_id, o.type, o.title, o.narrative, o.facts, o.concepts, o.created_at
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

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      if (rows.length === 0) {
        return `🔍 No observations found matching "${query}"`;
      }

      // Format results
      let output = `🔍 FOUND ${rows.length} observation${rows.length > 1 ? 's' : ''} for "${query}"\n\n`;
      output += "| ID | Type | Title |\n";
      output += "|----|------|-------|\n";

      for (const row of rows) {
        const icon = OBSERVATION_TYPES[row.type as ObservationType] || "📌";
        const date = new Date(row.created_at * 1000).toLocaleDateString();
        output += `| #${row.id} | ${icon} | ${row.title} |\n`;
      }

      output += `\n💡 Use 'mem-get <id>' to fetch full observation details.`;

      return output;

    } finally {
      db.close();
    }
  },
} as Skill;