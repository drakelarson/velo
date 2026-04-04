import type { Skill } from "../../src/types.ts";

const SNAPSHOT_PATH = "/tmp/velo_shot.png";

export default {
  name: "browser",
  description: "Open URLs, capture screenshots, interact with web pages. ALWAYS call this when the user asks about anything online.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "Action: open, snapshot, screenshot, click, fill, submit, go, navigate, get" },
      url: { type: "string", description: "URL for open/go/navigate actions" },
      task: { type: "string", description: "Description of what to do for snapshot/get actions" },
      ref: { type: "string", description: "Element reference for click/fill/submit" },
      input: { type: "string", description: "Text to fill into input fields" },
    },
  },
  async execute(args: Record<string, unknown>) {
    const action = (args.action as string) || (args.url ? "open" : "snapshot");
    const url = (args.url as string) || "";
    const task = (args.task as string) || "";

    const { execSync } = require("child_process");

    try {
      let output = "";

      if (action === "open" || action === "go" || action === "navigate") {
        output = execSync(`agent-browser open "${url}"`, { timeout: 15000, encoding: "utf-8" });
        // Always take a screenshot after opening
        try {
          execSync(`agent-browser screenshot "${SNAPSHOT_PATH}" --full-page`, { timeout: 15000 });
          return `SCREENSHOT:${SNAPSHOT_PATH}\n\n${output.trim()}`;
        } catch {
          return output.trim();
        }
      }

      if (action === "screenshot" || action === "snapshot" || action === "capture") {
        execSync(`agent-browser screenshot "${SNAPSHOT_PATH}" --full-page`, { timeout: 15000 });
        output = `SCREENSHOT:${SNAPSHOT_PATH}`;
        if (task) {
          try {
            const snap = execSync(`agent-browser snapshot -i`, { timeout: 10000, encoding: "utf-8" });
            output += "\n\n" + snap.trim();
          } catch {}
        }
        return output;
      }

      if (action === "click" && args.ref) {
        output = execSync(`agent-browser click ${args.ref}`, { timeout: 10000, encoding: "utf-8" });
      } else if (action === "fill" && args.ref && args.input) {
        output = execSync(`agent-browser fill ${args.ref} "${args.input}"`, { timeout: 10000, encoding: "utf-8" });
      } else if (action === "submit" && args.ref) {
        output = execSync(`agent-browser submit ${args.ref}`, { timeout: 10000, encoding: "utf-8" });
      } else if (action === "get" || action === "snapshot" || task) {
        output = execSync(`agent-browser snapshot -i`, { timeout: 10000, encoding: "utf-8" });
      } else {
        return `Unknown browser action: ${action}. Use action=open with url=, or action=snapshot/task for content.`;
      }

      // Always try to capture a screenshot after interactions
      try {
        execSync(`agent-browser screenshot "${SNAPSHOT_PATH}" --full-page`, { timeout: 15000 });
        return `SCREENSHOT:${SNAPSHOT_PATH}\n\n${output.trim()}`;
      } catch {
        return output.trim();
      }
    } catch (err: any) {
      return `Browser error: ${err.message?.split("\n")[0] || err}`;
    }
  },
} as Skill;
