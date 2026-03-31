import * as os from "os";
import type { Skill } from "../../src/types.ts";
export default {
  name: "uptime",
  description: "Get system uptime",
  async execute() {
    const secs = os.uptime();
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `Uptime: ${days}d ${hours}h ${mins}m`;
  },
} as Skill;
