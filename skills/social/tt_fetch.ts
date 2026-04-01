import type { Skill } from "../../src/types.ts";

export default {
  name: "tt_fetch",
  description: "Fetch TikTok video metadata, description, and audio info. Usage: tt_fetch <url_or_video_id>",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    let input = String(args.action || args.args || "").trim();
    if (!input) return "Usage: tt_fetch <tiktok_url_or_video_id>\n\nExample: tt_fetch https://www.tiktok.com/@user/video/1234567890";

    // Extract video ID
    let videoId = "";
    const ttMatch = input.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (ttMatch) {
      videoId = ttMatch[1];
    } else if (/^\d{17,19}$/.test(input)) {
      videoId = input;
    } else if (/^\d+$/.test(input)) {
      videoId = input;
    } else {
      return "Invalid TikTok URL or video ID. Use a tiktok.com URL or numeric video ID.";
    }

    try {
      // Try vxtiktok first (no watermark variant)
      let data: any = null;
      
      const vxtUrl = `https://vxtiktok.com/tiktok/@video/${videoId}`;
      const res = await fetch(vxtUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();
      
      // Extract JSON from og:description or script tags
      const ogMatch = html.match(/og:description" content="([^"]+)"/);
      const descMatch = ogMatch ? ogMatch[1] : null;
      
      // Try to find author and stats from HTML
      const authorMatch = html.match(/"author":"([^"]+)"/);
      const statsMatch = html.match(/"playCount":(\d+)/);
      const likesMatch = html.match(/"diggCount":(\d+)/);
      
      if (!descMatch && !authorMatch) {
        // Fallback: try no watermark API
        const nwmUrl = `https://www.nowatermark.pro/api/tiktok?url=https://www.tiktok.com/@video/${videoId}`;
        const nwmRes = await fetch(nwmUrl);
        if (nwmRes.ok) {
          const nwmData: any = await nwmRes.json();
          if (nwmData.status && nwmData.data) {
            data = {
              description: nwmData.data.title || nwmData.data.desc || "",
              author: nwmData.data.author?.name || nwmData.data.author_name || "Unknown",
              views: nwmData.data.play_count || nwmData.data.views || 0,
              likes: nwmData.data.likes || 0,
              shares: nwmData.data.shares || 0,
              comments: nwmData.data.comments || 0,
              duration: nwmData.data.duration || 0,
              music: nwmData.data.music?.title || nwmData.data.music_title || "",
              music_author: nwmData.data.music?.author || nwmData.data.music_author || "",
            };
          }
        }
      }
      
      if (!data && (descMatch || authorMatch)) {
        data = {
          description: descMatch || "",
          author: authorMatch ? authorMatch[1].replace(/\\u[\da-f]{4}/gi, (m: string) => String.fromCodePoint(parseInt(m.slice(2), 16))) : "Unknown",
          views: statsMatch ? parseInt(statsMatch[1]) : 0,
          likes: likesMatch ? parseInt(likesMatch[1]) : 0,
        };
      }
      
      if (!data || (!data.description && !data.author)) {
        // Final fallback: try official TikTok oembed
        const oembedUrl = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@video/${videoId}`;
        const oembedRes = await fetch(oembedUrl);
        if (oembedRes.ok) {
          const oembed: any = await oembedRes.json();
          if (oembed.html) {
            const titleMatch = oembed.html.match(/title="([^"]+)"/);
            return `🎵 **TikTok**\n\n${titleMatch ? titleMatch[1] : "TikTok video"}\n👤 @${oembed.author_name || "unknown"}\n🔗 https://www.tiktok.com/@video/${videoId}\n\nℹ️ Full metadata unavailable (TikTok restricts API access). Open in app for full content.`;
          }
        }
        return `❌ Could not fetch TikTok video #${videoId}. TikTok actively blocks automated access.\n\nTry providing the video ID from the URL: tiktok.com/@user/video/{ID}`;
      }

      let output = `🎵 **TikTok**\n`;
      output += `👤 @${data.author || "Unknown"}\n`;
      if (data.description) output += `\n📝 ${data.description.slice(0, 500)}${data.description.length > 500 ? "..." : ""}\n`;
      if (data.views) output += `\n👁 ${Number(data.views).toLocaleString()} views`;
      if (data.likes) output += ` | 👍 ${Number(data.likes).toLocaleString()} likes`;
      if (data.shares) output += ` | ↗️ ${Number(data.shares).toLocaleString()} shares`;
      if (data.comments) output += ` | 💬 ${Number(data.comments).toLocaleString()} comments`;
      if (data.music || data.music_title) output += `\n🎧 ${data.music || data.music_title}${data.music_author ? ` by ${data.music_author}` : ""}`;
      if (data.duration) {
        const mins = Math.floor(data.duration / 60);
        const secs = data.duration % 60;
        output += `\n⏱ ${mins}:${secs.toString().padStart(2, "0")}`;
      }
      output += `\n\n🔗 https://www.tiktok.com/@video/${videoId}`;
      
      return output;
    } catch (err: any) {
      return `tt_fetch failed: ${err.message}`;
    }
  },
} as Skill;
