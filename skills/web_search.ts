import type { Skill } from "../src/types.ts";
import { execSync } from "child_process";

export default {
  name: "search_web",
  description: "Search the web using multiple engines (Google, DuckDuckGo, Brave, Yahoo, Mojeek, Startpage, Presearch). Returns titles, URLs, and snippets. Usage: search_web <query> or search_web <query> <max_results>",

  async execute(args: Record<string, unknown>): Promise<string> {
    // Extract query from various arg formats
    let query = "";
    let maxResults = 10;
    
    if (typeof args === "string") {
      query = args;
    } else if (args.query) {
      query = String(args.query);
    } else if (args.args) {
      // Could be "query" or "query 5" format
      const parts = String(args.args).trim().split(/\s+/);
      query = parts.slice(0, -1).join(" ") || parts[0];
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart) && parts.length > 1) {
        maxResults = Math.min(parseInt(lastPart), 20);
      }
    } else if (args.q) {
      query = String(args.q);
    } else if (args.action) {
      // Handle "search <query>" format
      const action = String(args.action);
      query = action.replace(/^search\s+/i, "");
    }
    
    // Check for max_results in args
    if (args.max_results || args.n) {
      maxResults = Math.min(parseInt(String(args.max_results || args.n)), 20);
    }
    
    if (!query) {
      return "No search query provided. Usage: search_web <query>";
    }

    try {
      // Use webserp CLI for multi-engine search
      const result = execSync(
        `webserp "${query.replace(/"/g, '\\"')}" -n ${maxResults}`,
        { 
          encoding: "utf-8", 
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 5 // 5MB buffer
        }
      );
      
      const data = JSON.parse(result);
      
      if (!data.results || data.results.length === 0) {
        return `No results found for "${query}"`;
      }
      
      // Format results for readability
      const formatted = data.results.slice(0, maxResults).map((r: any, i: number) => {
        const content = r.content?.slice(0, 200) || "";
        return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${content}${content.length >= 200 ? "..." : ""}\n   _[${r.engine}]_`;
      }).join("\n\n");
      
      return `Found ${data.number_of_results} results for "${query}" (from ${data.results.reduce((acc: Set<string>, r: any) => acc.add(r.engine), new Set()).size} engines):\n\n${formatted}`;
      
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      
      if (errorMsg.includes("timeout")) {
        return `Search timed out for "${query}". Try a simpler query.`;
      }
      
      return `Search failed: ${errorMsg.slice(0, 200)}`;
    }
  },
} as Skill;