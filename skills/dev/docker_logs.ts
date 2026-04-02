import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "docker_logs"
    category: "Dev",,
  description: "Get container logs",
  async execute(args: Record<string, unknown>) {
    const container = args.container || args.args || "";
    const lines = args.lines || 50;
    if (!container) return "No container name";
    try {
      return execSync(`docker logs ${container} --tail ${lines}`, { encoding: "utf-8", maxBuffer: 1024*1024 });
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
