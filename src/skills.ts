import * as fs from "fs";
import * as path from "path";
import type { Skill } from "./types.ts";
import { PluginManager } from "./plugins.ts";
import * as os from "os";

/**
 * Parse a markdown skill file into a Skill object.
 * Markdown skills use frontmatter for metadata and body as LLM prompt.
 */
function parseMarkdownSkill(content: string, filePath: string): Skill | null {
  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return null;
  }
  
  const [, frontmatter, body] = frontmatterMatch;
  
  // Extract frontmatter fields
  const nameMatch = frontmatter.match(/name:\s*"?([^"\n]+)"?/);
  const descriptionMatch = frontmatter.match(/description:\s*"([^"]+)"/);
  
  if (!nameMatch || !descriptionMatch) {
    return null;
  }
  
  const name = nameMatch[1];
  const description = descriptionMatch[1];
  
  // Clean up the body (remove code blocks markers, etc.)
  const prompt = body.trim();
  
  return {
    name,
    description,
    execute: async (args: Record<string, unknown>) => {
      // Inject args into the prompt template
      let populatedPrompt = prompt;
      for (const [key, value] of Object.entries(args)) {
        populatedPrompt = populatedPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        populatedPrompt = populatedPrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      }
      
      // Return the prompt for the LLM to execute
      return `[SKILL: ${name}]\n\n${populatedPrompt}\n\n[END SKILL: ${name}]`;
    },
  };
}

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      // Subdirectories of the skills root are all valid skill categories
      // (previously skipped "system", "web", "dev" — now all load)
      walkDir(fullPath, fileList);
    } else if (file.endsWith(".ts") || file.endsWith(".js")) {
      fileList.push(fullPath);
    } else if (file.endsWith(".md")) {
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
        
        if (skillPath.endsWith(".md")) {
          // Load .md skills as prompt-based LLM instructions
          const content = fs.readFileSync(skillPath, "utf-8");
          const skill = parseMarkdownSkill(content, skillPath);
          if (skill) {
            skills.push(skill);
          }
          continue;
        }
        
        const module = await import(skillPath);
        
        if (module.default) {
          skills.push(module.default as Skill);
        }
      } catch (err) {
        // Only log if it's not a type import issue
        const msg = String(err);
        if (!msg.includes("types.ts")) {
        }
      }
    }
  } else {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  // 2. Load user's my-skills from ~/.velo/my-skills/
  const userSkillsDir = path.join(os.homedir(), ".velo", "my-skills", "skills");
  if (fs.existsSync(userSkillsDir)) {
    const userFiles = fs.readdirSync(userSkillsDir);
    for (const file of userFiles) {
      const skillPath = path.join(userSkillsDir, file);
      if (!fs.statSync(skillPath).isFile()) continue;
      
      try {
        console.error(`[Skills] Loading:`); // verbose Loading user skill: ${skillPath}`);
        
        if (file.endsWith(".md")) {
          const content = fs.readFileSync(skillPath, "utf-8");
          const skill = parseMarkdownSkill(content, skillPath);
          if (skill) {
            skills.push(skill);
          }
          continue;
        }
        
        if (file.endsWith(".ts") || file.endsWith(".js")) {
          const module = await import(skillPath);
          if (module.default) {
            skills.push(module.default as Skill);
          }
        }
      } catch (err) {
      }
    }
  }

  // 3. Load skills from plugins (npm packages + local plugins)
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