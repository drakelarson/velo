import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "whoami"
    category: "System",,
  description: "Get current user",
  async execute() {
    try {
      return execSync("whoami", { encoding: "utf-8" }).trim();
    } catch { return process.env.USER || "unknown"; }
  },
} as Skill;
