import type { Skill } from "../../src/types.ts";
import { spawn } from "bun";
import * as fs from "fs";
import * as path from "path";

// Kokoro voices (much more natural than Piper)
const KOKORO_VOICES = {
  "bella": "af_bella",      // Female American
  "sarah": "af_sarah",      // Female American
  "nicole": "af_nicole",    // Female American
  "sky": "af_sky",          // Female American
  "adam": "am_adam",        // Male American
  "michael": "am_michael",  // Male American
  "emma": "bf_emma",        // Female British
  "isabella": "bf_isabella", // Female British
  "george": "bm_george",    // Male British
  "lewis": "bm_lewis",      // Male British
};

const DEFAULT_VOICE = "bella";

export default {
  name: "tts"
    category: "Media",,
  description: "Convert text to speech audio using Kokoro TTS (natural sounding). Returns audio file path. Use when user requests voice output or uses /voice command. Args: text (required), voice (optional: bella, sarah, adam, emma, george).",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const text = String(args.text || args.action || args.message || "");
    const voice = String(args.voice || args.speaker || DEFAULT_VOICE).toLowerCase();
    
    if (!text) {
      return `Text-to-Speech (Kokoro TTS)

Usage: tts text="Your message here" [voice="bella"]

Available Voices:
  bella (default) - Female American, natural and warm
  sarah - Female American, clear and professional
  nicole - Female American, friendly
  adam - Male American, deep voice
  michael - Male American, conversational
  emma - Female British, elegant
  george - Male British, authoritative

Examples:
  tts text="Hello, how can I help you today?"
  tts text="Greetings!" voice="adam"

Output: WAV audio file (returned as file path for Telegram)`;
    }
    
    try {
      // Generate output filename
      const outputDir = path.join(process.cwd(), "data", "tts");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const outputFile = path.join(outputDir, `tts_${timestamp}.wav`);
      
      // Get Kokoro voice ID
      const voiceId = KOKORO_VOICES[voice as keyof typeof KOKORO_VOICES] || KOKORO_VOICES.bella;
      
      // Create Python script for Kokoro
      const scriptPath = path.join(outputDir, `generate_${timestamp}.py`);
      const script = `#!/usr/bin/env python3
from kokoro import KPipeline
import soundfile as sf

pipeline = KPipeline(lang_code='a')
generator = pipeline("${text.replace(/"/g, '\\"')}", voice='${voiceId}')

for i, (gs, ps, audio) in enumerate(generator):
    sf.write('${outputFile}', audio, 24000)
    break
`;
      fs.writeFileSync(scriptPath, script);
      
      // Run Kokoro
      const result = spawn({
        cmd: ["python3", scriptPath],
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
      });
      
      await result.exited;
      
      // Cleanup script
      try { fs.unlinkSync(scriptPath); } catch {}
      
      if (result.exitCode !== 0) {
        const stderr = await result.stderr.text();
        // Check if it's just a warning
        if (stderr.includes("Saved:") || fs.existsSync(outputFile)) {
          // It worked despite warnings
        } else {
          return `TTS failed: ${stderr.slice(0, 300)}`;
        }
      }
      
      if (!fs.existsSync(outputFile)) {
        return "TTS failed: No output file generated";
      }
      
      const stats = fs.statSync(outputFile);
      
      return `✓ Audio generated: ${outputFile}
Size: ${(stats.size / 1024).toFixed(1)} KB
Voice: ${voice} (${voiceId})
Text: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"

AUDIO_FILE:${outputFile}`;
      
    } catch (err: any) {
      console.error("[TTS] Error:", err);
      return `Error: ${err.message}`;
    }
  },
} as Skill;