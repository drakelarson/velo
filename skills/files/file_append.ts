import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_append",
  description: "Append content to file",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    const content = args.content || "";
    if (!path) return "No file path";
    try {
      fs.appendFileSync(path, content + "\n");
      return `Appended ${content.length} chars to ${path}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
