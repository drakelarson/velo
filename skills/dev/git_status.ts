import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "git_status"
    category: "Dev",,
  description: "Get git status",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || ".";
    try {
      const status = execSync(`git -C "${path}" status --short`, { encoding: "utf-8" });
      const branch = execSync(`git -C "${path}" branch --show-current`, { encoding: "utf-8" }).trim();
      return `Branch: ${branch}\n${status || "Clean"}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;