/**
 * Self-Improvement Loop for Velo
 * Automatically creates and enhances skills through experience
 * 
 * Capabilities:
 * - Learns from successful task completions
 * - Creates new skills from reusable patterns
 * - Enhances existing skills based on usage/feedback
 * - Builds user model across sessions
 * - Tracks skill effectiveness scores
 */

import * as fs from "fs";
import * as path from "path";
import { Database } from "bun:sqlite";
import type { Skill } from "./types.ts";

export interface SkillPattern {
  id: string;
  name: string;
  description: string;
  trigger_patterns: string[];  // Regex patterns that trigger this skill
  template: string;            // Skill execution template
  success_count: number;
  failure_count: number;
  last_used: number;
  created_from_session: string;
  created_at: number;
  enhanced_at: number;
  effectiveness_score: number; // 0-1, calculated from success rate
}

export interface UserPreference {
  key: string;
  value: string;
  confidence: number;  // 0-1, how confident we are in this preference
  learned_from: string[];  // Session IDs that contributed
  last_reinforced: number;
}

export interface TaskOutcome {
  id: string;
  session_id: string;
  input: string;
  skills_used: string[];
  tools_called: string[];
  result_summary: string;
  success: boolean;           // Did the user accept/confirm the result?
  feedback?: string;          // User feedback if any
  duration_ms: number;
  created_at: number;
}

export class SelfImprovement {
  private db: Database;
  private skillsDir: string;
  private minSuccessForCreation: number = 3;  // Min successes before creating skill
  private minEffectivenessForEnhancement: number = 0.7;

  constructor(dbPath: string, skillsDir: string) {
    this.db = new Database(dbPath);
    this.skillsDir = skillsDir;
    this.init();
  }

