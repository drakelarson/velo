import type { Skill } from "../../src/types.ts";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export default {
  name: "install",
  description: "Install a Velo plugin or skill from a URL or package name. Usage: install <source>\n\nSources supported:\n  - GitHub repo URL: https://github.com/user/velo-plugin-name\n  - npm package: velo-plugin-somepackage\n  - Local path: /path/to/skill\n\nExample: install https://github.com/user/velo-plugin-foo",

  async execute(args: Record<string, unknown>): Promise<string> {
    const input = String(args.action || args.args || "").trim();
    if (!input) {
      return `Usage: install <source>\n\nSources:\n  GitHub URL - https://github.com/user/velo-plugin-name\n  npm package - velo-plugin-somepackage\n  local path - /path/to/skill`;
    }

    const veloRoot = path.join(os.homedir(), ".velo");
    const pluginsDir = path.join(veloRoot, "plugins");
    const skillsDir = path.join(veloRoot, "skills");

    // Ensure dirs exist
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

    try {
      // Clawhub URL (clawhub.net/skills/slug)
      if (input.includes("clawhub.net")) {
        return installFromClawhub(input, pluginsDir);
      }
      // GitHub URL
      else if (input.includes("github.com")) {
        return installFromGitHub(input, pluginsDir);
      }
      // npm package
      else if (!input.startsWith("/") && !input.includes(".")) {
        return installFromNpm(input, veloRoot);
      }
      // Local path
      else if (fs.existsSync(input)) {
        return installFromLocal(input, pluginsDir, skillsDir);
      }
      else {
        return `Could not find: ${input}\n\nProvide a GitHub URL, Clawhub URL, npm package name, or local path.`;
      }
    } catch (err: any) {
      return `Install failed: ${err.message}`;
    }
  },
} as Skill;

function installFromGitHub(url: string, pluginsDir: string): string {
  // Extract owner/repo from GitHub URL
  const match = url.match(/github\.com[/:]([^/]+)\/([^/\s]+)/);
  if (!match) return `Invalid GitHub URL: ${url}`;

  const [, owner, repo] = match;
  const cleanName = repo.replace(/\.git$/, "");
  const destPath = path.join(pluginsDir, `velo-plugin-${cleanName}`);

  if (fs.existsSync(destPath)) {
    return `Plugin "${cleanName}" already installed at ${destPath}\n\nTo reinstall, delete it first: rm -rf "${destPath}"`;
  }

  console.error(`[install] Cloning ${owner}/${repo}...`);
  execSync(`git clone https://github.com/${owner}/${repo}.git "${destPath}"`, { stdio: "pipe" });

  // Run npm install if package.json exists
  const pkgJson = path.join(destPath, "package.json");
  if (fs.existsSync(pkgJson)) {
    console.error(`[install] Running npm install in ${destPath}...`);
    execSync("npm install", { cwd: destPath, stdio: "pipe" });
  }

  return `✅ Installed "${cleanName}" from GitHub\n\nLocation: ${destPath}\n\nRestart the bot to load the new plugin, or type "reload skills" to refresh.`;
}

