#!/usr/bin/env bun
/**
 * Token Audit Script - Calculate how many tokens get appended to agent system prompt
 * Run: bun run scripts/token_audit.ts
 */

import { Database } from "bun:sqlite";
import * as os from "os";
import * as path from "path";

const VELO_HOME = path.join(os.homedir(), ".velo");
const DB_PATH = path.join(VELO_HOME, "data/velo.db");

// Simple token estimator (~4 chars per token for English)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Load observations for context index (same as memory.ts)
function generateContextIndex(db: Database, limit: number = 30): string {
  const rows = db.prepare(`
    SELECT id, type, title, created_at 
    FROM observations 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit) as any[];

  if (rows.length === 0) {
    return "📋 No previous observations stored yet.";
  }

  const icons: Record<string, string> = {
    decision: "🟤", bugfix: "🟡", feature: "🟢", discovery: "🟣",
    gotcha: "🔴", "how-it-works": "🔵", "trade-off": "⚖️", change: "📌"
  };

  let index = `📋 RECENT CONTEXT (${rows.length} observations)\n`;
  index += "| ID | Type | Title |\n";
  index += "|----|------|-------|\n";

  for (const obs of rows) {
    const icon = icons[obs.type] || "📌";
    index += `| #${obs.id} | ${icon} | ${obs.title} |\n`;
  }

  index += `\n💡 Use 'mem-search' to search memory, 'mem-get <id>' to fetch full details.`;
  index += `\n📌 Types: 🟤decision 🟡bugfix 🟢feature 🟣discovery 🔴gotcha 🔵how-it-works ⚖️trade-off`;

  return index;
}

