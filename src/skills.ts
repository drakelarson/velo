import * as fs from "fs";
import * as path from "path";
import type { Skill } from "./types.ts";
import { PluginManager } from "./plugins.ts";

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

  // 1. Load local skills from skills/ directory
  if (fs.existsSync(fullPath)) {
    const files = walkDir(fullPath);

    for (const skillPath of files) {
      try {
        console.error(`[Skills] Loading: ${skillPath}`);
        const module = await import(skillPath);
        
        if (module.default) {
          console.error(`[Skills] Loaded skill: ${module.default.name}`);
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
  } else {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  // 2. Load skills from plugins (npm packages + local plugins)
  try {
    const pluginManager = new PluginManager(path.dirname(fullPath));
    pluginManager.loadState(); // Load enabled/disabled state
    await pluginManager.discover();
    
    const pluginSkills = pluginManager.getAllSkills();
    for (const skill of pluginSkills) {
      // Prefix plugin skills to avoid conflicts
      const pluginName = pluginManager.getPluginForSkill(skill.name)?.name || "unknown";
      const prefixedSkill: Skill = {
        name: skill.name.startsWith(`${pluginName}_`) ? skill.name : skill.name,
        description: skill.description,
        execute: skill.execute,
      };
      skills.push(prefixedSkill);
    }
    
    if (pluginSkills.length > 0) {
      console.log(`[Plugins] Loaded ${pluginSkills.length} skills from plugins`);
    }
  } catch (err: any) {
    // Plugins are optional, don't fail if there's an error
    console.error(`[Plugins] Discovery failed: ${err.message}`);
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