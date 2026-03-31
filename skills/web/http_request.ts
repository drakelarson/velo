import type { Skill } from "../../src/types.ts";
export default {
  name: "http_request",
  description: "Make HTTP requests (GET, POST, PUT, DELETE)",
  async execute(args: Record<string, unknown>) {
    const url = args.url || args.args || "";
    const method = (args.method || "GET").toUpperCase();
    const headers = args.headers as Record<string, string> || {};
    const body = args.body ? JSON.stringify(args.body) : undefined;
    if (!url) return "No URL provided";
    try {
      const res = await fetch(url, { method, headers, body });
      const text = await res.text();
      return `Status: ${res.status}\n\n${text.slice(0, 5000)}`;
    } catch (err: any) { return `Request failed: ${err.message}`; }
  },
} as Skill;