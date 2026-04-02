import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "process_list",
  description: "List running processes",
  async execute(args: Record<string, unknown>) {
    const filter = args.filter || args.args || "";
    try {
      const cmd = filter ? `ps aux | grep -i "${filter}" | grep -v grep | head -20` : "ps aux --sort=-%mem | head -20";
      return execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;