  private init() {
    // Patterns table - tracks reusable task patterns
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        trigger_patterns TEXT,      -- JSON array of regex patterns
        template TEXT,              -- Skill execution template
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_used INTEGER,
        created_from_session TEXT,
        created_at INTEGER,
        enhanced_at INTEGER,
        effectiveness_score REAL DEFAULT 0
      )
    `);

    // User preferences learned from interactions
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        learned_from TEXT,          -- JSON array of session IDs
        last_reinforced INTEGER
      )
    `);

    // Task outcomes for learning
    this.db.run(`
      CREATE TABLE IF NOT EXISTS task_outcomes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        input TEXT NOT NULL,
        skills_used TEXT,           -- JSON array
        tools_called TEXT,          -- JSON array
        result_summary TEXT,
        success INTEGER,            -- 0 or 1
        feedback TEXT,
        duration_ms INTEGER,
        created_at INTEGER
      )
    `);

    // Skill usage tracking
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_usage (
        skill_name TEXT PRIMARY KEY,
        use_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_used INTEGER,
        avg_duration_ms INTEGER DEFAULT 0
      )
    `);

    // Create indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_effectiveness ON skill_patterns(effectiveness_score)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_outcomes_session ON task_outcomes(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_outcomes_success ON task_outcomes(success)`);
  }

  // Record a task outcome for learning
  recordOutcome(
    sessionId: string,
    input: string,
    skillsUsed: string[],
    toolsCalled: string[],
    resultSummary: string,
    success: boolean,
    feedback?: string,
    durationMs?: number
  ): void {
    const id = `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    this.db.run(`
      INSERT INTO task_outcomes 
      (id, session_id, input, skills_used, tools_called, result_summary, success, feedback, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, sessionId, input,
      JSON.stringify(skillsUsed),
      JSON.stringify(toolsCalled),
      resultSummary,
      success ? 1 : 0,
      feedback || null,
      durationMs || 0,
      Date.now()
    ]);

    // Update skill usage stats
    for (const skill of skillsUsed) {
      this.updateSkillUsage(skill, success, durationMs || 0);
    }

    // Check if this is a pattern worth learning
    this.analyzeForPattern(sessionId, input, skillsUsed, toolsCalled, resultSummary, success);
  }

  // Simplified outcome recording (for skill usage)
  recordSimpleOutcome(result: "success" | "fail", score: number = 1.0): void {
    const id = `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const success = result === "success" ? 1 : 0;
    
    this.db.run(`
      INSERT INTO task_outcomes 
      (id, session_id, input, skills_used, tools_called, result_summary, success, feedback, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, "skill_triggered", "learn skill", "[]", "[]", 
      `Recorded via learn skill: ${result}`, success, null, 0, Date.now()
    ]);
  }

  // Record a user preference
  async recordPreference(key: string, value: string): Promise<void> {
    const existing = this.db.prepare("SELECT * FROM user_preferences WHERE key = ?").get(key) as any;
    
    if (existing) {
      // Reinforce existing preference
      const newConfidence = Math.min(1.0, existing.confidence + 0.1);
      const learnedFrom = JSON.parse(existing.learned_from || "[]");
      learnedFrom.push("skill_triggered");
      
      this.db.run(`
        UPDATE user_preferences 
        SET value = ?, confidence = ?, learned_from = ?, last_reinforced = ?
        WHERE key = ?
      `, [value, newConfidence, JSON.stringify(learnedFrom), Date.now(), key]);
    } else {
      // New preference
      this.db.run(`
        INSERT INTO user_preferences (key, value, confidence, learned_from, last_reinforced)
        VALUES (?, ?, ?, ?, ?)
      `, [key, value, 0.6, JSON.stringify(["skill_triggered"]), Date.now()]);
    }
  }

  // Record a pattern for potential skill creation
  async recordPattern(name: string, category: string, initialEffectiveness: number = 0.8): Promise<void> {
    const id = `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    // Check if pattern already exists
    const existing = this.db.prepare("SELECT * FROM skill_patterns WHERE name = ?").get(name) as any;
    
    if (existing) {
      // Reinforce existing pattern
      const newSuccessCount = existing.success_count + 1;
      const newEffectiveness = Math.min(1.0, existing.effectiveness_score + 0.05);
      
      this.db.run(`
        UPDATE skill_patterns 
        SET success_count = ?, effectiveness_score = ?, last_used = ?
        WHERE name = ?
      `, [newSuccessCount, newEffectiveness, Date.now(), name]);
    } else {
      // Create new pattern
      this.db.run(`
        INSERT INTO skill_patterns 
        (id, name, description, trigger_patterns, template, success_count, failure_count, 
         last_used, created_from_session, created_at, enhanced_at, effectiveness_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, name, `Learned pattern: ${category}`, 
        JSON.stringify([name]), JSON.stringify({ category }), 
        1, 0, Date.now(), "skill_triggered", Date.now(), Date.now(), initialEffectiveness
      ]);
    }
  }

  // Update skill usage statistics
  private updateSkillUsage(skillName: string, success: boolean, durationMs: number): void {
    const existing = this.db.prepare("SELECT * FROM skill_usage WHERE skill_name = ?").get(skillName) as any;
    
    if (existing) {
      const newUseCount = existing.use_count + 1;
      const newSuccessCount = existing.success_count + (success ? 1 : 0);
      const newFailureCount = existing.failure_count + (success ? 0 : 1);
      const newAvgDuration = Math.round((existing.avg_duration_ms * existing.use_count + durationMs) / newUseCount);
      
      this.db.run(`
        UPDATE skill_usage 
        SET use_count = ?, success_count = ?, failure_count = ?, last_used = ?, avg_duration_ms = ?
        WHERE skill_name = ?
      `, [newUseCount, newSuccessCount, newFailureCount, Date.now(), newAvgDuration, skillName]);
    } else {
      this.db.run(`
        INSERT INTO skill_usage (skill_name, use_count, success_count, failure_count, last_used, avg_duration_ms)
        VALUES (?, 1, ?, ?, ?, ?)
      `, [skillName, success ? 1 : 0, success ? 0 : 1, Date.now(), durationMs]);
    }
  }

  // Analyze task outcome for reusable patterns
  private analyzeForPattern(
    sessionId: string,
    input: string,
    skillsUsed: string[],
    toolsCalled: string[],
    resultSummary: string,
    success: boolean
  ): void {
    // Only learn from successful outcomes
    if (!success) return;

    // Extract input pattern (simplified - look for common structures)
    const inputPattern = this.extractPattern(input);
    
    // Check if similar pattern already exists
    const existingPattern = this.findSimilarPattern(inputPattern);
    
    if (existingPattern) {
      // Reinforce existing pattern
      this.reinforcePattern(existingPattern.id, success);
    } else if (skillsUsed.length > 0) {
      // Potential new pattern - track it
      this.trackPotentialPattern(sessionId, inputPattern, skillsUsed, toolsCalled, resultSummary);
    }
  }

  // Extract a pattern from input (simplified NLP)
  private extractPattern(input: string): string {
    // Lowercase, remove specific values, keep structure
    let pattern = input.toLowerCase()
      .replace(/\d+/g, "NUM")           // Numbers -> NUM
      .replace(/https?:\/\/\S+/g, "URL") // URLs -> URL
      .replace(/[a-f0-9]{8,}/gi, "ID")   // IDs -> ID
      .replace(/\b[a-z]+@[a-z]+\.[a-z]+\b/gi, "EMAIL") // Emails -> EMAIL
      .trim();
    
    // If too long, summarize
    if (pattern.length > 200) {
      pattern = pattern.slice(0, 200) + "...";
    }
    
    return pattern;
  }

  // Find similar existing pattern
  private findSimilarPattern(inputPattern: string): SkillPattern | null {
    const patterns = this.db.prepare("SELECT * FROM skill_patterns").all() as SkillPattern[];
    
    for (const pattern of patterns) {
      const triggers = JSON.parse(pattern.trigger_patterns || "[]");
      for (const trigger of triggers) {
        try {
          const regex = new RegExp(trigger, "i");
          if (regex.test(inputPattern)) {
            return pattern;
          }
        } catch {}
      }
    }
    
    return null;
  }

  // Track a potential new pattern (may become a skill)
  private trackPotentialPattern(
    sessionId: string,
    inputPattern: string,
    skillsUsed: string[],
    toolsCalled: string[],
    resultSummary: string
  ): void {
    // Check if we've seen this pattern multiple times
    const outcomes = this.db.prepare(`
      SELECT * FROM task_outcomes 
      WHERE input LIKE ? AND success = 1
      ORDER BY created_at DESC
      LIMIT 10
    `).all(`%${inputPattern.slice(0, 50)}%`) as TaskOutcome[];

    if (outcomes.length >= this.minSuccessForCreation) {
      // Create a new skill pattern
      this.createSkillPattern(sessionId, inputPattern, skillsUsed, toolsCalled, outcomes);
    }
  }

  // Create a new skill pattern from repeated successful tasks
  private createSkillPattern(
    sessionId: string,
    inputPattern: string,
    skillsUsed: string[],
    toolsCalled: string[],
    outcomes: TaskOutcome[]
  ): SkillPattern {
    // Generate skill name from pattern
    const name = this.generateSkillName(inputPattern);
    
    // Generate trigger patterns from successful inputs
    const triggerPatterns = outcomes.map(o => 
      this.extractPattern(o.input).replace(/[.*+?^${}()|[\]\\]/g, ".*")
    ).slice(0, 5);

    // Create skill template
    const template = this.generateSkillTemplate(skillsUsed, toolsCalled, outcomes);

    const pattern: SkillPattern = {
      id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      description: `Auto-learned skill for: ${inputPattern.slice(0, 100)}`,
      trigger_patterns: triggerPatterns,
      template,
      success_count: outcomes.length,
      failure_count: 0,
      last_used: Date.now(),
      created_from_session: sessionId,
      created_at: Date.now(),
      enhanced_at: Date.now(),
      effectiveness_score: 1.0,
    };

    // Save to database
    this.db.run(`
      INSERT INTO skill_patterns 
      (id, name, description, trigger_patterns, template, success_count, failure_count, 
       last_used, created_from_session, created_at, enhanced_at, effectiveness_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pattern.id, pattern.name, pattern.description,
      JSON.stringify(pattern.trigger_patterns),
      pattern.template,
      pattern.success_count, pattern.failure_count,
      pattern.last_used, pattern.created_from_session,
      pattern.created_at, pattern.enhanced_at, pattern.effectiveness_score
    ]);

    console.log(`[SelfImprovement] Created new skill pattern: ${name} (from ${outcomes.length} successes)`);
    
    // Optionally: Write to file as actual skill
    this.writeSkillToFile(pattern);

    return pattern;
  }

  // Generate a skill name from pattern
  private generateSkillName(pattern: string): string {
    // Extract key words
    const words = pattern
      .replace(/[^a-z\s]/gi, "")
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3);
    
    const baseName = words.join("_") || "learned_task";
    return `learned_${baseName}_${Date.now().toString(36)}`;
  }

  // Generate skill template from successful executions
  private generateSkillTemplate(
    skillsUsed: string[],
    toolsCalled: string[],
    outcomes: TaskOutcome[]
  ): string {
    // Simplified template - describes what worked
    const avgDuration = outcomes.reduce((sum, o) => sum + o.duration_ms, 0) / outcomes.length;
    
    return JSON.stringify({
      typical_skills: skillsUsed,
      typical_tools: toolsCalled,
      avg_duration_ms: Math.round(avgDuration),
      success_patterns: outcomes.map(o => o.result_summary.slice(0, 100)),
    }, null, 2);
  }

  // Write learned skill to file
  private writeSkillToFile(pattern: SkillPattern): void {
    const skillPath = path.join(this.skillsDir, "learned", `${pattern.name}.ts`);
    
    // Ensure learned directory exists
    const learnedDir = path.dirname(skillPath);
    if (!fs.existsSync(learnedDir)) {
      fs.mkdirSync(learnedDir, { recursive: true });
    }

    const skillContent = `/**
 * Auto-learned skill generated by Self-Improvement Loop
 * Created: ${new Date(pattern.created_at).toISOString()}
 * Success rate: ${pattern.effectiveness_score * 100}%
 */

import type { Skill } from "../../src/types.ts";

export default {
  name: "${pattern.name}",
  description: "${pattern.description.replace(/"/g, '\\"')}",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const template = ${pattern.template};
    
    // This is a learned skill - the agent can use this pattern
    // to efficiently handle similar tasks in the future
    
    const input = String(args.action || args.input || "");
    
    // Return guidance for the agent
    return \`Learned pattern for this task type:
    
Typical approach: \${JSON.stringify(template.typical_skills, null, 2)}

Tools usually needed: \${JSON.stringify(template.typical_tools, null, 2)}

Success patterns from previous executions:
\${template.success_patterns.map((p: string, i: number) => \`  \${i+1}. \${p}\`).join("\\n")}

Input received: \${input.slice(0, 200)}
\`;
  },
} as Skill;
`;

    fs.writeFileSync(skillPath, skillContent, "utf-8");
    console.log(`[SelfImprovement] Wrote skill file: ${skillPath}`);
  }

  // Reinforce an existing pattern
  private reinforcePattern(patternId: string, success: boolean): void {
    const pattern = this.db.prepare("SELECT * FROM skill_patterns WHERE id = ?").get(patternId) as SkillPattern;
    if (!pattern) return;

    const newSuccessCount = pattern.success_count + (success ? 1 : 0);
    const newFailureCount = pattern.failure_count + (success ? 0 : 1);
    const total = newSuccessCount + newFailureCount;
    const newEffectiveness = total > 0 ? newSuccessCount / total : 0;

    this.db.run(`
      UPDATE skill_patterns 
      SET success_count = ?, failure_count = ?, effectiveness_score = ?, enhanced_at = ?
      WHERE id = ?
    `, [newSuccessCount, newFailureCount, newEffectiveness, Date.now(), patternId]);

    // If effectiveness drops, consider deprecating
    if (newEffectiveness < 0.3 && total > 10) {
      console.log(`[SelfImprovement] Pattern ${pattern.name} has low effectiveness (${newEffectiveness}), consider review`);
    }
  }

  // Learn user preference
  learnPreference(sessionId: string, key: string, value: string, confidence: number = 0.5): void {
    const existing = this.db.prepare("SELECT * FROM user_preferences WHERE key = ?").get(key) as UserPreference;
    
    if (existing) {
      // Reinforce existing preference
      const learnedFrom = JSON.parse(existing.learned_from || "[]");
      if (!learnedFrom.includes(sessionId)) {
        learnedFrom.push(sessionId);
      }
      
      const newConfidence = Math.min(1.0, existing.confidence + 0.1);
      
      this.db.run(`
        UPDATE user_preferences 
        SET value = ?, confidence = ?, learned_from = ?, last_reinforced = ?
        WHERE key = ?
      `, [value, newConfidence, JSON.stringify(learnedFrom), Date.now(), key]);
    } else {
      this.db.run(`
        INSERT INTO user_preferences (key, value, confidence, learned_from, last_reinforced)
        VALUES (?, ?, ?, ?, ?)
      `, [key, value, confidence, JSON.stringify([sessionId]), Date.now()]);
    }
  }

  // Get learned preferences
  getPreferences(): UserPreference[] {
    return this.db.prepare("SELECT * FROM user_preferences WHERE confidence > 0.5 ORDER BY confidence DESC").all() as UserPreference[];
  }

  // Get preference value
  getPreference(key: string): string | null {
    const pref = this.db.prepare("SELECT value FROM user_preferences WHERE key = ? AND confidence > 0.5").get(key) as { value: string } | undefined;
    return pref?.value || null;
  }

  // Get all learned skill patterns
  getLearnedPatterns(): SkillPattern[] {
    return this.db.prepare("SELECT * FROM skill_patterns WHERE effectiveness_score > 0.5 ORDER BY success_count DESC").all() as SkillPattern[];
  }

  // Get skill usage stats
  getSkillStats(): Array<{ skill_name: string; use_count: number; success_rate: number }> {
    const stats = this.db.prepare("SELECT * FROM skill_usage ORDER BY use_count DESC").all() as any[];
    return stats.map(s => ({
      skill_name: s.skill_name,
      use_count: s.use_count,
      success_rate: s.use_count > 0 ? s.success_count / s.use_count : 0,
    }));
  }

  // Get improvement suggestions
  getImprovementSuggestions(): string[] {
    const suggestions: string[] = [];
    
    // Find low-effectiveness skills
    const lowEffSkills = this.db.prepare(`
      SELECT * FROM skill_patterns 
      WHERE effectiveness_score < ? AND success_count >= 3
      ORDER BY effectiveness_score ASC
      LIMIT 5
    `).all(this.minEffectivenessForEnhancement) as SkillPattern[];
    
    for (const skill of lowEffSkills) {
      suggestions.push(`Consider reviewing/enhancing: ${skill.name} (${(skill.effectiveness_score * 100).toFixed(0)}% effectiveness)`);
    }
    
    // Find unused skills
    const unusedSkills = this.db.prepare(`
      SELECT * FROM skill_patterns 
      WHERE last_used < ?
      ORDER BY last_used ASC
      LIMIT 5
    `).all(Date.now() - 7 * 24 * 60 * 60 * 1000) as SkillPattern[]; // 7 days
    
    for (const skill of unusedSkills) {
      const daysSinceUse = Math.round((Date.now() - (skill.last_used || 0)) / (24 * 60 * 60 * 1000));
      suggestions.push(`Unused skill: ${skill.name} (last used ${daysSinceUse} days ago)`);
    }
    
    return suggestions;
  }

  // Get learned patterns
  async getPatterns(): Promise<SkillPattern[]> {
    return this.db.prepare("SELECT * FROM skill_patterns ORDER BY effectiveness_score DESC").all() as SkillPattern[];
  }

  // Generate improvement report
  getReport(): string {
    const patterns = this.getLearnedPatterns();
    const prefs = this.getPreferences();
    const suggestions = this.getImprovementSuggestions();
    const stats = this.getSkillStats();

    let report = "═════════ SELF-IMPROVEMENT REPORT ═════════\n\n";

    report += `📊 LEARNED PATTERNS (${patterns.length}):\n`;
    for (const p of patterns.slice(0, 10)) {
      report += `  ${p.name}: ${Math.round(p.effectiveness_score * 100)}% effective (${p.success_count} successes)\n`;
    }

    report += `\n👤 USER PREFERENCES (${prefs.length}):\n`;
    for (const pref of prefs) {
      report += `  ${pref.key}: ${pref.value} (${Math.round(pref.confidence * 100)}% confident)\n`;
    }

    report += `\n📈 TOP SKILLS:\n`;
    for (const s of stats.slice(0, 10)) {
      report += `  ${s.skill_name}: ${s.use_count} uses, ${Math.round(s.success_rate * 100)}% success\n`;
    }

    if (suggestions.length > 0) {
      report += `\n💡 IMPROVEMENT SUGGESTIONS:\n`;
      for (const s of suggestions) {
        report += `  - ${s}\n`;
      }
    }

    report += "\n═══════════════════════════════════════";
    return report;
  }

  close(): void {
    this.db.close();
  }
}

