import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Brain } from "./brain.ts";

export interface Persona {
  name: string;
  tone: string;
  traits: string[];
  response_style: string;
  example_phrases: string[];
  forbidden: string[];
  system_hint: string;
}

export interface PersonaWithRaw extends Persona {
  raw: string;
}

const PERSONA_DIR = path.join(os.homedir(), ".velo", "personas");

function ensurePersonaDir(): void {
  if (!fs.existsSync(PERSONA_DIR)) {
    fs.mkdirSync(PERSONA_DIR, { recursive: true });
  }
}

function getPersonaPath(name: string): string {
  return path.join(PERSONA_DIR, `${name.toLowerCase().replace(/\s+/g, "-")}.toml`);
}

export function listPersonas(): string[] {
  ensurePersonaDir();
  const files = fs.readdirSync(PERSONA_DIR).filter(f => f.endsWith(".toml"));
  return files.map(f => f.replace(/\.toml$/, "").replace(/-/g, " "));
}

export function loadPersona(name: string): Persona | null {
  const filePath = getPersonaPath(name);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  return parsePersonaToml(content);
}

export function savePersona(name: string, persona: Persona): void {
  ensurePersonaDir();
  const filePath = getPersonaPath(name);
  const toml = personaToToml(name, persona);
  fs.writeFileSync(filePath, toml, "utf-8");
}

