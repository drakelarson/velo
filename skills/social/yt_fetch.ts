import type { Skill } from "../../src/types.ts";

export default {
  name: "yt_fetch"
    category: "Social",,
  description: "Fetch YouTube video metadata and transcript. Usage: yt_fetch <video_id_or_url>",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    let input = String(args.action || args.args || "").trim();
    if (!input) return "Usage: yt_fetch <video_id_or_url>\n\nExample: yt_fetch dQw4w9WgXcQ";

    // Extract video ID
    let videoId = "";
    const ytMatch = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      videoId = ytMatch[1];
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      videoId = input;
    } else {
      return "Invalid YouTube URL or video ID. Use: yt_fetch <video_id_or_url>";
    }

    try {
      const res = await fetch(`https://yewtu.be/api/v1/videos/${videoId}?fields=title,description,authorName,viewCount,likeCount,published,lengthSeconds,transcript`);
      
      if (!res.ok) return `YouTube API error: ${res.status}`;
      
      const data: any = await res.json();
      
      let output = `🎬 **${data.title}**\n`;
      output += `👤 ${data.authorName || "Unknown"}\n`;
      if (data.lengthSeconds) {
        const mins = Math.floor(data.lengthSeconds / 60);
        const secs = data.lengthSeconds % 60;
        output += `⏱ ${mins}:${secs.toString().padStart(2, "0")} | `;
      }
      if (data.viewCount) output += `👁 ${Number(data.viewCount).toLocaleString()} views | `;
      if (data.likeCount) output += `👍 ${Number(data.likeCount).toLocaleString()} likes\n`;
      else output += "\n";
      if (data.description) output += `\n📝 ${data.description.slice(0, 500)}${data.description.length > 500 ? "..." : ""}`;
      
      if (data.transcript && Array.isArray(data.transcript) && data.transcript.length > 0) {
        const transcript = data.transcript.map((t: any) => `[${Math.floor(t.start / 60)}:${String(Math.floor(t.start % 60)).padStart(2, "0")}] ${t.text}`).join(" ");
        output += `\n\n📜 **Transcript (first 2000 chars):**\n${transcript.slice(0, 2000)}`;
      }
      
      return output;
    } catch (err: any) {
      return `yt_fetch failed: ${err.message}`;
    }
  },
} as Skill;