// Load session summaries (same as agent.ts)
function generateSessionSummary(db: Database, limit: number = 5): string {
  const rows = db.prepare(`
    SELECT session_id, user_goal, completed, learned, next_steps, message_count,
           datetime(started_at, 'unixepoch', 'localtime') as started
    FROM session_summaries
    WHERE user_goal IS NOT NULL OR learned IS NOT NULL
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as any[];

  if (rows.length === 0) {
    return "No previous session summaries yet.";
  }

  let summary = `📋 RECENT SESSION SUMMARIES (Cross-Session Context)\n\n`;
  
  for (const row of rows) {
    summary += `[${row.session_id}] | Started: ${row.started}\n`;
    if (row.user_goal) summary += `Goal: ${row.user_goal}\n`;
    if (row.completed) summary += `Completed: ${row.completed}\n`;
    if (row.learned) summary += `Learned: ${row.learned}\n`;
    if (row.next_steps) summary += `Next: ${row.next_steps}\n`;
    summary += `\n`;
  }

  return summary.trim();
}

// Load all facts
function getAllFacts(db: Database): string {
  const rows = db.prepare("SELECT key, value FROM facts").all() as any[];
  
  if (rows.length === 0) {
    return "No specific facts known yet.";
  }

  return rows.map(r => `- ${r.key}: ${r.value}`).join("\n");
}

// Count skills and get full list text
async function getSkillsInfo(): Promise<{ count: number; listText: string }> {
  const skills = await import("../src/skills.ts");
  const loaded = await skills.loadSkills("./skills");
  const count = loaded.length;
  const listText = loaded.map(s => `- ${s.name}: ${s.description}`).join("\n");
  return { count, listText };
}

// Build the full system prompt
async function buildFullSystemPrompt(db: Database): Promise<{ 
  components: { name: string; content: string; tokens: number }[];
  totalTokens: number;
  totalChars: number;
}> {
  const components: { name: string; content: string; tokens: number }[] = [];

  // 1. Base identity
  const baseIdentity = `You are Velo. Helpful, concise, autonomous AI assistant`;
  components.push({ name: "Base Identity", content: baseIdentity, tokens: estimateTokens(baseIdentity) });

  // 2. Facts
  const facts = getAllFacts(db);
  const factsSection = `Known facts about the user:\n${facts}`;
  components.push({ name: "Facts", content: factsSection, tokens: estimateTokens(factsSection) });

  // 3. Session Summaries (NEW)
  const sessionSummaries = generateSessionSummary(db, 5);
  const sessionSection = `## Recent Session Summaries (Cross-Session Context)\n${sessionSummaries}`;
  components.push({ name: "Session Summaries", content: sessionSection, tokens: estimateTokens(sessionSection) });

  // 4. Observations/Context Index
  const contextIndex = generateContextIndex(db, 30);
  const obsSection = `## Recent Context (Cross-Session Memory)\n${contextIndex}`;
  components.push({ name: "Observations Index", content: obsSection, tokens: estimateTokens(obsSection) });

  // 5. Skills list (simplified - actual is larger)
  const skillsInfo = await getSkillsInfo();
  const skillCount = skillsInfo.count;
  const skillsSection = `## Your Capabilities\n\nYou have access to ${skillCount} tools. Key capabilities include:\n\n**Memory Tools:**\n- mem-search: Search past observations, decisions, bugfixes, learnings\n- mem-get: Get full details of a specific observation by ID\n- learn: Store user preferences (auto-used when user expresses likes/dislikes)\nYou CAN search and recall information from previous sessions!\n\n**MCP (Model Context Protocol):**\n- mcp_connect: Connect to external MCP servers for additional tools\n- mcp_tools: List available MCP tools\nYou CAN connect to MCP servers to extend your capabilities!\n\n**Subagent Spawning:**\n- subagent_spawn: Spawn independent subagents to work in parallel\n- subagent_list: List active subagents\n- subagent_status: Check subagent status\nYou CAN spawn subagents for parallel task execution!\n\n**Multi-Agent Orchestration:**\n- orchestrate: Orchestrate multiple specialized agents (Coordinator, Researcher, Writer, Coder, Reviewer, Analyst)\n- orchestrate_auto: Let AI choose the best workflow automatically\nYou CAN orchestrate complex tasks with multiple agents!`;
  components.push({ name: "Skills/Capabilities", content: skillsSection, tokens: estimateTokens(skillsSection) });

  // 6. Full skill list (actual loaded skills)
  components.push({ name: "Full Skill List", content: skillsInfo.listText, tokens: estimateTokens(skillsInfo.listText) });

  // Calculate totals
  const totalTokens = components.reduce((sum, c) => sum + c.tokens, 0);
  const totalChars = components.reduce((sum, c) => sum + c.content.length, 0);

  return { components, totalTokens, totalChars };
}

// Main
console.log("\n═══════════════════════════════════════════════════════════");
console.log("              VELO SYSTEM PROMPT TOKEN AUDIT");
console.log("═══════════════════════════════════════════════════════════\n");

const db = new Database(DB_PATH);

// First, show database stats
console.log("📊 DATABASE STATS:");
const obsCount = (db.prepare("SELECT COUNT(*) as c FROM observations").get() as any)?.c || 0;
const sessCount = (db.prepare("SELECT COUNT(*) as c FROM session_summaries").get() as any)?.c || 0;
const factsCount = (db.prepare("SELECT COUNT(*) as c FROM facts").get() as any)?.c || 0;
const prefsCount = (db.prepare("SELECT COUNT(*) as c FROM user_preferences").get() as any)?.c || 0;
const msgCount = (db.prepare("SELECT COUNT(*) as c FROM messages").get() as any)?.c || 0;

console.log(`  Observations: ${obsCount}`);
console.log(`  Session Summaries: ${sessCount}`);
console.log(`  Facts: ${factsCount}`);
console.log(`  User Preferences: ${prefsCount}`);
console.log(`  Total Messages: ${msgCount}`);
console.log("");

// Now audit the system prompt
const { components, totalTokens, totalChars } = await buildFullSystemPrompt(db);

console.log("📝 SYSTEM PROMPT BREAKDOWN:\n");
console.log("Component                    | Chars    | Tokens   | Est. Cost*");
console.log("-----------------------------|----------|----------|------------");

for (const comp of components) {
  const name = comp.name.padEnd(28);
  const chars = comp.content.length.toLocaleString().padStart(8);
  const tokens = comp.tokens.toLocaleString().padStart(8);
  // GPT-4o-mini pricing: $0.15/1M input
  const cost = ((comp.tokens * 0.15) / 1000000).toFixed(6);
  console.log(`${name} | ${chars} | ${tokens} | $${cost}`);
}

console.log("-----------------------------|----------|----------|------------");
const totalCharsStr = totalChars.toLocaleString().padStart(8);
const totalTokensStr = totalTokens.toLocaleString().padStart(8);
const totalCost = ((totalTokens * 0.15) / 1000000).toFixed(6);
console.log(`TOTAL                        | ${totalCharsStr} | ${totalTokensStr} | $${totalCost}`);
console.log("");

// Show actual content preview
console.log("═══════════════════════════════════════════════════════════");
console.log("              FULL SYSTEM PROMPT PREVIEW");
console.log("═══════════════════════════════════════════════════════════\n");

console.log("───────────────────────────────────────────────────────────");
console.log("OBSERVATIONS INDEX (Progressive Disclosure):");
console.log("───────────────────────────────────────────────────────────");
console.log(generateContextIndex(db, 30));
console.log("");

console.log("───────────────────────────────────────────────────────────");
console.log("SESSION SUMMARIES:");
console.log("───────────────────────────────────────────────────────────");
console.log(generateSessionSummary(db, 5));
console.log("");

// Token comparison
console.log("═══════════════════════════════════════════════════════════");
console.log("              TOKEN SAVINGS ANALYSIS");
console.log("═══════════════════════════════════════════════════════════\n");

// Full observations vs index
const fullObs = db.prepare("SELECT * FROM observations LIMIT 30").all() as any[];
const fullObsText = fullObs.map(o => 
  `[${o.type}] ${o.title}\n${o.narrative}\nFacts: ${o.facts}\nConcepts: ${o.concepts}`
).join("\n\n");
const fullObsTokens = estimateTokens(fullObsText);
const indexTokens = components.find(c => c.name === "Observations Index")?.tokens || 0;
const savedTokens = fullObsTokens - indexTokens;

console.log(`WITHOUT Progressive Disclosure:`);
console.log(`  Full 30 observations dumped: ~${fullObsTokens.toLocaleString()} tokens`);
console.log("");
console.log(`WITH Progressive Disclosure:`);
console.log(`  Context index (ID + title only): ~${indexTokens.toLocaleString()} tokens`);
console.log(`  Token savings: ~${savedTokens.toLocaleString()} tokens (${Math.round((savedTokens/fullObsTokens)*100)}%)`);
console.log("");

// Cost projection
console.log("═══════════════════════════════════════════════════════════");
console.log("              COST PROJECTION (per 100 requests)");
console.log("═══════════════════════════════════════════════════════════\n");

const costPerReq = (totalTokens * 0.15) / 1000000;
console.log(`System prompt tokens per request: ~${totalTokens}`);
console.log(`Cost per request (GPT-4o-mini @ $0.15/1M): $${costPerReq.toFixed(6)}`);
console.log(`Cost per 100 requests: $${(costPerReq * 100).toFixed(4)}`);
console.log(`Cost per 1000 requests: $${(costPerReq * 1000).toFixed(4)}`);
console.log("");

// NVIDIA pricing comparison
console.log("With NVIDIA Step 3.5 Flash (~$0.10/1M input):");
const nvidiaCost = (totalTokens * 0.10) / 1000000;
console.log(`  Cost per request: $${nvidiaCost.toFixed(6)}`);
console.log(`  Cost per 100 requests: $${(nvidiaCost * 100).toFixed(4)}`);
console.log("");

console.log("* Est. token cost using ~4 chars/token heuristic");
console.log("* Actual costs may vary based on tokenizer used by model");

db.close();