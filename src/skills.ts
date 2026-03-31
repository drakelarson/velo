import * as fs from "fs";
import * as path from "path";
import type { Skill } from "./types.ts";

export async function loadSkills(directory: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const fullPath = path.resolve(directory);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    // Create example skill
    createExampleSkill(fullPath);
    return skills;
  }

  const files = fs.readdirSync(fullPath);

  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".js")) {
      try {
        const skillPath = path.join(fullPath, file);
        const module = await import(skillPath);
        
        if (module.default) {
          skills.push(module.default as Skill);
        }
      } catch (err) {
        console.error(`Failed to load skill ${file}:`, err);
      }
    }
  }

  return skills;
}

function createExampleSkill(dir: string) {
  const exampleSkill = `import type { Skill } from "../src/types.ts";

export default {
  name: "get_time",
  description: "Get the current time and date",
  async execute(args: Record<string, unknown>) {
    const now = new Date();
    return \`Current time: \${now.toLocaleString()}\`;
  },
} as Skill;
`;

  fs.writeFileSync(path.join(dir, "example.ts"), exampleSkill);
}

// Built-in skills
export const builtInSkills: Skill[] = [
  {
    name: "get_time",
    description: "Get the current time and date",
    execute: async () => {
      return `Current time: ${new Date().toLocaleString()}`;
    },
  },
  {
    name: "remember",
    description: "Store a fact in long-term memory",
    execute: async (args: Record<string, unknown>) => {
      // This is handled by the agent directly
      return `To remember something, use: remember key=value`;
    },
  },
  {
    name: "search_web",
    description: "Search the web for information (requires implementation)",
    execute: async (args: Record<string, unknown>) => {
      const query = args.query || args.args || "unknown";
      return `Web search not implemented. Query was: ${query}. Add a skill to implement this.`;
    },
  },
];