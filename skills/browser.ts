import type { Skill } from "../src/types.ts";
import { execSync } from "child_process";

function runBrowser(cmd: string): string {
  try {
    const result = execSync(`agent-browser ${cmd}`, { 
      encoding: "utf-8", 
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString() || err.message;
    if (stderr.includes("no browser session")) {
      return "Error: No browser session. Use browser_open first.";
    }
    return `Error: ${stderr.slice(0, 200)}`;
  }
}

export default {
  name: "browser",
  description: "Control a web browser. Actions: open(url), click(selector), fill(selector, text), scroll(dir), screenshot(), read(), snapshot(), back(), close(). Examples: browser open https://example.com, browser click #submit, browser fill #email test@test.com",

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    
    if (!action) {
      return `Browser commands:
  open <url>      - Navigate to URL
  click <sel>     - Click element (CSS selector or @ref)
  fill <sel> <text> - Fill form field
  type <text>     - Type text
  press <key>     - Press key (Enter, Tab, Escape)
  scroll <dir>    - Scroll (up/down)
  screenshot      - Take screenshot (returns path)
  snapshot        - Get accessibility tree (for AI)
  read [sel]      - Get page text or element text
  html [sel]      - Get page HTML
  url             - Get current URL
  title           - Get page title
  back            - Go back
  close           - Close browser

Examples:
  browser open https://google.com
  browser fill input[name="q"] hello world
  browser press Enter
  browser read`;
    }

    // Parse action
    const parts = action.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const params = parts.slice(1).join(" ");

    switch (cmd) {
      case "open":
        if (!params) return "Error: URL required. Usage: browser open https://example.com";
        const openResult = runBrowser(`open "${params}"`);
        
        // Wait a moment for JS to render
        await new Promise(r => setTimeout(r, 1500));
        
        // Get page content
        const title = runBrowser("get title");
        const bodyText = runBrowser("get text body");
        const snapshot = runBrowser("snapshot -i");
        
        // Detect blocking
        const blocked = bodyText.toLowerCase().match(/forbidden|access denied|blocked|captcha|cloudflare|please wait/i);
        
        if (blocked) {
          return `${openResult}

⚠️ Page appears to be BLOCKED: "${bodyText.slice(0, 100)}"
Title: ${title || "(none)"}
URL: ${params}

This site may be blocking automated browsers. Options:
- Try a screenshot: browser screenshot
- The site may require authentication
- The site may have bot protection`;
        }
        
        return `${openResult}
Title: ${title || "(none)"}

Page text:
${bodyText}

Interactive elements:
${snapshot}`;
      
      case "click":
        if (!params) return "Error: Selector required. Usage: browser click #button";
        return runBrowser(`click "${params}"`);
      
      case "fill":
        const fillMatch = params.match(/^(\S+)\s+(.+)$/);
        if (!fillMatch) return "Error: Selector and text required. Usage: browser fill #input text";
        return runBrowser(`fill "${fillMatch[1]}" "${fillMatch[2]}"`);
      
      case "type":
        if (!params) return "Error: Text required. Usage: browser type hello";
        return runBrowser(`keyboard type "${params}"`);
      
      case "press":
        if (!params) return "Error: Key required. Usage: browser press Enter";
        return runBrowser(`press ${params}`);
      
      case "scroll":
        const dir = params || "down";
        return runBrowser(`scroll ${dir}`);
      
      case "screenshot":
        const path = `/tmp/browser-screenshot-${Date.now()}.png`;
        const result = runBrowser(`screenshot ${path}`);
        if (result.includes("Error")) return result;
        return `Screenshot saved: ${path}`;
      
      case "snapshot":
        return runBrowser("snapshot -i");
      
      case "read":
      case "text":
        if (params) {
          return runBrowser(`get text "${params}"`);
        }
        return runBrowser("get text");
      
      case "html":
        if (params) {
          return runBrowser(`get html "${params}"`);
        }
        return runBrowser("get html");
      
      case "url":
        return runBrowser("get url");
      
      case "title":
        return runBrowser("get title");
      
      case "back":
        return runBrowser("back");
      
      case "close":
        return runBrowser("close");
      
      default:
        // Pass through raw command
        return runBrowser(action);
    }
  }
} as Skill;