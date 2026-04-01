import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";

export default {
  name: "web_search",
  description: "Search the web using Webserp (multi-engine: Google, DuckDuckGo, Brave, Yahoo)",
  async execute(args: Record<string, unknown>) {
    const query = args.action || args.query || args.args || "";
    if (!query) return "No search query provided";
    
    try {
      const numResults = args.num || 10;
      const result = execSync(
        `webserp "${query}" -n ${numResults} --json`,
        { encoding: "utf-8", timeout: 30000 }
      );
      
      const data = JSON.parse(result);
      if (!data.results?.length) return `No results found for "${query}"`;
      
      return data.results.slice(0, numResults).map((r: any, i: number) => 
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
      ).join("\n\n");
    } catch (err: any) {
      return `Search failed: ${err.message}`;
    }
  },
} as Skill;
