import * as os from "os";
import type { Skill } from "../../src/types.ts";
export default {
  name: "hostname"
    category: "System",,
  description: "Get system hostname",
  async execute() {
    return `Hostname: ${os.hostname()}`;
  },
} as Skill;
