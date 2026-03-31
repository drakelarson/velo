import type { Skill } from "../../src/types.ts";
export default {
  name: "timer",
  description: "Start a countdown timer",
  async execute(args: Record<string, unknown>) {
    const minutes = Number(args.minutes || args.args) || 5;
    return `Timer set for ${minutes} minutes. Will notify when done.`;
  },
} as Skill;
