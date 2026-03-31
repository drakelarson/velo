import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_delete",
  description: "Delete files or directories",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No path provided";
    const blocked = ["/", "/home", "/etc", "/usr"];
    if (blocked.includes(path)) return "Blocked: system directory";
    if (!fs.existsSync(path)) return `Not found: ${path}`;
    try {
      fs.rmSync(path, { recursive: true });
      return `Deleted: ${path}`;
    } catch (err: any) { return `Delete failed: ${err.message}`; }
  },
} as Skill;