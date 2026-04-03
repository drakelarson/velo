import type { Skill } from "../../src/types.ts";

export default {
  name: "x_fetch",
  description: "Fetch a tweet/X post by URL or ID and get its text content (no login required). Usage: x_fetch <url_or_id>",
  async execute(args: Record<string, unknown>): Promise<string> {
    const input = String(args.url || args.action || args.args || "").trim();
    if (!input) return "No tweet URL or ID provided";
    
    // Extract tweet ID from URL
    let tweetId = input;
    const urlMatch = input.match(/status\/(\d+)/);
    if (urlMatch) tweetId = urlMatch[1];
    
    try {
      const res = await fetch(`https://api.vxtwitter.com/twitter/status/${tweetId}`);
      if (!res.ok) return `Failed to fetch tweet: ${res.status}`;
      
      const data = await res.json() as any;
      
      if (data.error || data.status === 404 || !data.text) {
        return `Tweet not found or unavailable`;
      }
      
      const { text, user_name, user_screen_name, date, likes, retweets, replies, mediaURLs } = data;
      
      let output = `**@${user_screen_name}** (${user_name})\n`;
      output += `📅 ${date}\n\n`;
      output += `${text}\n\n`;
      output += `❤️ ${likes} | 🔁 ${retweets} | 💬 ${replies}`;
      
      if (mediaURLs && mediaURLs.length > 0) {
        output += `\n📎 Media: ${mediaURLs.join(", ")}`;
      }
      
      return output;
    } catch (err: any) {
      return `x_fetch failed: ${err.message}`;
    }
  },
} as Skill;
