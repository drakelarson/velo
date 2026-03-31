import type { Skill } from "../src/types.ts";
import { spawn } from "child_process";

const activeSubagents: Map<string, { process: ReturnType<typeof spawn>; task: string; status: string }> = new Map();

export default {
  name: "subagent_spawn",
  description: "Spawn a subagent to handle a task in parallel. Use this for tasks that can be done independently. Usage: subagent_spawn <task_description> [options]. Options: --model=<model>, --timeout=<seconds>, --id=<custom_id>. Returns subagent ID for tracking.",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "");
    
    if (!action || action.startsWith("--") || !action.trim()) {
      return `Subagent Spawning System

Usage: subagent_spawn <task> [options]

Options:
  --model=<model>      Model to use (default: same as main agent)
  --timeout=<seconds>  Max execution time (default: 300)
  --id=<custom_id>     Custom subagent ID

Examples:
  subagent_spawn "Research the latest AI developments and summarize"
  subagent_spawn "Analyze this CSV file" --model=openai:gpt-4o
  subagent_spawn "Write unit tests" --timeout=600

Active subagents: ${activeSubagents.size}
Available: Can spawn up to 5 parallel subagents`;
    }

    // Parse options
    const model = action.match(/--model=(\S+)/)?.[1] || process.env.VELO_MODEL || "nvidia:stepfun-ai/step-3.5-flash";
    const timeout = parseInt(action.match(/--timeout=(\d+)/)?.[1] || "300");
    const customId = action.match(/--id=(\S+)/)?.[1];
    
    // Extract task (remove options)
    const task = action.replace(/--\S+/g, "").trim();
    
    if (activeSubagents.size >= 5) {
      return `Error: Maximum 5 subagents reached. Current active:\n${Array.from(activeSubagents.entries()).map(([id, s]) => `  ${id}: ${s.task} (${s.status})`).join("\n")}`;
    }

    const subagentId = customId || `sub_${Date.now().toString(36)}`;
    
    // Spawn subagent process
    const subagentProcess = spawn("bun", ["run", "src/index.ts", "chat", task], {
      cwd: process.cwd(),
      env: { ...process.env, VELO_MODEL: model },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    subagentProcess.stdout?.on("data", (data) => {
      output += data.toString();
    });

    subagentProcess.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });

    // Track subagent
    activeSubagents.set(subagentId, {
      process: subagentProcess,
      task: task.slice(0, 100),
      status: "running",
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      subagentProcess.kill();
      const subagent = activeSubagents.get(subagentId);
      if (subagent) {
        subagent.status = "timeout";
      }
    }, timeout * 1000);

    // Handle completion
    subagentProcess.on("close", (code) => {
      clearTimeout(timeoutId);
      const subagent = activeSubagents.get(subagentId);
      if (subagent) {
        subagent.status = code === 0 ? "completed" : "failed";
      }
    });

    return `✓ Subagent spawned successfully

ID: ${subagentId}
Task: ${task.slice(0, 100)}${task.length > 100 ? "..." : ""}
Model: ${model}
Timeout: ${timeout}s
Status: Running

Check status: subagent_status ${subagentId}
List all: subagent_list
Stop: subagent_stop ${subagentId}`;
  },
} as Skill;