import type { Skill } from "../../src/types.ts";

export default {
  name: "browser",
  description: "Open a URL, browse websites, take screenshots, interact with pages (click, type, fill, scroll). Returns page snapshot AND screenshot path.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to open" },
      action: { type: "string", description: "Action: open, click, type, screenshot, snapshot, scroll, back, forward, reload, fill" },
      selector: { type: "string", description: "CSS selector or @ref for click/type/fill/hover" },
      text: { type: "string", description: "Text to type into a field" },
      key: { type: "string", description: "Key to press (Enter, Tab, Escape, etc.)" },
      direction: { type: "string", description: "Scroll direction: up, down, left, right" },
      pixels: { type: "number", description: "Pixels to scroll" },
      path: { type: "string", description: "Path for screenshot output (default: /tmp/velo_shot.png)" },
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
    const path = (args.path as string) || "/tmp/velo_shot.png";

    const cmd = (c: string) => {
      const { execSync } = require("child_process");
      try {
        return execSync(c, { timeout: 30000, encoding: "utf-8" });
      } catch (e: any) {
        return e.stdout || e.message;
      }
    };

    // ── OPEN: navigate + snapshot + screenshot ──────────────────────────────
    if (action === "open") {
      cmd(`agent-browser open "${url}" 2>&1`);
      await new Promise(r => setTimeout(r, 3000));
      // Always save screenshot alongside snapshot
      cmd(`agent-browser screenshot "${path}" 2>&1`);
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `SCREENSHOT:${path}\nOpened ${url}\n\nPage content:\n${snap}`.trim();
    }

    // ── SCREENSHOT only ─────────────────────────────────────────────────────
    if (action === "screenshot") {
      const out = cmd(`agent-browser screenshot "${path}" 2>&1`);
      return `SCREENSHOT:${path}\nScreenshot saved to ${path}`.trim();
    }

    // ── SNAPSHOT only ──────────────────────────────────────────────────────
    if (action === "snapshot") {
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Page snapshot:\n${snap}`.trim();
    }

    // ── CLICK ──────────────────────────────────────────────────────────────
    if (action === "click" && selector) {
      const out = cmd(`agent-browser click "${selector}" 2>&1`);
      await new Promise(r => setTimeout(r, 1000));
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Clicked: ${selector}\n\n${snap}`.trim();
    }

    // ── TYPE ───────────────────────────────────────────────────────────────
    if (action === "type" && selector && text) {
      const out = cmd(`agent-browser type "${selector}" "${text}" 2>&1`);
      return `Typed "${text}" into ${selector}`.trim();
    }

    // ── FILL ───────────────────────────────────────────────────────────────
    if (action === "fill" && selector && text) {
      const out = cmd(`agent-browser fill "${selector}" "${text}" 2>&1`);
      return `Filled "${text}" into ${selector}`.trim();
    }

    // ── PRESS ─────────────────────────────────────────────────────────────
    if (action === "press" && key) {
      const out = cmd(`agent-browser press "${key}" 2>&1`);
      return `Pressed: ${key}`.trim();
    }

    // ── SCROLL ────────────────────────────────────────────────────────────
    if (action === "scroll") {
      const out = cmd(`agent-browser scroll ${direction || "down"} ${pixels} 2>&1`);
      return `Scrolled ${direction || "down"} ${pixels}px`.trim();
    }

    // ── BACK ───────────────────────────────────────────────────────────────
    if (action === "back") {
      cmd(`agent-browser back 2>&1`);
      await new Promise(r => setTimeout(r, 1500));
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Went back\n\n${snap}`.trim();
    }

    // ── FORWARD ───────────────────────────────────────────────────────────
    if (action === "forward") {
      cmd(`agent-browser forward 2>&1`);
      await new Promise(r => setTimeout(r, 1500));
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Went forward\n\n${snap}`.trim();
    }

    // ── RELOAD ────────────────────────────────────────────────────────────
    if (action === "reload") {
      cmd(`agent-browser reload 2>&1`);
      await new Promise(r => setTimeout(r, 2000));
      const snap = cmd(`agent-browser snapshot 2>&1`);
      return `Reloaded page\n\n${snap}`.trim();
    }

    // ── WAIT ───────────────────────────────────────────────────────────────
    if (action === "wait" && selector) {
      const out = cmd(`agent-browser wait "${selector}" 2>&1`);
      return `Waited for: ${selector}`.trim();
    }

    return `Unknown action: ${action}. Use: open, click, type, fill, press, scroll, screenshot, snapshot, back, forward, reload`;
  },
} as Skill;
