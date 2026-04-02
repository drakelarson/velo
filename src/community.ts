/**
 * Community Skills - User-installable skills from GitHub
 * 
 * Installs skills to ~/.velo/community/ (separate from built-in skills/)
 * Users install via: velo community install <github-url>
 * or: velo community install <skill-name> (searches community registry)
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "bun";
import type { Skill } from "./types.ts";

const COMMUNITY_DIR = path.join(os.homedir(), ".velo", "community");

export interface CommunitySkill {
  name: string;
  description: string;
  author: string;
  repo: string;
  path: string; // path within repo to skill file
  installPath: string; // where it's installed locally
}

export class CommunitySkillsManager {
  private registryPath: string;
  private skillsDir: string;
  private registry: Map<string, CommunitySkill>;

  constructor() {
    this.skillsDir = path.join(COMMUNITY_DIR, "skills");
    this.registryPath = path.join(COMMUNITY_DIR, "registry.json");
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
          this.registry.set(name, skill as CommunitySkill);
        }
      } catch {
        // Invalid registry, start fresh
      }
    }
  }

  private saveRegistry() {
    const data: Record<string, CommunitySkill> = {};
    for (const [name, skill] of this.registry) {
      data[name] = skill;
    }
    fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2));
  }

  async install(repoUrl: string): Promise<{ name: string; path: string }> {
    // Clone to temp, find skill files, install to community/skills/
    const tmpDir = `/tmp/velo-community-${Date.now()}`;
    
    // Extract repo info from URL
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
    if (!repoMatch) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }
    
    const [, author, repoName] = repoMatch;
    const skillName = repoName.replace(/^velo-skill-/, "").replace(/^velo-/, "");
    
    console.log(`Installing skill from ${author}/${repoName}...`);
    
    // Clone the repo
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

    // Find skill files (*.skill.ts or skills/*.ts)
    const skillFiles = this.findSkillFiles(tmpDir);
    if (skillFiles.length === 0) {
      fs.rmSync(tmpDir, { recursive: true });
      throw new Error("No skill files found in repository");
    }

    // Install first skill found (or let user pick?)
    const skillFile = skillFiles[0];
    const destPath = path.join(this.skillsDir, `${skillName}.ts`);
    
    fs.copyFileSync(skillFile, destPath);
    fs.rmSync(tmpDir, { recursive: true });

    // Register it
    const communitySkill: CommunitySkill = {
      name: skillName,
      description: `Installed from ${author}/${repoName}`,
      author,
      repo: `${author}/${repoName}`,
      path: skillFile,
      installPath: destPath,
    };
    
    this.registry.set(skillName, communitySkill);
    this.saveRegistry();

    return { name: skillName, path: destPath };
  }

  private findSkillFiles(dir: string): string[] {
    const files: string[] = [];
    
    // Look for *.skill.ts first
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
    
    // Also check root for any .ts files that could be skills
    if (files.length === 0) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (entry.endsWith(".ts") && fs.statSync(full).isFile()) {
          // Check if it looks like a skill
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

  list(): CommunitySkill[] {
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
        console.error(`[Community] Failed to load ${skill.name}: ${err}`);
      }
    }
    
    return skills;
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }
}

export function loadCommunitySkills(): Skill[] {
  const manager = new CommunitySkillsManager();
  return manager.getLoadedSkills();
}
