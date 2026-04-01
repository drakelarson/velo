import type { Skill } from "../../src/types.ts";
export default {
  name: "github_search",
  description: "Search GitHub repositories. Usage: github_search <query>",
  async execute(args: Record<string, unknown>) {
    // Accept: query, args (standard), OR action (when model passes raw query as action)
    const query = args.query || args.args || args.action || "";
    if (!query) return "No search query. Usage: github_search <query>";
    try {
      const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10`, {
        headers: { "Accept": "application/vnd.github.v3+json" }
      });
      const data = await res.json() as any;
      if (data.items?.length === 0) return `No GitHub results for "${query}"`;
      return data.items.map((r: any, i: number) =>
        `${i+1}. ${r.full_name} (⭐ ${r.stargazers_count})\n   ${r.description || "no description"}`
      ).join("\n\n");
    } catch (err: any) { return `GitHub search failed: ${err.message}`; }
  },
} as Skill;