export function deletePersona(name: string): boolean {
  const filePath = getPersonaPath(name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export function getActivePersonaName(config: { agent: { persona?: string } }): string {
  return config.agent?.persona || "default";
}

export function buildSystemPromptFromPersona(persona: Persona, basePrompt: string): string {
  const parts = basePrompt.split("Known facts");

  const personaSection = `
## Your Personality

**Name:** ${persona.name}
**Tone:** ${persona.tone}
**Traits:** ${persona.traits.join(", ")}

**Response Style:** ${persona.response_style}

**You commonly say things like:**
${persona.example_phrases.map(p => `- "${p}"`).join("\n")}

**Never:**
${persona.forbidden.map(f => `- ${f}`).join("\n")}

${persona.system_hint ? `**System Guidance:** ${persona.system_hint}` : ""}
`;

  return `${parts[0]}${personaSection}\nKnown facts${parts.slice(1).join("Known facts")}`;
}

export function generatePersonaFromNaturalLanguage(
  description: string,
  brain: Brain
): Promise<{ persona: Persona; confirmation: string }> {
  return new Promise(async (resolve, reject) => {
    const prompt = `The user wants to create a persona/character for an AI assistant. 
Generate a detailed persona based on their description.

User's description: "${description}"

Respond EXACTLY in this JSON format (no extra text, no markdown):
{
  "name": "Short memorable name (1-2 words)",
  "tone": "2-4 adjective description of tone",
  "traits": ["trait1", "trait2", "trait3", "trait4", "trait5"],
  "response_style": "2-3 sentences describing HOW they communicate (sentence length, formality, etc)",
  "example_phrases": ["phrase1", "phrase2", "phrase3", "phrase4"],
  "forbidden": ["thing persona never does1", "thing persona never does2", "thing persona never does3"],
  "system_hint": "1 sentence of core guidance for the persona"
}

Make it specific and memorable. Avoid generic AI assistant traits. Give this persona a distinct voice.`;

    try {
      const result = await brain.think(
        [{ role: "user", content: prompt }],
        "You are a creative persona designer. Return valid JSON only.",
        undefined
      );

      const content = result.content.trim();
      let jsonStr = content;

      // Strip markdown code blocks if present
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json\n?/i, "").replace(/```\n?$/, "");
      }

      const parsed = JSON.parse(jsonStr);

      const persona: Persona = {
        name: parsed.name || "Assistant",
        tone: parsed.tone || "Helpful",
        traits: Array.isArray(parsed.traits) ? parsed.traits : [],
        response_style: parsed.response_style || "Clear and helpful.",
        example_phrases: Array.isArray(parsed.example_phrases) ? parsed.example_phrases : [],
        forbidden: Array.isArray(parsed.forbidden) ? parsed.forbidden : [],
        system_hint: parsed.system_hint || "",
      };

      const confirmation = `📋 **Persona Generated: ${persona.name}**

**Tone:** ${persona.tone}
**Traits:** ${persona.traits.join(", ")}

**Style:** ${persona.response_style}

**Example phrases:**
${persona.example_phrases.map(p => `  "${p}"`).join("\n")}

**Forbidden:**
${persona.forbidden.map(f => `  - ${f}`).join("\n")}

${persona.system_hint ? `**Guidance:** ${persona.system_hint}` : ""}

---

Say "save" to store this persona, or describe what you'd like to change.`;

      resolve({ persona, confirmation });
    } catch (err: any) {
      reject(new Error(`Failed to generate persona: ${err.message}`));
    }
  });
}

export function refinePersonaFromFeedback(
  current: Persona,
  feedback: string,
  brain: Brain
): Promise<{ persona: Persona; confirmation: string }> {
  return new Promise(async (resolve, reject) => {
    const prompt = `A user is refining a persona based on feedback. 

Current persona:
${JSON.stringify(current, null, 2)}

User's feedback: "${feedback}"

Respond EXACTLY in this JSON format (no extra text, no markdown):
{
  "name": "Short memorable name (1-2 words, can keep same)",
  "tone": "2-4 adjective description of tone",
  "traits": ["trait1", "trait2", "trait3", "trait4", "trait5"],
  "response_style": "2-3 sentences describing HOW they communicate",
  "example_phrases": ["phrase1", "phrase2", "phrase3", "phrase4"],
  "forbidden": ["thing persona never does1", "thing persona never does2", "thing persona never does3"],
  "system_hint": "1 sentence of core guidance for the persona"
}

Make changes based on feedback while keeping what works.`;

    try {
      const result = await brain.think(
        [{ role: "user", content: prompt }],
        "You are a creative persona designer. Return valid JSON only.",
        undefined
      );

      const content = result.content.trim();
      let jsonStr = content;

      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json\n?/i, "").replace(/```\n?$/, "");
      }

      const parsed = JSON.parse(jsonStr);

      const persona: Persona = {
        name: parsed.name || current.name,
        tone: parsed.tone || current.tone,
        traits: Array.isArray(parsed.traits) ? parsed.traits : current.traits,
        response_style: parsed.response_style || current.response_style,
        example_phrases: Array.isArray(parsed.example_phrases) ? parsed.example_phrases : current.example_phrases,
        forbidden: Array.isArray(parsed.forbidden) ? parsed.forbidden : current.forbidden,
        system_hint: parsed.system_hint || current.system_hint,
      };

      const confirmation = `📋 **Refined Persona: ${persona.name}**

**Tone:** ${persona.tone}
**Traits:** ${persona.traits.join(", ")}

**Style:** ${persona.response_style}

**Example phrases:**
${persona.example_phrases.map(p => `  "${p}"`).join("\n")}

**Forbidden:**
${persona.forbidden.map(f => `  - ${f}`).join("\n")}

${persona.system_hint ? `**Guidance:** ${persona.system_hint}` : ""}

---

Say "save" to store, or describe more changes.`;

      resolve({ persona, confirmation });
    } catch (err: any) {
      reject(new Error(`Failed to refine persona: ${err.message}`));
    }
  });
}

// TOML parsing for persona files
function parsePersonaToml(content: string): Persona {
  const persona: any = {
    name: "Assistant",
    tone: "",
    traits: [],
    response_style: "",
    example_phrases: [],
    forbidden: [],
    system_hint: "",
  };

  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[")) {
      currentSection = trimmed.replace(/[\[\]]/g, "");
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      let value: any = rawValue.trim();

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("[") && value.endsWith("]")) {
        const inner = value.slice(1, -1);
        value = inner.split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      }

      (persona as any)[key] = value;
    }
  }

  return persona as Persona;
}

function personaToToml(name: string, persona: Persona): string {
  return `# Persona: ${persona.name}
# Generated by Velo

name = "${persona.name}"
tone = "${persona.tone}"
traits = [${persona.traits.map(t => `"${t}"`).join(", ")}]
response_style = """${persona.response_style}"""
example_phrases = [${persona.example_phrases.map(p => `"${p}"`).join(", ")}]
forbidden = [${persona.forbidden.map(f => `"${f}"`).join(", ")}]
system_hint = """${persona.system_hint}"""
`;
}

export { PERSONA_DIR };
