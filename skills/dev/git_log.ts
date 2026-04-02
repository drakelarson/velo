import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "git_log"
    category: "Dev",,
  description: "Get recent commits",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || ".";
    try {
      return execSync(`git -C "${path}" log --oneline -10`, { encoding: "utf-8" });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;