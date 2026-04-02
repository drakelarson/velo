import type { Skill } from "../../src/types.ts";

const VISION_MODEL = "models/gemma-3-4b-it";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent";

export default {
  name: "vision_preprocessor",
  description:
    "Describe an image using Gemma-3-4b-it vision. Converts images to text descriptions so non-vision models can 'see'. Usage: vision_preprocessor <image_url_or_path>",

  async execute(args: Record<string, unknown>): Promise<string> {
    const input = String(args.action || args.args || "").trim();
    if (!input) {
      return "Usage: vision_preprocessor <image_url_or_path>\nExample: vision_preprocessor https://example.com/photo.jpg\nExample: vision_preprocessor ./photo.jpg";
    }

    let imageBuffer: ArrayBuffer | null = null;
    let mimeType = "image/jpeg";

    try {
      // Download image from URL or read from file
      if (input.startsWith("http://") || input.startsWith("https://")) {
        const res = await fetch(input, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          return `Failed to download image: HTTP ${res.status}`;
        }
        imageBuffer = await res.arrayBuffer();

        // Detect mime type from Content-Type header or URL extension
        const contentType = res.headers.get("content-type") || "";
        mimeType = mapMimeType(contentType, input);
      } else {
        // Local file
        const { readFileSync } = require("fs");
        if (!readFileSync) {
          const { readFileSync: rf } = require("fs");
          imageBuffer = rf(input);
        } else {
          imageBuffer = readFileSync(input);
        }
        mimeType = mapMimeType("", input);
      }

      if (!imageBuffer) return "Failed to read image data";

      // Convert to base64
      const base64 = Buffer.from(imageBuffer).toString("base64");

      // Get API key from env
      const apiKey = process.env.GOOGLE_API_KEY || process.env.AI_STUDIO_KEY;
      if (!apiKey) {
        return "vision_preprocessor: GOOGLE_API_KEY or AI_STUDIO_KEY not set in velo.env";
      }

      // Call Gemma-3-4b-it vision
      const payload = {
        contents: {
          parts: [
            {
              text: `You are a precise image describer. For any image provided, generate a concise, detailed description (2-5 sentences max) that captures:\n- What is in the image (main subject, setting)\n- Key visual details (colors, objects, text if any)\n- Any notable actions or emotions\n\nBe factual and observant. Do not guess or infer beyond what is visible. Respond with ONLY the description, nothing else.`,
            },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
        },
      };

      const apiRes = await fetch(`${API_BASE}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });

      if (!apiRes.ok) {
        const err = await apiRes.text();
        return `Vision API error ${apiRes.status}: ${err.slice(0, 200)}`;
      }

      const data = await apiRes.json();
      const description = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!description) {
        return `vision_preprocessor: No description returned. Response: ${JSON.stringify(data).slice(0, 200)}`;
      }

      return description;
    } catch (err: any) {
      return `vision_preprocessor failed: ${err.message}`;
    }
  },
} as Skill;

function mapMimeType(contentType: string, filename: string): string {
  if (contentType && contentType.includes("image/")) return contentType;
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  };
  return map[ext || ""] || "image/jpeg";
}
