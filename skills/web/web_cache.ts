import type { Skill } from "../../src/types.ts";
const cache = new Map<string, { data: any; expiry: number }>();
export default {
  name: "web_cache",
  description: "Cache web responses for faster retrieval",
  async execute(args: Record<string, unknown>) {
    const action = args.action || args.args || "get";
    const key = args.key as string;
    if (action === "clear") { cache.clear(); return "Cache cleared"; }
    if (action === "list") { return Array.from(cache.keys()).join("\n") || "Empty"; }
    if (!key) return "Usage: web_cache action=<get|set|clear|list> key=<id>";
    const entry = cache.get(key);
    if (!entry) return `No cached data for: ${key}`;
    if (Date.now() > entry.expiry) { cache.delete(key); return "Cache expired"; }
    return JSON.stringify(entry.data, null, 2).slice(0, 2000);
  },
} as Skill;
