import type { Skill } from "../../src/types.ts";
const starts = new Map<string, number>();
export default {
  name: "stopwatch",
  description: "Start/stop stopwatch",
  async execute(args: Record<string, unknown>) {
    const action = args.action || args.args || "start";
    const id = args.id as string || "default";
    if (action === "start") {
      starts.set(id, Date.now());
      return `Stopwatch '${id}' started`;
    }
    if (action === "stop") {
      const elapsed = starts.get(id);
      if (!elapsed) return "Not started";
      const secs = Math.round((Date.now() - elapsed) / 1000);
      starts.delete(id);
      return `Elapsed: ${Math.floor(secs / 60)}m ${secs % 60}s`;
    }
    return "Usage: stopwatch action=<start|stop> [id=<name>]";
  },
} as Skill;