function installFromClawhub(url: string, pluginsDir: string): string {
  // Extract slug from clawhub.net/skills/slug or clawhub.net/skill/slug
  const match = url.match(/clawhub\.net\/(?:skills?|skill)\/([^\/\?\#]+)/);
  if (!match) return `Invalid Clawhub URL: ${url}\n\nFormat: https://clawhub.net/skills/skill-name`;

  const slug = match[1];
  const downloadUrl = `https://clawhub.net/api/v1/clawhub_skills/${slug}/download`;
  const zipPath = `/tmp/clawhub-${slug}.zip`;
  const extractPath = `/tmp/clawhub-${slug}`;

  console.error(`[install] Downloading ${slug} from Clawhub...`);

  // Download the zip
  execSync(`curl -fsSL "${downloadUrl}" -o "${zipPath}"`, { stdio: "pipe" });

  const destPath = path.join(pluginsDir, `velo-plugin-${slug}`);

  if (fs.existsSync(destPath)) {
    // Clean up old version
    console.error(`[install] Removing existing ${slug}...`);
    execSync(`rm -rf "${destPath}"`, { stdio: "pipe" });
  }

  // Extract zip
  console.error(`[install] Extracting to ${destPath}...`);
  execSync(`mkdir -p "${extractPath}" && unzip -o "${zipPath}" -d "${extractPath}"`, { stdio: "pipe" });

  // Find the actual skill folder (zip often contains a parent directory)
  const entries = fs.readdirSync(extractPath);
  let skillDir = extractPath;
  if (entries.length === 1 && fs.statSync(path.join(extractPath, entries[0])).isDirectory()) {
    skillDir = path.join(extractPath, entries[0]);
  }

  // Move to plugins dir
  execSync(`mv "${skillDir}" "${destPath}"`, { stdio: "pipe" });

  // Clean up
  execSync(`rm -rf "${zipPath}" "${extractPath}"`, { stdio: "pipe" });

  // Run npm install if needed
  const pkgJson = path.join(destPath, "package.json");
  if (fs.existsSync(pkgJson)) {
    console.error(`[install] Running npm install...`);
    execSync("npm install", { cwd: destPath, stdio: "pipe" });
  }

  return `✅ Installed "${slug}" from Clawhub\n\nLocation: ${destPath}\n\nRestart the bot to load the new plugin.`;
}

function installFromNpm(pkgName: string, veloRoot: string): string {
  const destPath = path.join(veloRoot, "node_modules", pkgName);

  if (fs.existsSync(destPath)) {
    return `Package "${pkgName}" already installed.\nRestart the bot to use it.`;
  }

  try {
    console.error(`[install] Installing npm package: ${pkgName}...`);
    execSync(`npm install ${pkgName}`, { cwd: veloRoot, stdio: "pipe" });
    return `✅ Installed "${pkgName}" from npm\n\nLocation: ${destPath}\n\nRestart the bot to load the new plugin.`;
  } catch (npmErr: any) {
    // npm failed — try GitHub as fallback (common pattern: github.com/org/velo-plugin-name)
    const githubUrl = `https://github.com/${pkgName.replace(/^@/, "")}`;
    try {
      console.error(`[install] npm failed (${npmErr.message}), trying GitHub: ${githubUrl}`);
      execSync(`git clone ${githubUrl} "${path.join(veloRoot, "plugins", `velo-plugin-${pkgName.replace("@", "")}`)}"`, { cwd: veloRoot, stdio: "pipe" });
      return `✅ Installed "${pkgName}" from GitHub (npm was unavailable)\n\nRestart the bot to load the new plugin.`;
    } catch {
      return `Install failed for "${pkgName}":\n\n1. npm: ${npmErr.message}\n2. GitHub: not found or clone failed\n\nTry providing a direct GitHub URL instead:\n  install https://github.com/user/${pkgName}`;
    }
  }
}

function installFromLocal(sourcePath: string, pluginsDir: string, skillsDir: string): string {
  const name = path.basename(sourcePath);
  const isPlugin = fs.existsSync(path.join(sourcePath, "package.json")) ||
                   fs.existsSync(path.join(sourcePath, "velo-plugin.json")) ||
                   fs.existsSync(path.join(sourcePath, "index.ts"));

  const destPath = isPlugin
    ? path.join(pluginsDir, `velo-plugin-${name}`)
    : path.join(skillsDir, name);

  if (fs.existsSync(destPath)) {
    return `"${name}" already exists at ${destPath}`;
  }

  console.error(`[install] Copying from ${sourcePath} to ${destPath}...`);
  execSync(`cp -r "${sourcePath}" "${destPath}"`, { stdio: "pipe" });

  const pkgJson = path.join(destPath, "package.json");
  if (fs.existsSync(pkgJson)) {
    console.error(`[install] Running npm install in ${destPath}...`);
    execSync("npm install", { cwd: destPath, stdio: "pipe" });
  }

  return `✅ Installed "${name}" from local path\n\nLocation: ${destPath}\n\nRestart the bot to load.`;
}
