import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
const TODO_FILE = "/home/workspace/velo/data/todos.json";
export default {
  name: "todo_list",
  description: "List todo items",
  async execute() {
    if (!fs.existsSync(TODO_FILE)) return "No todos";
    const todos = JSON.parse(fs.readFileSync(TODO_FILE, "utf-8")) as any[];
    return todos.map(t => `${t.done ? "✓" : "○"} ${t.task}`).join("\n");
  },
} as Skill;