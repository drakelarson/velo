import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "test_run",
  description: "Run tests (auto-detect framework)",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || ".";
    try {
      // Try different test runners
      const cmds = ["bun test", "npm test", "pytest", "go test ./..."];
      for (const cmd of cmds) {
        try {
          return execSync(cmd, { encoding: "utf-8", timeout: 60000, cwd: path });
        } catch {}
      }
      return "No test runner found";
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
