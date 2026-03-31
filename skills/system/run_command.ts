import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "run_command",
  description: "Execute shell commands",
  async execute(args: Record<string, unknown>) {
    const cmd = args.command || args.args || "";
    if (!cmd) return "No command provided";
    const blocked = ["rm -rf /", "mkfs", "dd if=/dev/zero"];
    for (const b of blocked) { if (cmd.includes(b)) return `Blocked: ${b}`; }
    try {
      const result = execSync(cmd, { encoding: "utf-8", timeout: 30000, maxBuffer: 1024*1024 });
      return result || "(no output)";
    } catch (err: any) { return `Error: ${err.message}`; }
  },
} as Skill;