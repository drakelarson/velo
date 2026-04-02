import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "npm_install"
    category: "Dev",,
  description: "Install npm packages",
  async execute(args: Record<string, unknown>) {
    const packages = args.packages || args.args || "";
    try {
      const cmd = packages ? `bun add ${packages}` : "bun install";
      return execSync(cmd, { encoding: "utf-8", timeout: 60000 }).slice(-500);
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;