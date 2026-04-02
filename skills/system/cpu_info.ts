import * as os from "os";
import type { Skill } from "../../src/types.ts";
export default {
  name: "cpu_info"
    category: "System",,
  description: "Get CPU information",
  async execute() {
    const cpus = os.cpus();
    return `Model: ${cpus[0].model}\nCores: ${cpus.length}\nSpeed: ${cpus[0].speed} MHz`;
  },
} as Skill;
