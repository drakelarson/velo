import * as fs from "fs";
import * as path from "path";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_write",
  description: "Write content to file",
  async execute(args: Record<string, unknown>) {
    const filePath = args.path || args.args || "";
    const content = args.content || "";
    if (!filePath) return "No file path provided";
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
      return `Wrote ${content.length} chars to ${filePath}`;
    } catch (err: any) { return `Write failed: ${err.message}`; }
  },
} as Skill;