import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "grep",
  description: "Search file contents with ripgrep",
  async execute(args: Record<string, unknown>) {
    const pattern = args.pattern || args.args || "";
    const path = args.path || ".";
    if (!pattern) return "No search pattern";
    try {
      return execSync(`rg -n "${pattern}" "${path}" 2>/dev/null | head -50`, { encoding: "utf-8" }) || "No matches";
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