// CLI helper
export async function runSelfImprovementCLI(args: string[]): Promise<void> {
  const cmd = args[0] || "report";
  
  const selfImprovement = new SelfImprovement("./data/velo.db", "./skills");
  
  switch (cmd) {
    case "report": {
      console.log(selfImprovement.getReport());
      break;
    }
    
    case "learn": {
      const key = args[1];
      const value = args.slice(2).join(" ");
      if (!key || !value) {
        console.log("Usage: velo learn <key> <value>");
        console.log("Example: velo learn preference_tone concise");
      } else {
        selfImprovement.learnPreference("cli", key, value);
        console.log(`✓ Learned: ${key} = ${value}`);
      }
      break;
    }
    
    case "patterns": {
      const patterns = selfImprovement.getLearnedPatterns();
      console.log(`\n📚 Learned Patterns (${patterns.length}):\n`);
      for (const p of patterns) {
        console.log(`  ${p.name}`);
        console.log(`    Effectiveness: ${Math.round(p.effectiveness_score * 100)}%`);
        console.log(`    Successes: ${p.success_count}`);
        console.log(`    Created: ${new Date(p.created_at).toLocaleDateString()}\n`);
      }
      break;
    }
    
    case "suggest": {
      const suggestions = selfImprovement.getImprovementSuggestions();
      if (suggestions.length === 0) {
        console.log("No improvement suggestions at this time.");
      } else {
        console.log("\n💡 Improvement Suggestions:\n");
        for (const s of suggestions) {
          console.log(`  - ${s}`);
        }
      }
      break;
    }
    
    default:
      console.log(`
🧠 Self-Improvement Commands:

  velo learn report       Show learning report
  velo learn <k> <v>      Learn a user preference
  velo learn patterns     List learned skill patterns
  velo learn suggest      Get improvement suggestions
`);
  }
  
  selfImprovement.close();
}