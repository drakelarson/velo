import type { Skill } from "../../src/types.ts";

export default {
  name: "browser",
  description: "Open a URL in the browser and get the page content. Use for visiting websites, filling forms, clicking buttons, taking screenshots. Args: url (required), action (open/click/type/screenshot/snapshot, default: open)",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to open" },
      action: { type: "string", description: "Action: open, click, type, screenshot, snapshot, scroll, back, forward, reload" },
      selector: { type: "string", description: "CSS selector or @ref for click/type/hover" },
      text: { type: "string", description: "Text to type into a field" },
      key: { type: "string", description: "Key to press (Enter, Tab, Escape, etc.)" },
      direction: { type: "string", description: "Scroll direction: up, down, left, right" },
      pixels: { type: "number", description: "Pixels to scroll" },
      path: { type: "string", description: "Path for screenshot or PDF output" },
    },
    required: ["url"],
  },
  async execute(args: Record<string, unknown>) {
    const url = args.url as string;
    const action = (args.action as string) || "open";
    const selector = args.selector as string;
    const text = args.text as string;
    const key = args.key as string;
    const direction = args.direction as string;
    const pixels = (args.pixels as number) || 500;
    const path = (args.path as string) || "/tmp/browser_shot.png";

    const cmd = (c: string) => {
      const { execSync } = require("child_process");
      try {
        return execSync(c, { timeout: 30000, encoding: "utf-8" });
      } catch (e: any) {
        return e.stdout || e.message;
      }
    };

    if (action === "open") {
      const out = cmd(`agent-browser open "${url}" 2>&1`);
      await new Promise(r => setTimeout(r, 3000));
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Opened ${url}\n\n${snap}`.trim();
    }

    if (action === "screenshot") {
      const out = cmd(`agent-browser screenshot "${path}" 2>&1`);
      return `Screenshot saved to ${path}`;
    }

    if (action === "snapshot") {
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Page snapshot:\n${snap}`.trim();
    }

    if (action === "click" && selector) {
      const out = cmd(`agent-browser click "${selector}" 2>&1`);
      await new Promise(r => setTimeout(r, 1000));
      return `Clicked: ${selector}`;
    }

    if (action === "type" && selector && text) {
      const out = cmd(`agent-browser type "${selector}" "${text}" 2>&1`);
      return `Typed "${text}" into ${selector}`;
    }

    if (action === "fill" && selector && text) {
      const out = cmd(`agent-browser fill "${selector}" "${text}" 2>&1`);
      return `Filled "${text}" into ${selector}`;
    }

    if (action === "press" && key) {
      const out = cmd(`agent-browser press "${key}" 2>&1`);
      return `Pressed: ${key}`;
    }

    if (action === "scroll") {
      const out = cmd(`agent-browser scroll ${direction || "down"} ${pixels} 2>&1`);
      return `Scrolled ${direction || "down"} ${pixels}px`;
    }

    if (action === "back") {
      const out = cmd(`agent-browser back 2>&1`);
      return "Went back";
    }

    if (action === "forward") {
      const out = cmd(`agent-browser forward 2>&1`);
      return "Went forward";
    }

    if (action === "reload") {
      const out = cmd(`agent-browser reload 2>&1`);
      return "Reloaded page";
    }

    if (action === "wait" && selector) {
      const out = cmd(`agent-browser wait "${selector}" 2>&1`);
      return `Waited for: ${selector}`;
    }

    if (action === "snapshot") {
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Page snapshot:\n${snap}`.trim();
    }

    return `Unknown action: ${action}. Use: open, click, type, fill, press, scroll, screenshot, snapshot, back, forward, reload`;
  },
} as Skill;
