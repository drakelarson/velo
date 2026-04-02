import type { Skill } from "../../src/types.ts";
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export default {
  name: "learn"
    category: "System",,
  description: "CRITICAL: Use this tool whenever the user expresses a preference, liking, or dislike. Examples: 'I like X', 'I prefer Y', 'I want Z'. Action format: preference:key=value (e.g., preference:language=rust)",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    
    console.error(`[learn skill] Action: ${action}`);
    
    if (!action) {
      return "Learn tool ready. Usage: action='preference:key=value'";
    }
    
    // Use the correct velo home directory
    const veloHome = path.join(os.homedir(), ".velo");
    const dbPath = path.join(veloHome, "data", "velo.db");
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const db = new Database(dbPath);
    
    try {
      // Parse preference action
      if (action.startsWith("preference:")) {
        const rest = action.replace("preference:", "");
        const [key, ...valueParts] = rest.split("=");
        const value = valueParts.join("=").trim();
        
        if (key && value) {
          // Get existing or create new
          const existing = db.prepare("SELECT confidence, learned_from FROM user_preferences WHERE key = ?").get(key.trim()) as any;
          
          let confidence = 0.6;
          let learnedFrom: string[] = [];
          
          if (existing) {
            confidence = Math.min(1.0, existing.confidence + 0.1);
            try {
              learnedFrom = JSON.parse(existing.learned_from || "[]");
            } catch {}
          }
          
          learnedFrom.push("chat");
          
          db.run(
            `INSERT OR REPLACE INTO user_preferences (key, value, confidence, learned_from, last_reinforced) VALUES (?, ?, ?, ?, ?)`,
            key.trim(), value, confidence, JSON.stringify(learnedFrom), Date.now()
          );
          
          return `✓ Learned: ${key} = ${value}`;
        }
      }
      
      // Show patterns
      if (action === "patterns" || action === "report") {
        const prefs = db.prepare("SELECT key, value, confidence FROM user_preferences ORDER BY last_reinforced DESC").all() as any[];
        if (prefs.length === 0) {
          return "No learned preferences yet.";
        }
        const list = prefs.map(p => `  ${p.key}: ${p.value} (${Math.round(p.confidence * 100)}%)`).join("\n");
        return `📚 LEARNED PREFERENCES:\n\n${list}`;
      }
      
      return `Unknown action: ${action}. Use: preference:key=value, patterns, or report`;
      
    } finally {
      db.close();
    }
  },
} as Skill;