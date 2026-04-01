import type { Skill } from "../../src/types.ts";
import {
  listPersonas,
  loadPersona,
  savePersona,
  deletePersona,
  getActivePersonaName,
  buildSystemPromptFromPersona,
  generatePersonaFromNaturalLanguage,
  refinePersonaFromFeedback,
  type Persona,
} from "../../src/persona.ts";
import type { Brain } from "../../src/brain.ts";

// In-memory session state for persona creation flow
const creationSessions = new Map<
  string,
  { step: "description" | "review" | "refining"; persona?: Persona; brain?: Brain }
>();

export default {
  name: "persona",
  description:
    "Create, edit, and manage agent personas. Usage: persona <action> [args]. Actions: list, create, set, delete, preview, edit. When creating, describe the desired personality naturally and the system will generate a structured persona.",

  async execute(args: Record<string, unknown>, context?: { brain?: Brain; agent?: any }): Promise<string> {
    const action = String(args.action || args.args || "").trim();
    const parts = action.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const rest = parts.slice(1).join(" ");

    try {
      switch (cmd) {
        case "list":
        case "ls": {
          const personas = listPersonas();
          const active = getActivePersonaName(context?.agent?.config || {});
          if (personas.length === 0) {
            return `📋 No personas saved yet. Use 'persona create' to make one!`;
          }
          const list = personas
            .map((p) => (p === active ? `• ${p} (active)` : `  ${p}`))
            .join("\n");
          return `📋 Saved Personas:\n\n${list}\n\nUse 'persona set <name>' to switch.`;
        }

        case "create":
        case "new": {
          if (!context?.brain) {
            return "❌ Persona creation requires an active agent session.";
          }
          if (rest) {
            // User provided description directly
            const { persona, confirmation } = await generatePersonaFromNaturalLanguage(
              rest,
              context.brain
            );
            creationSessions.set("telegram", {
              step: "review",
              persona,
              brain: context.brain,
            });
            return `${confirmation}\n\n**Say "save" to store, or describe what to change.**`;
          }
          return `🎨 **Persona Creator**

Describe your ideal assistant in plain English. For example:

• "a witty British mentor who uses dry humor"
• "friendly coding tutor who explains things with metaphors"
• "blunt no-nonsense productivity coach"

Just describe what you want and I'll generate a persona for you.`;
        }

        case "save": {
          const session = creationSessions.get("telegram");
          if (!session?.persona) {
            return "❌ No persona in progress to save. Use 'persona create <description>' first.";
          }
          const name = session.persona.name;
          savePersona(name, session.persona);
          creationSessions.delete("telegram");

          // Also update the active persona in config if agent is available
          if (context?.agent?.config) {
            context.agent.config.agent.persona = name;
          }

          return `✅ Persona "${name}" saved and activated! Start chatting to try it out.`;
        }

        case "set":
        case "activate": {
          if (!rest) {
            const active = getActivePersonaName(context?.agent?.config || {});
            return `Current persona: ${active}. Use 'persona set <name>' to switch.`;
          }
          const persona = loadPersona(rest);
          if (!persona) {
            return `❌ Persona "${rest}" not found. Use 'persona list' to see saved personas.`;
          }
          if (context?.agent?.config) {
            context.agent.config.agent.persona = persona.name;
          }
          return `✅ Switched to persona "${persona.name}". Start chatting to try it out!`;
        }

        case "preview": {
          if (!rest) {
            return "Usage: persona preview <name>";
          }
          const persona = loadPersona(rest);
          if (!persona) {
            return `❌ Persona "${rest}" not found.`;
          }
          return `🎭 **Persona: ${persona.name}**

**Tone:** ${persona.tone}
**Traits:** ${persona.traits.join(", ")}

**Style:** ${persona.response_style}

**Example phrases:**
${persona.example_phrases.map((p) => `  "${p}"`).join("\n")}

**Forbidden:**
${persona.forbidden.map((f) => `  - ${f}`).join("\n")}`;
        }

        case "delete":
        case "remove": {
          if (!rest) {
            return "Usage: persona delete <name>";
          }
          const deleted = deletePersona(rest);
          if (deleted) {
            return `✅ Deleted persona "${rest}".`;
          }
          return `❌ Persona "${rest}" not found.`;
        }

        case "edit": {
          if (!context?.brain) {
            return "❌ Persona editing requires an active agent session.";
          }
          const session = creationSessions.get("telegram");
          if (!session?.persona) {
            // Load existing persona to refine
            const active = getActivePersonaName(context?.agent?.config || {});
            const persona = loadPersona(active);
            if (!persona) {
              return "❌ No active persona to edit.";
            }
            creationSessions.set("telegram", { step: "refining", persona, brain: context.brain });
            return `✏️ **Editing: ${persona.name}**

What would you like to change? (e.g. "make it more formal", "add a catchphrase", "change tone to sarcastic")`;
          }
          // Already have a persona, refine it
          const { persona, confirmation } = await refinePersonaFromFeedback(
            session.persona,
            rest,
            context.brain
          );
          creationSessions.set("telegram", { step: "review", persona, brain: context.brain });
          return `${confirmation}\n\n**Say "save" to store, or describe what to change.**`;
        }

        case "abort":
        case "cancel": {
          creationSessions.delete("telegram");
          return "❌ Cancelled persona creation.";
        }

        default: {
          const active = getActivePersonaName(context?.agent?.config || {});
          return `🎭 **Persona Manager**

Active: ${active}

Commands:
  persona list              - Show all saved personas
  persona create <desc>     - Create new persona (e.g. "witty British mentor")
  persona set <name>        - Switch to a different persona
  persona preview <name>    - Preview a persona's details
  persona edit <feedback>   - Refine the current persona
  persona delete <name>     - Delete a persona

Example:
  persona create a sarcastic pirate who roams the digital seas
  persona create friendly coding tutor who explains with car metaphors`;
        }
      }
    } catch (err: any) {
      return `❌ Persona error: ${err.message}`;
    }
  },
} as Skill;
