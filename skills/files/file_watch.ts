import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "file_watch",
  description: "Watch file for changes (returns instructions)",
  async execute(args: Record<string, unknown>) {
    const path = args.path || args.args || "";
    if (!path) return "No file path";
    return `File watching requires long-running process.\nTo watch ${path}:\n1. Use scheduler\n2. Or check periodically with file_stat`;
  },
} as Skill;
