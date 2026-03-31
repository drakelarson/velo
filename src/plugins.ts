/**
 * Plugin System for Velo
 * npm-based plugin architecture for optional capabilities
 * 
 * Plugins are npm packages that export Velo skills:
 *   - Name pattern: velo-plugin-* or @scope/velo-plugin-*
 *   - Each plugin exports a manifest with skills
 *   - Skills are dynamically loaded at runtime
 * 
 * Example plugin package:
 *   velo-plugin-slack/
 *   ├── package.json (name: "velo-plugin-slack")
 *   ├── velo-plugin.json (manifest)
 *   └── src/
 *       └── index.ts (exports skills)
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "bun";
import type { Skill } from "./types.ts";

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  skills: string[];           // Skill files to load (relative to plugin root)
  dependencies?: string[];    // Other velo-plugins this depends on
  config?: Record<string, {   // Configurable options
    type: "string" | "number" | "boolean";
    default?: any;
    description?: string;
  }>;
  env?: Record<string, string>; // Required env vars (e.g., API_KEY)
}

export interface Plugin {
  name: string;
  version: string;
  path: string;
  manifest: PluginManifest;
  skills: Skill[];
  enabled: boolean;
}

export interface PluginRegistry {
  plugins: Map<string, Plugin>;
  skillIndex: Map<string, string>; // skill name -> plugin name
}

const VELO_PLUGIN_PREFIX = "velo-plugin-";
const VELO_PLUGIN_SCOPED = /@[^/]+\/velo-plugin-/;
const MANIFEST_FILE = "velo-plugin.json";

export class PluginManager {
  private pluginsDir: string;
  private nodeModulesPath: string;
  private registry: PluginRegistry;
  private configPath: string;

  constructor(projectRoot: string = ".") {
    this.pluginsDir = path.join(projectRoot, "plugins");
    this.nodeModulesPath = path.join(projectRoot, "node_modules");
    this.configPath = path.join(projectRoot, "velo-plugins.json");
    this.registry = {
      plugins: new Map(),
      skillIndex: new Map(),
    };
  }

  // Discover all installed plugins
  async discover(): Promise<Plugin[]> {
    const discovered: Plugin[] = [];

    // 1. Check local plugins directory
    if (fs.existsSync(this.pluginsDir)) {
      for (const entry of fs.readdirSync(this.pluginsDir)) {
        const pluginPath = path.join(this.pluginsDir, entry);
        const plugin = await this.loadPlugin(pluginPath);
        if (plugin) {
          discovered.push(plugin);
          this.registry.plugins.set(plugin.name, plugin);
        }
      }
    }

    // 2. Scan node_modules for velo-plugin-* packages
    if (fs.existsSync(this.nodeModulesPath)) {
      for (const entry of fs.readdirSync(this.nodeModulesPath)) {
        // Handle scoped packages (@scope/velo-plugin-*)
        if (entry.startsWith("@")) {
          const scopePath = path.join(this.nodeModulesPath, entry);
          if (fs.statSync(scopePath).isDirectory()) {
            for (const scoped of fs.readdirSync(scopePath)) {
              if (scoped.startsWith("velo-plugin-")) {
                const pluginPath = path.join(scopePath, scoped);
                const plugin = await this.loadPlugin(pluginPath);
                if (plugin) {
                  discovered.push(plugin);
                  this.registry.plugins.set(plugin.name, plugin);
                }
              }
            }
          }
        }
        // Handle regular velo-plugin-* packages
        else if (entry.startsWith(VELO_PLUGIN_PREFIX)) {
          const pluginPath = path.join(this.nodeModulesPath, entry);
          const plugin = await this.loadPlugin(pluginPath);
          if (plugin) {
            discovered.push(plugin);
            this.registry.plugins.set(plugin.name, plugin);
          }
        }
      }
    }

    return discovered;
  }

  // Load a single plugin from path
  private async loadPlugin(pluginPath: string): Promise<Plugin | null> {
    const manifestPath = path.join(pluginPath, MANIFEST_FILE);
    const pkgPath = path.join(pluginPath, "package.json");

    // Must have either velo-plugin.json or package.json with velo key
    let manifest: PluginManifest | null = null;
    let pkgName: string = "";
    let pkgVersion: string = "0.0.0";

    // Try velo-plugin.json first
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } catch (e) {
        console.error(`[Plugins] Invalid manifest: ${manifestPath}`);
      }
    }

    // Try package.json
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        pkgName = pkg.name;
        pkgVersion = pkg.version || "0.0.0";

        // If package.json has "velo" key, use it as manifest
        if (pkg.velo && !manifest) {
          manifest = {
            name: pkg.name,
            version: pkg.version,
            ...pkg.velo,
          };
        }
      } catch (e) {
        console.error(`[Plugins] Invalid package.json: ${pkgPath}`);
      }
    }

    if (!manifest) {
      return null;
    }

    // Validate plugin name
    const name = manifest.name || pkgName;
    if (!this.isValidPluginName(name)) {
      console.error(`[Plugins] Invalid plugin name: ${name}`);
      return null;
    }

    // Load skills
    const skills = await this.loadSkills(pluginPath, manifest);

    // Build skill index
    for (const skill of skills) {
      this.registry.skillIndex.set(skill.name, name);
    }

    return {
      name,
      version: manifest.version || pkgVersion,
      path: pluginPath,
      manifest,
      skills,
      enabled: true,
    };
  }

  // Validate plugin name follows convention
  private isValidPluginName(name: string): boolean {
    return (
      name.startsWith(VELO_PLUGIN_PREFIX) ||
      VELO_PLUGIN_SCOPED.test(name)
    );
  }

  // Load skills from plugin
  private async loadSkills(pluginPath: string, manifest: PluginManifest): Promise<Skill[]> {
    const skills: Skill[] = [];

    for (const skillPath of manifest.skills || []) {
      const fullPath = path.resolve(pluginPath, skillPath);

      try {
        // Dynamic import - supports .ts, .js, .mjs
        let module: any;

        if (fs.existsSync(fullPath)) {
          // Bun can import .ts directly
          module = await import(fullPath);
        } else {
          // Try .ts then .js
          const tsPath = fullPath + ".ts";
          const jsPath = fullPath + ".js";
          if (fs.existsSync(tsPath)) {
            module = await import(tsPath);
          } else if (fs.existsSync(jsPath)) {
            module = await import(jsPath);
          } else {
            console.error(`[Plugins] Skill not found: ${fullPath}`);
            continue;
          }
        }

        // Default export is a skill or array of skills
        const exported = module.default;
        if (Array.isArray(exported)) {
          skills.push(...exported.filter((s) => this.isValidSkill(s)));
        } else if (this.isValidSkill(exported)) {
          skills.push(exported);
        }

        // Named exports that are skills
        for (const [key, value] of Object.entries(module)) {
          if (key !== "default" && this.isValidSkill(value)) {
            skills.push(value as Skill);
          }
        }
      } catch (e: any) {
        console.error(`[Plugins] Failed to load skill ${skillPath}: ${e.message}`);
      }
    }

    return skills;
  }

  // Validate skill object
  private isValidSkill(obj: any): obj is Skill {
    return (
      obj &&
      typeof obj.name === "string" &&
      typeof obj.description === "string" &&
      typeof obj.execute === "function"
    );
  }

  // Get all loaded skills
  getAllSkills(): Skill[] {
    const skills: Skill[] = [];
    for (const plugin of this.registry.plugins.values()) {
      if (plugin.enabled) {
        skills.push(...plugin.skills);
      }
    }
    return skills;
  }

  // Get plugin by name
  getPlugin(name: string): Plugin | undefined {
    return this.registry.plugins.get(name);
  }

  // Get plugin that provides a skill
  getPluginForSkill(skillName: string): Plugin | undefined {
    const pluginName = this.registry.skillIndex.get(skillName);
    return pluginName ? this.registry.plugins.get(pluginName) : undefined;
  }

  // List all plugins
  listPlugins(): Plugin[] {
    return Array.from(this.registry.plugins.values());
  }

  // Enable/disable plugin
  setEnabled(name: string, enabled: boolean): boolean {
    const plugin = this.registry.plugins.get(name);
    if (plugin) {
      plugin.enabled = enabled;
      return true;
    }
    return false;
  }

  // Install plugin from npm or local path
  async install(source: string): Promise<{ success: boolean; message: string }> {
    // Check if it's a local path
    if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
      // Local plugin - copy to plugins directory
      const pluginName = path.basename(source);
      const destPath = path.join(this.pluginsDir, pluginName);

      if (fs.existsSync(destPath)) {
        return { success: false, message: `Plugin already exists: ${pluginName}` };
      }

      // Copy directory
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      await this.copyDir(source, destPath);

      // Install dependencies if package.json exists
      const pkgPath = path.join(destPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        console.log(`[Plugins] Installing dependencies for ${pluginName}...`);
        const proc = spawn({
          cmd: ["bun", "install"],
          cwd: destPath,
        });
        await proc.exited;
      }

      return { success: true, message: `Installed local plugin: ${pluginName}` };
    }

    // npm package
    if (this.isValidPluginName(source)) {
      console.log(`[Plugins] Installing ${source} from npm...`);

      const proc = spawn({
        cmd: ["bun", "add", source],
        cwd: path.dirname(this.nodeModulesPath),
      });
      const result = await proc.exited;

      if (result === 0) {
        return { success: true, message: `Installed: ${source}` };
      } else {
        return { success: false, message: `Failed to install ${source}` };
      }
    }

    return { success: false, message: `Invalid plugin source: ${source}` };
  }

  // Uninstall plugin
  async uninstall(name: string): Promise<{ success: boolean; message: string }> {
    const plugin = this.registry.plugins.get(name);
    if (!plugin) {
      return { success: false, message: `Plugin not found: ${name}` };
    }

    // Check if it's a local plugin
    if (plugin.path.startsWith(this.pluginsDir)) {
      // Remove from plugins directory
      fs.rmSync(plugin.path, { recursive: true, force: true });
      this.registry.plugins.delete(name);
      return { success: true, message: `Removed local plugin: ${name}` };
    }

    // npm package - use bun remove
    console.log(`[Plugins] Removing ${name}...`);
    const proc = spawn({
      cmd: ["bun", "remove", name],
      cwd: path.dirname(this.nodeModulesPath),
    });
    const result = await proc.exited;

    if (result === 0) {
      this.registry.plugins.delete(name);
      return { success: true, message: `Removed: ${name}` };
    }

    return { success: false, message: `Failed to remove ${name}` };
  }

  // Create a new plugin scaffold
  async create(name: string, targetDir?: string): Promise<{ success: boolean; path?: string; message: string }> {
    // Validate name
    if (!name.startsWith(VELO_PLUGIN_PREFIX)) {
      name = VELO_PLUGIN_PREFIX + name;
    }

    if (!this.isValidPluginName(name)) {
      return {
        success: false,
        message: `Plugin name must start with "${VELO_PLUGIN_PREFIX}" or be scoped like "@scope/${VELO_PLUGIN_PREFIX}*"`,
      };
    }

    const dir = targetDir || path.join(this.pluginsDir, name.replace(/^@[^/]+\//, "").replace(VELO_PLUGIN_PREFIX, ""));

    if (fs.existsSync(dir)) {
      return { success: false, message: `Directory already exists: ${dir}` };
    }

    // Create scaffold
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });

    // package.json
    const pkgJson = {
      name,
      version: "1.0.0",
      description: `Velo plugin: ${name}`,
      main: "src/index.ts",
      velo: {
        skills: ["src/index.ts"],
      },
    };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkgJson, null, 2));

    // velo-plugin.json
    const manifest: PluginManifest = {
      name,
      version: "1.0.0",
      description: `Velo plugin: ${name}`,
      skills: ["src/index.ts"],
    };
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));

    // Example skill
    const skillName = name.replace(VELO_PLUGIN_PREFIX, "").replace(/[^a-z0-9]/g, "_");
    const skillCode = `import type { Skill } from "../../src/types.ts";

export default {
  name: "${skillName}_hello",
  description: "Example skill from ${name}",
  async execute(args: Record<string, unknown>): Promise<string> {
    const name = args.name || args.action || "World";
    return \`Hello from ${name}! This is an example skill.\`;
  },
} as Skill;

// You can export multiple skills
export const ${skillName}_echo: Skill = {
  name: "${skillName}_echo",
  description: "Echo back the input",
  async execute(args) {
    return JSON.stringify(args, null, 2);
  },
};
`;
    fs.writeFileSync(path.join(dir, "src", "index.ts"), skillCode);

    // README
    const readme = `# ${name}

Velo plugin with example skills.

## Usage

\`\`\`bash
# Install plugin
velo plugin install ./${path.basename(dir)}

# List plugins
velo plugin list
\`\`\`

## Skills

- \`${skillName}_hello\` - Example greeting skill
- \`${skillName}_echo\` - Echo back input

## Creating New Skills

Add new .ts files to src/ and reference them in velo-plugin.json.
`;
    fs.writeFileSync(path.join(dir, "README.md"), readme);

    return { success: true, path: dir, message: `Created plugin scaffold: ${dir}` };
  }

  // Copy directory recursively
  private async copyDir(src: string, dest: string): Promise<void> {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      if (fs.statSync(srcPath).isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // Save plugin state
  saveState(): void {
    const state = {
      disabled: Array.from(this.registry.plugins.values())
        .filter((p) => !p.enabled)
        .map((p) => p.name),
    };
    fs.writeFileSync(this.configPath, JSON.stringify(state, null, 2));
  }

  // Load plugin state
  loadState(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const state = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        for (const name of state.disabled || []) {
          this.setEnabled(name, false);
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }
}

// CLI helper functions
export async function listInstalledPlugins(): Promise<void> {
  const manager = new PluginManager();
  await manager.discover();
  const plugins = manager.listPlugins();

  if (plugins.length === 0) {
    console.log("\nNo plugins installed.\n");
    console.log("To install a plugin:");
    console.log("  velo plugin install velo-plugin-example");
    console.log("  velo plugin install ./my-local-plugin");
    return;
  }

  console.log("\n═════════ INSTALLED PLUGINS ═════════\n");

  for (const plugin of plugins) {
    const status = plugin.enabled ? "✓" : "✗";
    const skillCount = plugin.skills.length;
    console.log(`${status} ${plugin.name} (${plugin.version})`);
    console.log(`  Path: ${plugin.path}`);
    console.log(`  Skills: ${skillCount}`);
    if (plugin.manifest.description) {
      console.log(`  ${plugin.manifest.description}`);
    }
    if (skillCount > 0) {
      console.log(`  Tools: ${plugin.skills.map((s) => s.name).join(", ")}`);
    }
    console.log("");
  }

  console.log(`Total: ${plugins.length} plugins, ${plugins.reduce((a, p) => a + p.skills.length, 0)} skills`);
}

export async function createPluginScaffold(name: string): Promise<void> {
  const manager = new PluginManager();
  const result = await manager.create(name);

  if (result.success) {
    console.log(`\n✓ ${result.message}\n`);
    console.log(`Plugin created at: ${result.path}`);
    console.log("\nNext steps:");
    console.log("  1. Edit src/index.ts to add your skills");
    console.log("  2. Add more skills in src/ and update velo-plugin.json");
    console.log("  3. Install: velo plugin install ./" + path.basename(result.path!));
  } else {
    console.error(`\n✗ ${result.message}\n`);
  }
}

export async function installPlugin(source: string): Promise<void> {
  const manager = new PluginManager();
  const result = await manager.install(source);

  if (result.success) {
    console.log(`\n✓ ${result.message}\n`);
  } else {
    console.error(`\n✗ ${result.message}\n`);
  }
}

export async function uninstallPlugin(name: string): Promise<void> {
  const manager = new PluginManager();
  await manager.discover();
  const result = await manager.uninstall(name);

  if (result.success) {
    console.log(`\n✓ ${result.message}\n`);
  } else {
    console.error(`\n✗ ${result.message}\n`);
  }
}