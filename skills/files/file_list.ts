import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_list"
    category: "Files",,
  description: "List files in directory",
  async execute(args: Record<string, unknown>) {
    const dir = args.path || args.args || ".";
    if (!fs.existsSync(dir)) return `Directory not found: ${dir}`;
    try {
      const files = fs.readdirSync(dir);
      return files.slice(0, 100).join("\n");
    } catch (err: any) { return `List failed: ${err.message}`; }
  },
} as Skill;