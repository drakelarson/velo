import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_stat",
  description: "Get file stats (size, dates)",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No file path";
    try {
      const stat = fs.statSync(path);
      return `Size: ${stat.size} bytes\nModified: ${stat.mtime}\nCreated: ${stat.birthtime}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
