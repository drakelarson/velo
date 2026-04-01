import { execSync } from "child_process";
import type { Skill } from "../../src/types.ts";
export default {
  name: "dns_lookup",
  description: "Perform DNS lookups",
  async execute(args: Record<string, unknown>) {
    const domain = args.action || args.domain || args.args || "";
    const type = args.type || "A";
    if (!domain) return "No domain provided";
    try {
      const result = execSync(`dig +short ${domain} ${type}`, { encoding: "utf-8", timeout: 10000 });
      return result.trim() || "No records found";
    } catch (err: any) { return `DNS lookup failed: ${err.message}`; }
  },
} as Skill;