import type { Skill } from "../src/types.ts";
import * as childProcess from "child_process";

export default {
  name: "run_command",
  description: "Execute a shell command (use with caution)",
  async execute(args: Record<string, unknown>) {
    const cmd = args.command || args.args || "";
    if (!cmd) {
      return "No command provided";
    }
    
    // Security: block dangerous commands
    const blocked = ["rm -rf", "sudo", "chmod 777", ":(){ :|:& };:"];
    for (const b of blocked) {
      if (cmd.includes(b)) {
        return `Blocked: contains dangerous pattern "${b}"`;
      }
    }

    try {
      const result = childProcess.execSync(cmd, {
        timeout: 30000,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      });
      return result || "(no output)";
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
} as Skill;