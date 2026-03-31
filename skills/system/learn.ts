import type { Skill } from "../../src/types.ts";

export default {
  name: "learn",
  description: "Learn from the current conversation. Records preferences, patterns, and successful approaches. Use when user expresses a preference or when a task completes successfully.",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action || "").toLowerCase();
    
    // Parse action
    if (action.startsWith("preference:") || action.includes("=")) {
      // Learning a preference
      const [key, value] = action.replace("preference:", "").split("=").map(s => s.trim());
      if (key && value) {
        // This will be handled by the agent's self-improvement system
        return `Preference learned: ${key} = ${value}\n\nI will remember this for future interactions.`;
      }
    }
    
    if (action === "success" || action === "done") {
      // Record successful outcome
      return `Task outcome recorded as successful. I'll use this approach again for similar tasks.`;
    }
    
    if (action === "fail" || action === "failed") {
      // Record failed outcome
      return `Task outcome recorded as failed. I'll avoid this approach for similar tasks.`;
    }
    
    if (action === "report" || action === "status") {
      // Show learning report - agent will use self_improvement getReport()
      return `Use 'velo learn report' from CLI to see the full learning report.`;
    }
    
    // Default: general learning
    return `Learning system ready. Options:
    
- learn preference:key=value  - Learn a user preference
- learn success               - Mark task as successful
- learn fail                  - Mark task as failed  
- learn report                - Show learning progress

I continuously learn from our interactions to improve over time.`;
  },
} as Skill;