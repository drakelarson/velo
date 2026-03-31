import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_read",
  description: "Read file contents",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No file path provided";
    if (!fs.existsSync(path)) return `File not found: ${path}`;
    try {
      const content = fs.readFileSync(path, "utf-8");
      return content.slice(0, 10000);
    } catch (err: any) { return `Read failed: ${err.message}`; }
  },
} as Skill;