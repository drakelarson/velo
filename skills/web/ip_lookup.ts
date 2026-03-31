import type { Skill } from "../../src/types.ts";
export default {
  name: "ip_lookup",
  description: "Lookup IP address information",
  async execute(args: Record<string, unknown>) {
    const ip = args.ip || args.args || "";
    try {
      const res = await fetch(`https://ip-api.com/json/${ip}`);
      const data = await res.json();
      if (data.status === "fail") return `Error: ${data.message}`;
      return `IP: ${data.query}\nLocation: ${data.city}, ${data.country}\nISP: ${data.isp}`;
    } catch (err: any) { return `Lookup failed: ${err.message}`; }
  },
} as Skill;