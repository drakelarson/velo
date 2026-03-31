import * as fs from "fs";
import * as path from "path";
import type { Skill } from "./types.ts";

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (file.endsWith(".ts") || file.endsWith(".js")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export async function loadSkills(directory: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const fullPath = path.resolve(directory);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    return skills;
  }

  // Recursively find all .ts/.js files
  const files = walkDir(fullPath);

  for (const skillPath of files) {
    try {
      const module = await import(skillPath);
      
      if (module.default) {
        skills.push(module.default as Skill);
      }
    } catch (err) {
      // Only log if it's not a type import issue
      const msg = String(err);
      if (!msg.includes("types.ts")) {
        console.error(`[Skills] Failed to load ${path.basename(skillPath)}: ${msg.slice(0, 100)}`);
      }
    }
  }

  return skills;
}

// Built-in skills (always available)
export const builtInSkills: Skill[] = [
  {
    name: "get_time",
    description: "Get the current time and date",
    execute: async () => `Current time: ${new Date().toLocaleString()}`,
  },
  {
    name: "remember",
    description: "Store a fact in long-term memory",
    execute: async (args: Record<string, unknown>) => {
      return `To remember: use /remember command or CLI`;
    },
  },
];