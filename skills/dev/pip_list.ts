import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "pip_list"
    category: "Dev",,
  description: "List Python packages",
  async execute() {
    try {
      return execSync("pip list", { encoding: "utf-8" });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
