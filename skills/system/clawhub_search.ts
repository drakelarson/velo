import type { Skill } from "../../src/types.ts";

export default {
  name: "clawhub_search",
  description: "Search ClawHub (clawhub.ai) for skills and get install URLs. Usage: clawhub_search <query>\n\nClawHub is the skill marketplace for OpenClaw agents. This searches their registry to find skills, then extracts the actual source (GitHub or npm) so you can install them with the 'install' skill — no ClawHub CLI needed.",

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query || args.args || args.action || "").trim();
    if (!query) {
      return `Usage: clawhub_search <query>\n\nExample: clawhub_search github integration`;
    }

    try {
      // Search ClawHub's website
      const searchUrl = `https://clawhub.ai/skills?q=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": "Velo/1.0" }
      });
      
      if (!res.ok) {
        return `ClawHub search failed: HTTP ${res.status}`;
      }
      
      const html = await res.text();
      
      // Extract skill links from search results
      // ClawHub shows skills at /skills/{slug}
      const skillMatches = html.match(/\/skills\/([a-zA-Z0-9_-]+)/g);
      const seen = new Set<string>();
      const slugs: string[] = [];
      
      if (skillMatches) {
        for (const m of skillMatches) {
          const slug = m.replace("/skills/", "");
          if (!seen.has(slug)) {
            seen.add(slug);
            slugs.push(slug);
          }
        }
      }
      
      if (slugs.length === 0) {
        return `No skills found on ClawHub for "${query}"`;
      }
      
      // Get details for top 5 skills
      const results: string[] = [];
      
      for (const slug of slugs.slice(0, 5)) {
        const detailRes = await fetch(`https://clawhub.ai/skills/${slug}`, {
          headers: { "User-Agent": "Velo/1.0" }
        });
        
        if (!detailRes.ok) continue;
        
        const detailHtml = await detailRes.text();
        
        // Extract description
        const descMatch = detailHtml.match(/<meta name="description" content="([^"]+)"/i) ||
                         detailHtml.match(/class="[^"]*description[^"]*"[^>]*>([^<]+)</i);
        const description = descMatch ? descMatch[1].slice(0, 150) : "No description";
        
        // Extract GitHub or npm URL from the page
        const githubMatch = detailHtml.match(/github\.com[/:][^\s"'<>]+/i);
        const npmMatch = detailHtml.match(/npmjs\.com\/package\/([^\s"'<>/]+)/i);
        
        let installHint = "";
        if (githubMatch) {
          installHint = `\n   → GitHub: ${githubMatch[0]}`;
        } else if (npmMatch) {
          installHint = `\n   → npm: ${npmMatch[1]}`;
        }
        
        results.push(`📦 **${slug}**\n   ${description}...${installHint}`);
      }
      
      if (results.length === 0) {
        return `Found ${slugs.length} skills but couldn't fetch details. Try: https://clawhub.ai/skills?q=${encodeURIComponent(query)}`;
      }
      
      return `🔍 Found ${slugs.length} skills on ClawHub:\n\n${results.join("\n\n")}\n\n💡 Install any with: install <github-url-or-npm-name>`;
      
    } catch (err: any) {
      return `ClawHub search failed: ${err.message}`;
    }
  },
} as Skill;
