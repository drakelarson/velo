import * as os from "os";
import type { Skill } from "../../src/types.ts";
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as path from "path";
import { OBSERVATION_TYPES, type ObservationType } from "../../src/memory.ts";

export default {
  name: "mem-get"
    category: "System",,
  description: "Get full details of a specific observation by ID. Usage: mem-get <id>. Example: mem-get 42",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    
    console.error(`[mem-get] Action: ${action}`);
    
    if (!action || action === "help") {
      return `📋 GET OBSERVATION

Usage: mem-get <id>

Example:
  mem-get 42

Returns full observation details including:
  - Narrative (what happened)
  - Facts extracted
  - Concepts/tags
  - Files referenced
  - Related session`;
    }

    const id = parseInt(action.replace("#", ""));
    if (isNaN(id)) {
      return `❌ Invalid observation ID: ${action}. Use: mem-get <number>`;
    }

    const dbPath = path.join(os.homedir(), ".velo/data/velo.db");
    if (!fs.existsSync(dbPath)) {
      return "❌ Memory database not found.";
    }

    const db = new Database(dbPath);

    try {
      const stmt = db.prepare("SELECT * FROM observations WHERE id = ?");
      const row = stmt.get(id) as any;

      if (!row) {
        return `❌ Observation #${id} not found.`;
      }

      const icon = OBSERVATION_TYPES[row.type as ObservationType] || "📌";
      const date = new Date(row.created_at * 1000).toLocaleString();

      let facts: string[] = [];
      let concepts: string[] = [];
      
      try {
        facts = JSON.parse(row.facts || "[]");
      } catch {}
      try {
        concepts = JSON.parse(row.concepts || "[]");
      } catch {}

      let output = `#${row.id} ${icon} ${row.title}\n`;
      output += `${"─".repeat(60)}\n`;
      output += `Date: ${date}\n`;
      output += `Type: ${row.type}\n`;
      output += `Session: ${row.session_id}\n`;
      
      if (row.channel) {
        output += `Channel: ${row.channel}\n`;
      }
      if (row.tool_name) {
        output += `Tool: ${row.tool_name}\n`;
      }
      
      output += `\n📖 NARRATIVE:\n${row.narrative || "(none)"}\n`;

      if (facts.length > 0) {
        output += `\n📝 FACTS:\n`;
        for (const fact of facts) {
          output += `  • ${fact}\n`;
        }
      }

      if (concepts.length > 0) {
        output += `\n🏷️ CONCEPTS: ${concepts.join(", ")}\n`;
      }

      if (row.files_referenced) {
        output += `\n📁 FILES: ${row.files_referenced}\n`;
      }

      return output;

    } finally {
      db.close();
    }
  },
} as Skill;