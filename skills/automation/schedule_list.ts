import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "schedule_list",
  description: "List scheduled tasks",
  async execute() {
    const configPath = "/home/workspace/velo/velo.toml";
    if (!fs.existsSync(configPath)) return "No config";
    const content = fs.readFileSync(configPath, "utf-8");
    const tasks = content.match(/\[\[scheduler\.tasks\]\][\s\S]*?(?=\[\[|\[)/g) || [];
    return tasks.length ? `Found ${tasks.length} scheduled tasks` : "No scheduled tasks";
  },
} as Skill;
