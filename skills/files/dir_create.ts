import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "dir_create",
  description: "Create directory",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No directory path";
    try {
      fs.mkdirSync(path, { recursive: true });
      return `Created: ${path}`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
