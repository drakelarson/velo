import type { Skill } from "../../src/types.ts";
export default {
  name: "sitemap_parse",
  description: "Parse sitemap.xml URLs",
  async execute(args: Record<string, unknown>) {
    const url = args.action || args.url || args.args || "";
    if (!url) return "No sitemap URL";
    try {
      const res = await fetch(url);
      const xml = await res.text();
      const urls = xml.match(/<loc>(.+?)<\/loc>/gi)?.slice(0, 50) || [];
      return urls.map(u => u.replace(/<\/?loc>/g, "")).join("\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
