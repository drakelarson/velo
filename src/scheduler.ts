import { Agent } from "./agent.ts";
import type { SchedulerTask } from "./types.ts";

export class Scheduler {
  private agent: Agent;
  private tasks: SchedulerTask[];
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private lastRuns: Map<string, Date> = new Map();

  constructor(agent: Agent, tasks: SchedulerTask[]) {
    this.agent = agent;
    this.tasks = tasks;
  }

  start(): void {
    for (const task of this.tasks) {
      this.scheduleTask(task);
    }
    console.log(`[Scheduler] Started ${this.tasks.length} autonomous tasks`);
  }

  private scheduleTask(task: SchedulerTask): void {
    const ms = this.parseInterval(task.interval);
    
    // Run immediately on start
    this.runTask(task);

    // Then schedule recurring
    const intervalId = setInterval(() => {
      this.runTask(task);
    }, ms);

    this.intervals.set(task.name, intervalId);
  }

  private async runTask(task: SchedulerTask): Promise<void> {
    const now = new Date();
    const lastRun = this.lastRuns.get(task.name);

    // Debounce - don't run if less than 10% of interval has passed
    if (lastRun) {
      const elapsed = now.getTime() - lastRun.getTime();
      const minElapsed = this.parseInterval(task.interval) * 0.1;
      if (elapsed < minElapsed) return;
    }

    console.log(`[Scheduler] Running task: ${task.name}`);
    this.lastRuns.set(task.name, now);

    try {
      const result = await this.agent.process(`[AUTONOMOUS TASK: ${task.name}]\n${task.prompt}`);
      console.log(`[Scheduler] ${task.name}: ${result.slice(0, 100)}...`);
    } catch (err) {
      console.error(`[Scheduler] ${task.name} failed:`, err);
    }
  }

  private parseInterval(interval: string): number {
    const unit = interval.slice(-1);
    const value = parseInt(interval.slice(0, -1));

    switch (unit) {
      case "s": return value * 1000;
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      case "d": return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unknown interval unit: ${unit}`);
    }
  }

  stop(): void {
    for (const [name, intervalId] of this.intervals) {
      clearInterval(intervalId);
      console.log(`[Scheduler] Stopped: ${name}`);
    }
    this.intervals.clear();
  }
}