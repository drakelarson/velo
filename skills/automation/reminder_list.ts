import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
export default {
  name: "reminder_list",
  description: "List pending reminders",
  async execute() {
    const path = "/home/workspace/velo/data/reminders.json";
    if (!fs.existsSync(path)) return "No reminders";
    const reminders = JSON.parse(fs.readFileSync(path, "utf-8")) as any[];
    return reminders.map(r => `- ${r.message} (${r.time})`).join("\n") || "No reminders";
  },
} as Skill;
