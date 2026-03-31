import * as fs from "fs";
import * as path from "path";
import type { Skill } from "../../src/types.ts";
export default {
  name: "reminder_add",
  description: "Add a reminder",
  async execute(args: Record<string, unknown>) {
    const message = args.message || args.args || "";
    const time = args.time || "1h";
    if (!message) return "No reminder message";
    const filePath = "/home/workspace/velo/data/reminders.json";
    let reminders: any[] = [];
    if (fs.existsSync(filePath)) reminders = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    reminders.push({ id: Date.now(), message, time, created: new Date().toISOString() });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(reminders, null, 2));
    return `Reminder set: "${message}" in ${time}`;
  },
} as Skill;
