import * as fs from "fs";
import * as path from "path";
import type { Skill } from "../../src/types.ts";
const NOTES_DIR = "/home/workspace/velo/data/notes";
export default {
  name: "note_save"
    category: "Automation",,
  description: "Save a note",
  async execute(args: Record<string, unknown>) {
    const title = args.title || args.args || "";
    const content = args.content || "";
    if (!title) return "Usage: note_save title=<name> content=<text>";
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    const file = path.join(NOTES_DIR, `${title.replace(/\s+/g, "_")}.md`);
    fs.writeFileSync(file, `# ${title}\n\n${content}`);
    return `Note saved: ${file}`;
  },
} as Skill;