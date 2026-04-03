/**
 * velo config — Unified config UI
 * 
 * Design goals:
 * - beautiful table output (like `ngrok status`)
 * - `velo config` shows everything at a glance
 * - `velo config set <key> <value>` for everything
 * - Tab-completion friendly subcommands
 * - All values stored in velo.toml (no .env needed)
 */

import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "./config.ts";
import type { Config } from "./types.ts";

export interface ConfigUIOptions {
  configPath?: string;
  color?: boolean;
}

export class ConfigUI {
  private configPath: string;
  private color: boolean;

  constructor(options: ConfigUIOptions = {}) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "/root";
    this.configPath = options.configPath || path.join(homeDir, ".velo", "config.toml");
    this.color = options.color ?? this.supportsColor();
  }

  private supportsColor(): boolean {
    return process.stderr.isTTY || process.stdout.isTTY;
  }

  // ── Read current config ─────────────────────────────────────────────────

  load(): Config {
    try {
      return loadConfig(this.configPath);
    } catch {
      return {} as Config;
    }
  }

  // ── Main: velo config ───────────────────────────────────────────────────

  /**
   * Beautiful full status display — like `ngrok status`
   * Called when user runs: velo config
   */
  show(): void {
    const cfg = this.load();
    const { agent, providers, channels, compaction, scheduler, memory, skills } = cfg;

    this.header("VELO CONFIG");

    // ── Agent ──
    this.section("AGENT");
    this.row("Name", agent?.name || "velo");
    this.row("Personality", agent?.personality || "helpful");
    this.row("Model", agent?.model || "nvidia:stepfun-ai/step-3.5-flash");
    this.row("Config", this.configPath);

    // ── Providers ──
    this.section("PROVIDERS");
    const hasProviders = providers && Object.keys(providers).length > 0;
    if (hasProviders) {
      for (const [name, prov] of Object.entries(providers)) {
        const apiKey = prov?.apiKeyEnv ? `env:${prov.apiKeyEnv}` : prov?.apiKey ? this.masked(prov.apiKey) : this.dim("(not set)");
        const baseUrl = prov?.baseUrl ? `custom: ${prov.baseUrl}` : this.dim("(default)");
        this.row(name, apiKey);
        if (baseUrl) this.row("", baseUrl);
      }
    } else {
      this.row("", this.dim("No providers configured — run: velo config provider add"));
    }

    // ── Channels ──
    this.section("CHANNELS");
    const tgEnabled = channels?.telegram?.enabled;
    const whEnabled = channels?.webhook?.enabled;
    this.row("Telegram", this.status(tgEnabled, "enabled", "disabled"));
    this.row("Webhook", this.status(whEnabled, `port ${channels?.webhook?.port || 3000}`, "disabled"));
    this.row("Scheduler", this.status(scheduler?.enabled, "enabled", "disabled"));

    // ── Compaction ──
    this.section("COMPACTION");
    const compactEnabled = compaction?.enabled !== false;
    this.row("Active", this.status(compactEnabled, "yes", "no"));
    if (compactEnabled) {
      this.row("Model", compaction?.model || "google:gemma-3-4b-it");
      this.row("Trigger", `after ${compaction?.triggerThreshold ?? 40} messages`);
      this.row("Keep recent", `${compaction?.keepRecent ?? 10} messages`);
    }

    // ── Memory ──
    this.section("MEMORY");
    this.row("DB", memory?.path ? this.dim(path.dirname(memory.path)) + "/" + path.basename(memory.path) : "~/.velo/data/velo.db");
    this.row("Max context", `${memory?.max_context_messages ?? 50} messages`);

    // ── Skills ──
    this.section("SKILLS");
    this.row("Directory", skills?.directory || "~/.velo/skills");
    this.row("Auto-load", this.status(skills?.auto_load !== false, "yes", "no"));

    this.footer();
  }

  // ── velo config set <key> <value> ──────────────────────────────────────

  set(key: string, value: string): { success: boolean; error?: string } {
    if (!key || !value) {
      return { success: false, error: "Usage: velo config set <key> <value>" };
    }

    // Normalize key format
    key = key.replace(/\./g, "."); // already dot-notation
    const [section, ...rest] = key.split(".");
    const childKey = rest.join(".");

    const cfg = this.load();
    let content = fs.existsSync(this.configPath) ? fs.readFileSync(this.configPath, "utf-8") : "";

    const { updated, error } = this.applySet(content, section, childKey, value);
    if (error) return { success: false, error };

    fs.writeFileSync(this.configPath, updated, "utf-8");
    return { success: true };
  }

  private applySet(content: string, section: string, key: string, value: string): { updated: string; error?: string } {
    const isNumeric = /^\d+$/.test(value);
    const isBool = value === "true" || value === "false";
    const needsQuotes = !isNumeric && !isBool;

    // Top-level (agent, memory, skills)
    const topLevel = ["agent", "memory", "skills"];
    if (topLevel.includes(section) && !key.includes(".")) {
      return { updated: this.updateTopLevel(content, section, key, value, needsQuotes) };
    }

    // [compaction]
    if (section === "compaction") {
      return { updated: this.updateSection(content, "compaction", key, value, needsQuotes) };
    }

    // [channels.telegram] / [channels.webhook]
    if (section === "channels") {
      const [channel, prop] = key.split(".");
      return { updated: this.updateNested(content, "channels", channel, prop!, value, needsQuotes) };
    }

    // [providers.nvidia] / [providers.google] etc
    if (section === "providers") {
      const [provName, prop] = key.split(".");
      return { updated: this.updateNested(content, "providers", provName, prop!, value, needsQuotes) };
    }

    // [scheduler]
    if (section === "scheduler") {
      return { updated: this.updateSection(content, "scheduler", key, value, needsQuotes) };
    }

    return { updated: content, error: `Unknown config section: ${section}` };
  }

  private updateTopLevel(content: string, section: string, key: string, value: string, needsQuotes: boolean): string {
    const sectionRegex = new RegExp(`^(\\[${section}\\])$`, "m");
    const sectionMatch = content.match(sectionRegex);

    if (!sectionMatch) {
      // Section doesn't exist — add it
      const newSection = `[${section}]\n${key} = ${needsQuotes ? `"${value}"` : value}\n`;
      return content + "\n" + newSection;
    }

    const sectionEnd = this.findSectionEnd(content, sectionMatch.index!);
    const keyRegex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`, "m");
    const keyMatch = content.substring(sectionMatch.index!, sectionEnd).match(keyRegex);

    if (keyMatch) {
      // Update existing key
      const keyStart = sectionMatch.index! + content.substring(sectionMatch.index!).indexOf(keyMatch[0]);
      const lineEnd = content.indexOf("\n", keyStart);
      const newLine = `${key} = ${needsQuotes ? `"${value}"` : value}`;
      return content.substring(0, keyStart) + newLine + content.substring(lineEnd);
    } else {
      // Add new key in section
      const insertPos = sectionEnd > 0 ? sectionEnd : content.length;
      const insert = `\n${key} = ${needsQuotes ? `"${value}"` : value}`;
      return content.substring(0, insertPos) + insert + content.substring(insertPos);
    }
  }

  private updateSection(content: string, section: string, key: string, value: string, needsQuotes: boolean): string {
    return this.updateTopLevel(content, section, key, value, needsQuotes);
  }

  private updateNested(content: string, parent: string, child: string, key: string, value: string, needsQuotes: boolean): string {
    const sectionName = `${parent}.${child}`;
    const sectionRegex = new RegExp(`^(\\[${sectionName.replace(/\./g, "\\.")}\\])`, "m");
    const sectionMatch = content.match(sectionRegex);

    if (!sectionMatch) {
      // Section doesn't exist — add it
      const newSection = `[${sectionName}]\n${key} = ${needsQuotes ? `"${value}"` : value}\n`;
      return content + "\n\n" + newSection;
    }

    const sectionEnd = this.findSectionEnd(content, sectionMatch.index!);
    const keyRegex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`, "m");
    const sectionBody = content.substring(sectionMatch.index!, sectionEnd);
    const keyMatch = sectionBody.match(keyRegex);

    if (keyMatch) {
      const keyStart = sectionMatch.index! + sectionBody.indexOf(keyMatch[0]);
      const lineEnd = content.indexOf("\n", keyStart);
      const newLine = `${key} = ${needsQuotes ? `"${value}"` : value}`;
      return content.substring(0, keyStart) + newLine + content.substring(lineEnd);
    } else {
      const insertPos = sectionEnd > 0 ? sectionEnd : content.length;
      const insert = `\n${key} = ${needsQuotes ? `"${value}"` : value}`;
      return content.substring(0, insertPos) + insert + content.substring(insertPos);
    }
  }

  private findSectionEnd(content: string, sectionStart: number): number {
    const after = content.substring(sectionStart);
    const nextSection = after.indexOf("\n[");
    return nextSection >= 0 ? sectionStart + nextSection : content.length;
  }

  // ── velo config get <key> ───────────────────────────────────────────────

  get(key: string): { success: boolean; value?: string; error?: string } {
    if (!key) {
      return { success: false, error: "Usage: velo config get <key>" };
    }

    const cfg = this.load();
    const [section, ...rest] = key.split(".");
    const childKey = rest.join(".");

    try {
      const value = this.getNestedValue(cfg, section, childKey);
      if (value === undefined) {
        return { success: false, error: `Key not found: ${key}` };
      }
      return { success: true, value: String(value) };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private getNestedValue(obj: any, ...keys: string[]): any {
    for (const k of keys) {
      if (obj === undefined || obj === null) return undefined;
      obj = obj[k];
    }
    return obj;
  }

  // ── velo config del <key> ─────────────────────────────────────────────

  delete(key: string): { success: boolean; error?: string } {
    // For now, just remove the key from the file directly
    const content = fs.existsSync(this.configPath) ? fs.readFileSync(this.configPath, "utf-8") : "";
    const [section, ...rest] = key.split(".");
    const childKey = rest.join(".");
    const sectionRegex = new RegExp(`^\\[${section.replace(/\./g, "\\.")}\\]`, "m");
    const sectionMatch = content.match(sectionRegex);

    if (!sectionMatch) {
      return { success: false, error: `Section not found: [${section}]` };
    }

    const sectionEnd = this.findSectionEnd(content, sectionMatch.index!);
    const sectionBody = content.substring(sectionMatch.index!, sectionEnd);
    const keyRegex = new RegExp(`^${childKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*(?:\\n|$)`, "m");
    const keyMatch = sectionBody.match(keyRegex);

    if (!keyMatch) {
      return { success: false, error: `Key not found: ${key}` };
    }

    const keyStart = sectionMatch.index! + sectionBody.indexOf(keyMatch[0]);
    const keyEnd = keyStart + keyMatch[0].length;
    const newContent = content.substring(0, keyStart) + content.substring(keyEnd).replace(/^\n/, "");
    fs.writeFileSync(this.configPath, newContent, "utf-8");
    return { success: true };
  }

  // ── velo config provider add <name> <api_key> ──────────────────────────

  providerAdd(name: string, apiKey: string): { success: boolean; error?: string } {
    if (!name || !apiKey) {
      return { success: false, error: "Usage: velo config provider add <name> <api_key>" };
    }
    const result = this.set(`providers.${name}.api_key`, apiKey);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  }

  // ── velo config model <provider:model> ─────────────────────────────────

  setModel(model: string): { success: boolean; error?: string } {
    if (!model) {
      return { success: false, error: "Usage: velo config model <provider:model>" };
    }
    return this.set("agent.model", model);
  }

  // ── velo config channel <name> <on|off> ───────────────────────────────

  channelSet(name: string, state: string): { success: boolean; error?: string } {
    if (!name || !state) {
      return { success: false, error: "Usage: velo config channel <name> <on|off>" };
    }
    const enabled = state === "on" ? "true" : "false";
    return this.set(`channels.${name}.enabled`, enabled);
  }

  // ── Formatted output helpers ───────────────────────────────────────────

  private header(title: string): void {
    const line = "─".repeat(48);
    this.writeln();
    this.writeln(`  ${this.bold(title)}`);
    this.writeln(`  ${line}`);
  }

  private section(name: string): void {
    this.writeln();
    this.writeln(`  ${this.bold(name)}`);
  }

  private row(label: string, value: string): void {
    const width = 18;
    const labelPad = label ? label.padEnd(width) : " ".repeat(width);
    const valueColor = value.includes("(not set)") || value.includes("disabled") ? this.dim(value) : this.value(value);
    this.writeln(`  ${labelPad}  ${valueColor}`);
  }

  private footer(): void {
    this.writeln();
    this.writeln(`  ${this.dim("─".repeat(48))}`);
    this.writeln(`  Edit: ${this.accent("velo config set <key> <value>")}`);
    this.writeln(`  Get:  ${this.accent("velo config get <key>")}`);
    this.writeln();
  }

  private status(value: boolean, truthy: string, falsy: string): string {
    return value ? this.green(truthy) : this.dim(falsy);
  }

  private masked(key: string): string {
    if (key.length <= 8) return this.dim("(set)");
    return key.slice(0, 4) + "****" + key.slice(-4);
  }

  private value(s: string): string { return this.color ? `\x1b[36m${s}\x1b[0m` : s; }
  private accent(s: string): string { return this.color ? `\x1b[33m${s}\x1b[0m` : s; }
  private green(s: string): string { return this.color ? `\x1b[32m${s}\x1b[0m` : s; }
  private bold(s: string): string { return this.color ? `\x1b[1m${s}\x1b[0m` : s; }
  private dim(s: string): string { return this.color ? `\x1b[2m${s}\x1b[0m` : s; }
  private writeln(s = ""): void { console.log(s); }
}
