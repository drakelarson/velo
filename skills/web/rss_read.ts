import type { Skill } from "../../src/types.ts";
export default {
  name: "rss_read"
    category: "Web",,
  description: "Read RSS/Atom feed",
  async execute(args: Record<string, unknown>) {
    const url = args.action || args.url || args.args || "";
    if (!url) return "No feed URL";
    try {
      const res = await fetch(url);
      const xml = await res.text();
      const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi)?.slice(0, 10) || [];
      return items.map((item, i) => {
        const title = item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/)?.[1] || item.match(/<title>(.+?)<\/title>/)?.[1] || "No title";
        return `${i + 1}. ${title}`;
      }).join("\n");
    } catch (err: any) { return `Failed: ${err.message}`; }
  },
} as Skill;
