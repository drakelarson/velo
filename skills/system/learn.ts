import type { Skill } from "../../src/types.ts";

// Simplified learning skill that persists to database directly
// Works across all channels: CLI, Telegram, Webhook

import { Database } from "bun:sqlite";

function getDB(): Database {
  const db = new Database("./data/velo.db");
  
  // Ensure tables exist
  db.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      learned_from TEXT,
      last_reinforced INTEGER
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS skill_patterns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      trigger_patterns TEXT,
      template TEXT,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_used INTEGER,
      created_from_session TEXT,
      created_at INTEGER,
      enhanced_at INTEGER,
      effectiveness_score REAL DEFAULT 0
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS task_outcomes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      input TEXT NOT NULL,
      skills_used TEXT,
      tools_called TEXT,
      result_summary TEXT,
      success INTEGER,
      feedback TEXT,
      duration_ms INTEGER,
      created_at INTEGER
    )
  `);
  
  return db;
}

export default {
  name: "learn",
  description: "Learn from the current conversation. Records preferences, patterns, and successful approaches. Examples: 'learn preference:tone=concise', 'learn success', 'learn pattern:research_summaries', 'learn report'",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").toLowerCase();
    const db = getDB();
    
    try {
      // Parse action
      if (action.startsWith("preference:") || (action.includes("=") && !action.startsWith("pattern:"))) {
        // Learning a preference
        const prefStr = action.replace("preference:", "");
        const [key, value] = prefStr.split("=").map(s => s.trim());
        
        if (key && value) {
          const existing = db.prepare("SELECT * FROM user_preferences WHERE key = ?").get(key) as any;
          
          if (existing) {
            // Reinforce
            const newConfidence = Math.min(1.0, (existing.confidence || 0.5) + 0.1);
            db.run(`UPDATE user_preferences SET value = ?, confidence = ?, last_reinforced = ? WHERE key = ?`,
              [value, newConfidence, Date.now(), key]);
          } else {
            // New
            db.run(`INSERT INTO user_preferences (key, value, confidence, learned_from, last_reinforced) VALUES (?, ?, ?, ?, ?)`,
              [key, value, 0.6, JSON.stringify(["skill"]), Date.now()]);
          }
          
          return `✓ Preference learned: ${key} = ${value}\n\nI will remember this for future interactions.`;
        }
      }
      
      if (action.startsWith("pattern:")) {
        const pattern = action.replace("pattern:", "").trim();
        if (pattern) {
          const id = `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          
          const existing = db.prepare("SELECT * FROM skill_patterns WHERE name = ?").get(pattern) as any;
          
          if (existing) {
            const newCount = (existing.success_count || 0) + 1;
            const newEff = Math.min(1.0, (existing.effectiveness_score || 0.8) + 0.05);
            db.run(`UPDATE skill_patterns SET success_count = ?, effectiveness_score = ?, last_used = ? WHERE name = ?`,
              [newCount, newEff, Date.now(), pattern]);
          } else {
            db.run(`
              INSERT INTO skill_patterns (id, name, description, trigger_patterns, template, success_count, failure_count, last_used, created_from_session, created_at, enhanced_at, effectiveness_score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, pattern, `Learned: ${pattern}`, JSON.stringify([pattern]), "{}", 1, 0, Date.now(), "skill", Date.now(), Date.now(), 0.8]);
          }
          
          return `✓ Pattern recorded: ${pattern}\n\nAfter 3+ similar successes, I'll auto-create a skill for this.`;
        }
      }
      
      if (action === "success" || action === "done" || action === "worked") {
        const id = `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        db.run(`INSERT INTO task_outcomes (id, session_id, input, skills_used, tools_called, result_summary, success, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, "skill", "learn skill", "[]", "[]", "User marked as success", 1, 0, Date.now()]);
        return `✓ Task outcome recorded as SUCCESS.\n\nI'll use this approach again for similar tasks.`;
      }
      
      if (action === "fail" || action === "failed" || action === "didn't work") {
        const id = `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        db.run(`INSERT INTO task_outcomes (id, session_id, input, skills_used, tools_called, result_summary, success, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, "skill", "learn skill", "[]", "[]", "User marked as failed", 0, 0, Date.now()]);
        return `✓ Task outcome recorded as FAILED.\n\nI'll avoid this approach for similar tasks.`;
      }
      
      if (action === "report" || action === "status") {
        const prefs = db.prepare("SELECT * FROM user_preferences ORDER BY confidence DESC").all() as any[];
        const patterns = db.prepare("SELECT * FROM skill_patterns ORDER BY effectiveness_score DESC").all() as any[];
        const outcomes = db.prepare("SELECT COUNT(*) as count FROM task_outcomes WHERE success = 1").get() as any;
        const fails = db.prepare("SELECT COUNT(*) as count FROM task_outcomes WHERE success = 0").get() as any;
        
        let report = "═════════ LEARNING REPORT ═════════\n\n";
        
        report += `📊 LEARNED PATTERNS (${patterns.length}):\n`;
        for (const p of patterns.slice(0, 10)) {
          report += `  ${p.name}: ${Math.round((p.effectiveness_score || 0) * 100)}% effective (${p.success_count || 0} successes)\n`;
        }
        
        report += `\n👤 USER PREFERENCES (${prefs.length}):\n`;
        for (const pref of prefs) {
          report += `  ${pref.key}: ${pref.value} (${Math.round((pref.confidence || 0.5) * 100)}% confident)\n`;
        }
        
        report += `\n📈 OUTCOMES:\n`;
        report += `  Successes: ${outcomes?.count || 0}\n`;
        report += `  Failures: ${fails?.count || 0}\n`;
        
        report += "\n═══════════════════════════════════════";
        return report;
      }
      
      if (action === "patterns") {
        const patterns = db.prepare("SELECT * FROM skill_patterns ORDER BY effectiveness_score DESC").all() as any[];
        if (patterns.length === 0) {
          return "No patterns learned yet. Use 'learn pattern:name' after successful tasks.";
        }
        let output = "📊 LEARNED PATTERNS:\n\n";
        for (const p of patterns) {
          output += `  ${p.name}\n`;
          output += `    Successes: ${p.success_count || 0}\n`;
          output += `    Effectiveness: ${Math.round((p.effectiveness_score || 0) * 100)}%\n\n`;
        }
        return output;
      }
      
      // Default: show help
      return `Learning system ready.

**Usage:**
- \`learn preference:tone=concise\` - Learn a user preference
- \`learn success\` - Mark current task as successful
- \`learn fail\` - Mark current task as failed  
- \`learn pattern:research_summaries\` - Record a reusable pattern
- \`learn report\` - Show full learning report
- \`learn patterns\` - List learned patterns

I continuously learn from our interactions to improve over time.`;
      
    } finally {
      db.close();
    }
  },
} as Skill;