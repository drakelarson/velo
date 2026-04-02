import type { Skill } from "../../src/types.ts";

export default {
  name: "reddit_fetch"
    category: "Social",,
  description: "Fetch Reddit post or thread. Usage: reddit_fetch <url_or_permalink>",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    let input = String(args.query || args.args || args.action || "").trim();
    if (!input) return "Usage: reddit_fetch <url_or_permalink>\n\nExample: reddit_fetch https://www.reddit.com/r/technology/comments/abc123/some_post";

    // Normalize URL
    let url = input;
    if (!input.includes("reddit.com") && !input.startsWith("/r/")) {
      return "Invalid Reddit URL. Use a reddit.com URL or /r/subreddit/post-id format.";
    }

    if (input.startsWith("/r/")) {
      url = `https://www.reddit.com${input}.json`;
    } else {
      url = input.replace(/\?.*$/, ""); // strip query params
      if (!url.endsWith(".json")) url += ".json";
    }

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Velo/1.0 (social fetch tool)" }
      });
      
      if (!res.ok) return `Reddit API error: ${res.status}`;
      
      const json = await res.json();
      const post = json[0]?.data?.children?.[0]?.data;
      
      if (!post) return "Could not parse Reddit post.";
      
      let output = `📧 **${post.title}**\n`;
      output += `r/${post.subreddit} • u/${post.author} • ${new Date(post.created_utc * 1000).toLocaleDateString()}\n`;
      output += `⬆ ${post.score.toLocaleString()} | 💬 ${post.num_comments.toLocaleString()} comments`;
      if (post.link_flair_text) output += ` | 🏷️ ${post.link_flair_text}`;
      output += "\n";
      
      if (post.selftext) {
        output += `\n${post.selftext.slice(0, 800)}${post.selftext.length > 800 ? "\n...(truncated)" : ""}\n`;
      }
      
      // If it's a post listing, include top comments
      if (json.length > 1 && json[1]?.data?.children) {
        const comments = json[1].data.children.slice(0, 3);
        output += `\n💬 **Top Comments:**\n`;
        for (const c of comments) {
          const cd = c.data;
          output += `\n• u/${cd.author} (${cd.score} pts): ${cd.body?.slice(0, 200) || "(deleted)"}${cd.body?.length > 200 ? "..." : ""}\n`;
        }
      }
      
      return output;
    } catch (err: any) {
      return `reddit_fetch failed: ${err.message}`;
    }
  },
} as Skill;
