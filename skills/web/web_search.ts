import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";

export default {
  name: "web_search"
    category: "Web",,
  description: "Search the web using Webserp (multi-engine: Google, DuckDuckGo, Brave, Yahoo). Usage: web_search <query>",
  async execute(args: Record<string, unknown>) {
    const query = String(args.action || args.query || args.args || "").trim();
    if (!query) return "No search query provided. Usage: web_search <query>";

    try {
      const numResults = args.num || 8;
      const raw = execSync(
        `webserp "${query.replace(/"/g, '\\"')}" -n ${numResults}`,
        { encoding: "utf-8", timeout: 30000 }
      );

      // Parse the plain-text output webserp returns
      const lines = raw.split("\n").filter(l => l.trim());
      const results: string[] = [];
      let i = 0;

      for (const line of lines) {
        // webserp outputs numbered results like "1. Title" or "[engine] result"
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\.\s/)?.[1];
          const rest = line.replace(/^\d+\.\s/, "");
          if (rest.startsWith("[")) {
            // Likely a engine tag line, skip or merge
            continue;
          }
          results.push(`**${rest}**`);
          i++;
        } else if (line.startsWith("http")) {
          results.push(`🔗 ${line}`);
        } else if (line.startsWith("Title:") || line.startsWith("Content:")) {
          // Skip raw field labels
        } else if (!/^\[.+\]/.test(line) && line.length > 10) {
          // Snippet-like content
          results.push(`  ${line}`);
        }
      }

      if (results.length === 0) {
        return `No search results found for "${query}".`;
      }

      return `🔍 **${query}**\n\n${results.join("\n")}\n\n_Web search via webserp_`;
    } catch (err: any) {
      return `Search failed: ${err.message}`;
    }
  },
} as Skill;
