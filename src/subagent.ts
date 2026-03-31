/**
 * Subagent Spawning System
 * Allows Velo to spawn child agents for parallel task execution
 */

import { spawn, type Subprocess } from "bun";
import { Agent } from "./agent.ts";
import type { Config, Skill } from "./types.ts";

export interface SubagentTask {
  id: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface SubagentConfig {
  maxConcurrent: number;
  timeout: number; // ms
  inheritSkills: boolean;
  inheritMemory: boolean;
}

export class SubagentManager {
  private config: Config;
  private subagentConfig: SubagentConfig;
  private skills: Map<string, Skill>;
  private activeAgents: Map<string, { agent: Agent; task: SubagentTask }> = new Map();
  private taskQueue: SubagentTask[] = [];
  private taskCounter: number = 0;

  constructor(config: Config, skills: Map<string, Skill>, subagentConfig?: Partial<SubagentConfig>) {
    this.config = config;
    this.skills = skills;
    this.subagentConfig = {
      maxConcurrent: 3,
      timeout: 60000, // 1 minute
      inheritSkills: true,
      inheritMemory: false,
      ...subagentConfig,
    };
  }

  // Spawn a subagent for a specific task
  async spawn(prompt: string, sessionId?: string): Promise<string> {
    const taskId = `subagent_${++this.taskCounter}`;
    
    const task: SubagentTask = {
      id: taskId,
      prompt,
      status: "pending",
    };

    // Check if we can run now or need to queue
    if (this.activeAgents.size >= this.subagentConfig.maxConcurrent) {
      this.taskQueue.push(task);
      return taskId;
    }

    // Execute immediately
    await this.executeTask(task, sessionId);
    return taskId;
  }

  private async executeTask(task: SubagentTask, sessionId?: string) {
    task.status = "running";
    task.startedAt = new Date();

    // Create a new agent instance for this subagent
    const subAgent = new Agent(this.config, false); // Disable checkpoint for subagents
    subAgent.setSession(sessionId || `subagent_${task.id}`);

    // Inherit skills if configured
    if (this.subagentConfig.inheritSkills) {
      for (const [name, skill] of this.skills) {
        subAgent.registerSkill(skill);
      }
    }

    this.activeAgents.set(task.id, { agent: subAgent, task });

    try {
      // Execute with timeout
      const result = await Promise.race([
        subAgent.process(task.prompt),
        this.timeoutPromise(this.subagentConfig.timeout),
      ]);

      task.result = result;
      task.status = "completed";
    } catch (err: any) {
      task.error = err.message;
      task.status = "failed";
    } finally {
      task.completedAt = new Date();
      subAgent.close();
      this.activeAgents.delete(task.id);

      // Process next task in queue
      if (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift()!;
        await this.executeTask(nextTask, sessionId);
      }
    }
  }

  private timeoutPromise(ms: number): Promise<string> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Subagent timeout after ${ms}ms`)), ms);
    });
  }

  // Get task status
  getTask(taskId: string): SubagentTask | undefined {
    // Check active tasks
    const active = this.activeAgents.get(taskId);
    if (active) return active.task;

    // Not found
    return undefined;
  }

  // Wait for task completion
  async waitForTask(taskId: string, pollInterval: number = 500): Promise<SubagentTask> {
    while (true) {
      const task = this.getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      
      if (task.status === "completed" || task.status === "failed") {
        return task;
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  // Spawn multiple tasks in parallel
  async spawnParallel(prompts: string[], sessionId?: string): Promise<SubagentTask[]> {
    const taskIds = await Promise.all(prompts.map(p => this.spawn(p, sessionId)));
    return Promise.all(taskIds.map(id => this.waitForTask(id)));
  }

  // Cancel a running task
  cancel(taskId: string): boolean {
    const active = this.activeAgents.get(taskId);
    if (!active) return false;

    active.task.status = "failed";
    active.task.error = "Cancelled by user";
    active.agent.close();
    this.activeAgents.delete(taskId);
    return true;
  }

  // Get all active tasks
  getActiveTasks(): SubagentTask[] {
    return Array.from(this.activeAgents.values()).map(a => a.task);
  }

  // Get queue length
  getQueueLength(): number {
    return this.taskQueue.length;
  }
}

// Create a skill that spawns subagents
export function createSubagentSkill(manager: SubagentManager): Skill {
  return {
    name: "spawn_agent",
    description: "Spawn a subagent to handle a task in parallel. Use for research, analysis, or any independent work. Returns task ID for tracking.",
    async execute(args: Record<string, unknown>) {
      const prompt = args.prompt || args.action || "";
      if (!prompt) {
        return "Error: No prompt provided. Usage: spawn_agent prompt=\"Your task here\"";
      }

      const taskId = await manager.spawn(prompt);
      return `Spawned subagent with task ID: ${taskId}. Use check_agent id="${taskId}" to get results.`;
    },
  };
}

export function createCheckAgentSkill(manager: SubagentManager): Skill {
  return {
    name: "check_agent",
    description: "Check the status and results of a spawned subagent task.",
    async execute(args: Record<string, unknown>) {
      const taskId = args.id || args.action || "";
      if (!taskId) {
        return "Error: No task ID provided. Usage: check_agent id=\"subagent_1\"";
      }

      const task = manager.getTask(taskId);
      if (!task) {
        return `Task not found: ${taskId}`;
      }

      let status = `Task ${taskId}: ${task.status}`;
      if (task.startedAt) status += `\nStarted: ${task.startedAt.toISOString()}`;
      if (task.completedAt) status += `\nCompleted: ${task.completedAt.toISOString()}`;
      if (task.result) status += `\n\nResult:\n${task.result.slice(0, 1000)}${task.result.length > 1000 ? "..." : ""}`;
      if (task.error) status += `\n\nError: ${task.error}`;

      return status;
    },
  };
}

export function createWaitAgentSkill(manager: SubagentManager): Skill {
  return {
    name: "wait_agent",
    description: "Wait for a spawned subagent to complete and return its result.",
    async execute(args: Record<string, unknown>) {
      const taskId = args.id || args.action || "";
      if (!taskId) {
        return "Error: No task ID provided. Usage: wait_agent id=\"subagent_1\"";
      }

      try {
        const task = await manager.waitForTask(taskId);
        return task.result || task.error || "No result";
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  };
}
