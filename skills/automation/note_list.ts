import * as fs from "fs";
import type { Skill } from "../../src/types.ts";
const NOTES_DIR = "/home/workspace/velo/data/notes";
export default {
  name: "note_list",
  description: "List saved notes",
  async execute() {
    if (!fs.existsSync(NOTES_DIR)) return "No notes yet";
    return fs.readdirSync(NOTES_DIR).filter(f => f.endsWith(".md")).map(n => "- " + n.replace(".md", "")).join("\n");
  },
} as Skill;