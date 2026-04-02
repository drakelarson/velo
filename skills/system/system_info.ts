import * as os from "os";
import type { Skill } from "../../src/types.ts";
function formatBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(2)} ${units[i]}`;
}
export default {
  name: "system_info"
    category: "System",,
  description: "Get system information",
  async execute() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return `System: ${os.type()} ${os.release()}\nCPU: ${os.cpus().length} cores\nMemory: ${formatBytes(totalMem - freeMem)} / ${formatBytes(totalMem)}`;
  },
} as Skill;