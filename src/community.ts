/**
 * My Skills - User-installable skills from GitHub
 * 
 * Installs skills to ~/.velo/my-skills/ (separate from built-in skills/)
 * Users install via: velo my-skills install <github-url>
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "bun";
import type { Skill } from "./types.ts";

const MY_SKILLS_DIR = path.join(os.homedir(), ".velo", "my-skills");

export interface MySkill {
  name: string;
  description: string;
  author: string;
  repo: string;
  path: string;
  installPath: string;
}

export class MySkillsManager {
  private registryPath: string;
  private skillsDir: string;
  private registry: Map<string, MySkill>;

  constructor() {
    this.skillsDir = path.join(MY_SKILLS_DIR, "skills");
    this.registryPath = path.join(MY_SKILLS_DIR, "registry.json");
    this.registry = new Map();
    this.ensureDirs();
    this.loadRegistry();
  }

  private ensureDirs() {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  private loadRegistry() {
    if (fs.existsSync(this.registryPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.registryPath, "utf-8"));
        for (const [name, skill] of Object.entries(data)) {
          this.registry.set(name, skill as MySkill);
        }
      } catch {
        // Invalid registry, start fresh
      }
    }
  }

  private saveRegistry() {
    const data: Record<string, MySkill> = {};
    for (const [name, skill] of this.registry) {
      data[name] = skill;
    }
    fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2));
  }

  async install(repoUrl: string): Promise<{ name: string; path: string }> {
    const tmpDir = `/tmp/velo-my-skills-${Date.now()}`;
    
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
    if (!repoMatch) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }
    
    const [, author, repoName] = repoMatch;
    const skillName = repoName.replace(/^velo-skill-/, "").replace(/^velo-/, "");
    
    console.log(`Installing skill from ${author}/${repoName}...`);
    
    const cloneResult = await spawn({
      cmd: ["git", "clone", "--depth", "1", repoUrl, tmpDir],
      stdout: "pipe",
      stderr: "pipe",
    });
    
    const exitCode = await cloneResult.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(cloneResult.stderr).text();
      throw new Error(`Failed to clone repo: ${stderr}`);
    }

    const skillFiles = this.findSkillFiles(tmpDir);
    if (skillFiles.length === 0) {
      fs.rmSync(tmpDir, { recursive: true });
      throw new Error("No skill files found in repository");
    }

    const skillFile = skillFiles[0];
    const destPath = path.join(this.skillsDir, `${skillName}.ts`);
    
    fs.copyFileSync(skillFile, destPath);
    fs.rmSync(tmpDir, { recursive: true });

    const mySkill: MySkill = {
      name: skillName,
      description: `Installed from ${author}/${repoName}`,
      author,
      repo: `${author}/${repoName}`,
      path: skillFile,
      installPath: destPath,
    };
    
    this.registry.set(skillName, mySkill);
    this.saveRegistry();

    return { name: skillName, path: destPath };
  }

  private findSkillFiles(dir: string): string[] {
    const files: string[] = [];
    
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d)) {
        const full = path.join(d, entry);
        if (fs.statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".git") continue;
          walk(full);
        } else if (entry.endsWith(".skill.ts") || (entry.endsWith(".ts") && entry.includes("skill"))) {
          files.push(full);
        }
      }
    };
    
    walk(dir);
    
    if (files.length === 0) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (entry.endsWith(".ts") && fs.statSync(full).isFile()) {
          const content = fs.readFileSync(full, "utf-8");
          if (content.includes("export default") && content.includes("Skill")) {
            files.push(full);
          }
        }
      }
    }
    
    return files;
  }

  uninstall(skillName: string): void {
    const skill = this.registry.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    if (fs.existsSync(skill.installPath)) {
      fs.unlinkSync(skill.installPath);
    }
    
    this.registry.delete(skillName);
    this.saveRegistry();
  }

  list(): MySkill[] {
    return Array.from(this.registry.values());
  }

  getLoadedSkills(): Skill[] {
    const skills: Skill[] = [];
    
    for (const skill of this.registry.values()) {
      try {
        const module = import(skill.installPath);
        if (module) {
          skills.push(module as unknown as Skill);
        }
      } catch (err) {
        console.error(`[MySkills] Failed to load ${skill.name}: ${err}`);
      }
    }
    
    return skills;
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }
}

export function loadMySkills(): Skill[] {
  const manager = new MySkillsManager();
  return manager.getLoadedSkills();
}
