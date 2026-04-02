import type { Skill } from "../../src/types.ts";
export default {
  name: "sleep"
    category: "System",,
  description: "Pause execution (for automation)",
  async execute(args: Record<string, unknown>) {
    const secs = Number(args.seconds || args.args) || 1;
    await new Promise(r => setTimeout(r, secs * 1000));
    return `Slept ${secs} seconds`;
  },
} as Skill;
