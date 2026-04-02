import * as fs from "fs";
import * as path from "path";
import type { Skill } from "../../src/types.ts";
export default {
  name: "habit_track"
    category: "Automation",,
  description: "Track daily habits",
  async execute(args: Record<string, unknown>) {
    const habit = args.habit || args.args || "";
    const action = args.action || "done";
    const filePath = "/home/workspace/velo/data/habits.json";
    let habits: any = {};
    if (fs.existsSync(filePath)) habits = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const today = new Date().toISOString().split("T")[0];
    if (!habits[today]) habits[today] = [];
    if (habit && action === "done") habits[today].push(habit);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(habits, null, 2));
    return `Today's habits: ${habits[today]?.join(", ") || "none"}`;
  },
} as Skill;
