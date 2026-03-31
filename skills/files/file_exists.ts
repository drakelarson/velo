import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_exists",
  description: "Check if file exists",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No file path";
    return fs.existsSync(path) ? `Exists: ${path}` : `Not found: ${path}`;
  },
} as Skill;
