import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "git_branch",
  description: "List git branches",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || ".";
    try {
      return execSync(`git -C "${path}" branch -a`, { encoding: "utf-8" });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
