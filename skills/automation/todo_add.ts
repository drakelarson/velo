import * as fs from "fs";
import * as path from "path";
import type { Skill } from "../../src/types.ts";
const TODO_FILE = "/home/workspace/velo/data/todos.json";
export default {
  name: "todo_add"
    category: "Automation",,
  description: "Add todo item",
  async execute(args: Record<string, unknown>) {
    const task = args.task || args.args || "";
    if (!task) return "Usage: todo_add task=<description>";
    try {
      let todos: any[] = fs.existsSync(TODO_FILE) ? JSON.parse(fs.readFileSync(TODO_FILE, "utf-8")) : [];
      todos.push({ id: Date.now(), task, done: false, created: new Date().toISOString() });
      fs.mkdirSync(path.dirname(TODO_FILE), { recursive: true });
      fs.writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2));
      return `Added: "${task}" (${todos.length} total)`;
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;