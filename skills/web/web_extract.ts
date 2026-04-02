import type { Skill } from "../../src/types.ts";
export default {
  name: "web_extract"
    category: "Web",,
  description: "Extract content from URLs as markdown",
  async execute(args: Record<string, unknown>) {
    const url = args.action || args.url || args.args || "";
    if (!url) return "No URL provided";
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10000);
      return text || "No content extracted";
    } catch (err: any) { return `Extract failed: ${err.message}`; }
  },
} as Skill;