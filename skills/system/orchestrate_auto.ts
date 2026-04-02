import type { Skill } from "../../src/types.ts";

export default {
  name: "orchestrate_auto"
    category: "System",,
  description: "Let AI automatically choose the best workflow and orchestrate multiple agents. Use for any complex multi-step task. Usage: orchestrate_auto task=\"your complex task\"",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const task = String(args.task || args.action || args.input || "");
    
    if (!task) {
      return "Error: No task provided. Usage: orchestrate_auto task=\"your complex task\"";
    }

    try {
      const { Orchestrator } = await import("../../src/orchestration.ts");
      const orchestrator = new Orchestrator();
      
      // Auto-plan the workflow
      const plan = await orchestrator.autoPlan(task);
      
      let output = `🤖 Auto-Orchestration Plan\n\n`;
      output += `Task: ${task}\n`;
      output += `Recommended Workflow: ${plan.recommendedWorkflow}\n`;
      output += `Reasoning: ${plan.reasoning}\n\n`;
      output += `Executing workflow...\n\n`;
      
      // Run the workflow
      const result = await orchestrator.runWorkflow(plan.recommendedWorkflow as any, task);
      
      output += `**Orchestration Complete**\n`;
      output += `Steps: ${result.steps.length}\n`;
      output += `Duration: ${result.duration}ms\n\n`;
      
      for (const step of result.steps) {
        output += `**${step.role}**:\n${step.result?.slice(0, 300) || "No output"}\n\n`;
      }
      
      if (result.finalOutput) {
        output += `**Final Output**:\n${result.finalOutput}`;
      }
      
      return output;
    } catch (err: any) {
      return `Auto-orchestration error: ${err.message}`;
    }
  },
} as Skill;