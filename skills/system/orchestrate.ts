import type { Skill } from "../../src/types.ts";

export default {
  name: "orchestrate"
    category: "System",,
  description: "Orchestrate multiple specialized agents to work together. Use for complex tasks requiring coordination. Usage: orchestrate workflow=\"research_report\" task=\"your task\". Available workflows: research_report, code_feature, parallel_analysis, consensus_decision, debate, review_loop",
  
  async execute(args: Record<string, unknown>): Promise<string> {
    const workflow = String(args.workflow || args.action || "");
    const task = String(args.task || args.input || "");
    
    if (!workflow || workflow === "help") {
      return `Multi-Agent Orchestration

Usage: orchestrate workflow="<workflow>" task="<your task>"

Available Workflows:
  • research_report - Researcher → Writer → Reviewer
  • code_feature - Researcher → Coder → Reviewer  
  • parallel_analysis - Multiple agents analyze in parallel
  • consensus_decision - All agents vote on best solution
  • debate - Two agents debate, Coordinator decides
  • review_loop - Create, review, iterate until approved

Example:
  orchestrate workflow="research_report" task="Research AI trends in 2026"
  orchestrate workflow="code_feature" task="Build a REST API for user management"

Agent Roles Available:
  Coordinator, Researcher, Writer, Coder, Reviewer, Analyst
`;
    }

    if (!task) {
      return "Error: No task provided. Usage: orchestrate workflow=\"<workflow>\" task=\"<your task>\"";
    }

    try {
      const { Orchestrator } = await import("../../src/orchestration.ts");
      const orchestrator = new Orchestrator();
      
      const result = await orchestrator.runWorkflow(workflow as any, task);
      
      let output = `🤖 Orchestration Complete\n\n`;
      output += `Workflow: ${workflow}\n`;
      output += `Steps: ${result.steps.length}\n`;
      output += `Duration: ${result.duration}ms\n\n`;
      
      for (const step of result.steps) {
        output += `**${step.role}**:\n${step.result?.slice(0, 500) || step.error || "No output"}\n\n`;
      }
      
      if (result.finalOutput) {
        output += `**Final Output**:\n${result.finalOutput}`;
      }
      
      return output;
    } catch (err: any) {
      return `Orchestration error: ${err.message}`;
    }
  },
} as Skill;