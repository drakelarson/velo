/**
 * Multi-Agent Orchestration System
 * Coordinates multiple specialized agents working together on complex tasks
 * 
 * Features:
 * - Specialized agent roles (Researcher, Writer, Coder, Reviewer, etc.)
 * - Workflow patterns (sequential, parallel, hierarchical, consensus)
 * - Inter-agent communication and handoffs
 * - Result aggregation and synthesis
 * - Declarative workflow definitions
 */

import { Agent } from "./agent.ts";
import { Memory } from "./memory.ts";
import type { Config, Skill, Message } from "./types.ts";

// ============================================
// Agent Roles
// ============================================

export interface AgentRole {
  name: string;
  description: string;
  systemPrompt: string;
  skills?: string[]; // Subset of skills this role can use
  priority?: number; // For task routing
}

// Predefined roles
export const BUILTIN_ROLES: Record<string, AgentRole> = {
  coordinator: {
    name: "Coordinator",
    description: "Orchestrates tasks, delegates to specialists, synthesizes results",
    systemPrompt: `You are the Coordinator agent. Your role is to:
- Analyze complex tasks and break them into subtasks
- Delegate subtasks to appropriate specialist agents
- Collect and synthesize results from specialists
- Ensure quality and coherence of final output
- Handle conflicts and ambiguities

Always think step-by-step and communicate clearly with your team.`,
    priority: 0,
  },
  
  researcher: {
    name: "Researcher",
    description: "Gathers information, searches web, analyzes data",
    systemPrompt: `You are the Researcher agent. Your role is to:
- Search for relevant information
- Analyze and summarize findings
- Provide accurate, well-sourced information
- Identify knowledge gaps

Be thorough but concise. Cite sources when possible.`,
    priority: 1,
  },
  
  writer: {
    name: "Writer",
    description: "Creates content, edits, and formats output",
    systemPrompt: `You are the Writer agent. Your role is to:
- Create clear, engaging content
- Edit and refine text
- Format output appropriately
- Adapt tone and style as needed

Focus on clarity, coherence, and readability.`,
    priority: 2,
  },
  
  coder: {
    name: "Coder",
    description: "Writes, reviews, and debugs code",
    systemPrompt: `You are the Coder agent. Your role is to:
- Write clean, efficient code
- Review code for bugs and improvements
- Debug issues systematically
- Follow best practices and conventions

Write production-ready code with appropriate error handling.`,
    priority: 3,
  },
  
  reviewer: {
    name: "Reviewer",
    description: "Quality assurance, validates outputs, catches errors",
    systemPrompt: `You are the Reviewer agent. Your role is to:
- Validate outputs from other agents
- Check for errors, inconsistencies, and omissions
- Suggest improvements
- Approve or request revisions

Be thorough but fair. Focus on substantive issues.`,
    priority: 4,
  },
  
  analyst: {
    name: "Analyst",
    description: "Analyzes data, generates insights, creates visualizations",
    systemPrompt: `You are the Analyst agent. Your role is to:
- Analyze data and patterns
- Generate actionable insights
- Create visualizations when helpful
- Explain findings clearly

Use appropriate statistical methods and visual representations.`,
    priority: 5,
  },
};

// ============================================
// Workflow Patterns
// ============================================

export type WorkflowPattern = 
  | "sequential"    // A → B → C → D
  | "parallel"      // A, B, C, D all at once
  | "hierarchical"  // Coordinator → Specialists → Aggregator
  | "consensus"     // Multiple agents vote/merge results
  | "pipeline"      // Data flows through stages
  | "map-reduce"    // Map tasks, reduce results
  | "debate"        // Agents debate, find best solution
  | "review-loop";  // Create → Review → Revise loop

export interface WorkflowStep {
  id: string;
  role: string;
  task: string;
  dependsOn?: string[]; // Step IDs this depends on
  timeout?: number;
  retryCount?: number;
}

export interface Workflow {
  name: string;
  description: string;
  pattern: WorkflowPattern;
  steps: WorkflowStep[];
  maxConcurrent?: number;
  timeout?: number;
  onConflict?: "majority" | "coordinator" | "retry";
}

// Predefined workflows
export const BUILTIN_WORKFLOWS: Record<string, Workflow> = {
  research_report: {
    name: "Research Report",
    description: "Research a topic, analyze findings, write a report",
    pattern: "pipeline",
    steps: [
      { id: "research", role: "researcher", task: "Research the topic thoroughly" },
      { id: "analyze", role: "analyst", task: "Analyze the research findings", dependsOn: ["research"] },
      { id: "write", role: "writer", task: "Write a comprehensive report", dependsOn: ["analyze"] },
      { id: "review", role: "reviewer", task: "Review the report for quality", dependsOn: ["write"] },
    ],
    maxConcurrent: 1,
  },
  
  code_feature: {
    name: "Code Feature",
    description: "Plan, implement, and review a new feature",
    pattern: "sequential",
    steps: [
      { id: "plan", role: "coordinator", task: "Plan the feature implementation" },
      { id: "implement", role: "coder", task: "Implement the feature", dependsOn: ["plan"] },
      { id: "review", role: "reviewer", task: "Review the implementation", dependsOn: ["implement"] },
      { id: "refine", role: "coder", task: "Apply review feedback", dependsOn: ["review"] },
    ],
  },
  
  parallel_analysis: {
    name: "Parallel Analysis",
    description: "Multiple agents analyze different aspects simultaneously",
    pattern: "parallel",
    steps: [
      { id: "tech", role: "analyst", task: "Analyze technical aspects" },
      { id: "market", role: "analyst", task: "Analyze market aspects" },
      { id: "risk", role: "analyst", task: "Analyze risk factors" },
    ],
    maxConcurrent: 3,
  },
  
  consensus_decision: {
    name: "Consensus Decision",
    description: "Multiple agents propose solutions, find consensus",
    pattern: "consensus",
    steps: [
      { id: "propose_a", role: "analyst", task: "Propose solution A" },
      { id: "propose_b", role: "analyst", task: "Propose solution B" },
      { id: "propose_c", role: "analyst", task: "Propose solution C" },
      { id: "decide", role: "coordinator", task: "Evaluate proposals and decide best approach", dependsOn: ["propose_a", "propose_b", "propose_c"] },
    ],
    maxConcurrent: 3,
    onConflict: "coordinator",
  },
  
  debate: {
    name: "Debate",
    description: "Agents debate to find the best solution",
    pattern: "debate",
    steps: [
      { id: "pro", role: "analyst", task: "Argue for the proposal" },
      { id: "con", role: "analyst", task: "Argue against the proposal" },
      { id: "synthesize", role: "coordinator", task: "Synthesize arguments and reach conclusion", dependsOn: ["pro", "con"] },
    ],
    maxConcurrent: 2,
  },
  
  review_loop: {
    name: "Review Loop",
    description: "Create, review, iterate until approved",
    pattern: "review-loop",
    steps: [
      { id: "create", role: "writer", task: "Create the initial draft" },
      { id: "review", role: "reviewer", task: "Review and provide feedback", dependsOn: ["create"] },
      { id: "revise", role: "writer", task: "Apply feedback", dependsOn: ["review"] },
    ],
    maxConcurrent: 1,
  },
};

// ============================================
// Orchestration Engine
// ============================================

export interface StepResult {
  stepId: string;
  role: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  error?: string;
  tokens?: { prompt: number; completion: number };
  duration?: number;
}

export interface OrchestrationResult {
  workflow: string;
  status: "completed" | "failed" | "partial";
  steps: StepResult[];
  finalOutput?: string;
  totalTokens?: { prompt: number; completion: number };
  totalDuration?: number;
  consensus?: Record<string, number>; // For consensus pattern
}

export class Orchestrator {
  private config: Config;
  private skills: Map<string, Skill>;
  private roles: Map<string, AgentRole> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private agentPool: Map<string, Agent> = new Map();
  private results: Map<string, StepResult> = new Map();
  
  constructor(config: Config, skills: Map<string, Skill>) {
    this.config = config;
    this.skills = skills;
    
    // Load built-in roles and workflows
    for (const [key, role] of Object.entries(BUILTIN_ROLES)) {
      this.roles.set(key, role);
    }
    for (const [key, workflow] of Object.entries(BUILTIN_WORKFLOWS)) {
      this.workflows.set(key, workflow);
    }
  }
  
  // Add custom role
  addRole(role: AgentRole): void {
    this.roles.set(role.name.toLowerCase(), role);
  }
  
  // Add custom workflow
  addWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.name.toLowerCase().replace(/\s+/g, "_"), workflow);
  }
  
  // Get available roles
  getRoles(): AgentRole[] {
    return Array.from(this.roles.values());
  }
  
  // Get available workflows
  getWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }
  
  // Create agent for a specific role
  private createAgent(roleKey: string): Agent {
    const role = this.roles.get(roleKey);
    if (!role) {
      throw new Error(`Unknown role: ${roleKey}`);
    }
    
    // Create agent with role-specific config
    const roleConfig = {
      ...this.config,
      agent: {
        ...this.config.agent,
        name: role.name,
        personality: role.systemPrompt,
      },
    };
    
    const agent = new Agent(roleConfig);
    
    // Register skills (optionally filtered by role)
    for (const [name, skill] of this.skills) {
      if (!role.skills || role.skills.length === 0 || role.skills.includes(name)) {
        agent.registerSkill(skill);
      }
    }
    
    return agent;
  }
  
  // Get or create agent from pool
  private getAgent(roleKey: string): Agent {
    if (!this.agentPool.has(roleKey)) {
      this.agentPool.set(roleKey, this.createAgent(roleKey));
    }
    return this.agentPool.get(roleKey)!;
  }
  
  // Execute a single step
  private async executeStep(
    step: WorkflowStep, 
    context: Record<string, string>
  ): Promise<StepResult> {
    const startTime = Date.now();
    const result: StepResult = {
      stepId: step.id,
      role: step.role,
      status: "running",
    };
    
    try {
      const agent = this.getAgent(step.role);
      agent.setSession(`orchestration_${step.id}`);
      
      // Build prompt with context from dependencies
      let prompt = step.task;
      if (step.dependsOn) {
        const depResults = step.dependsOn
          .map(depId => this.results.get(depId))
          .filter(r => r?.output);
        
        if (depResults.length > 0) {
          prompt += "\n\n--- Context from previous steps ---";
          for (const dep of depResults) {
            prompt += `\n\n[${dep!.role}]:\n${dep!.output?.slice(0, 2000)}`;
          }
        }
      }
      
      // Inject global context
      if (Object.keys(context).length > 0) {
        prompt += "\n\n--- Global Context ---";
        for (const [key, value] of Object.entries(context)) {
          prompt += `\n${key}: ${value}`;
        }
      }
      
      // Execute with timeout
      const timeout = step.timeout || 120000;
      const output = await Promise.race([
        agent.process(prompt),
        this.timeoutPromise(timeout, step.id),
      ]);
      
      result.output = output;
      result.status = "completed";
      result.duration = Date.now() - startTime;
      
    } catch (err: any) {
      result.status = "failed";
      result.error = err.message;
      result.duration = Date.now() - startTime;
    }
    
    this.results.set(step.id, result);
    return result;
  }
  
  private timeoutPromise(ms: number, stepId: string): Promise<string> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Step ${stepId} timed out after ${ms}ms`)), ms);
    });
  }
  
  // Determine which steps can run now
  private getReadySteps(workflow: Workflow): WorkflowStep[] {
    return workflow.steps.filter(step => {
      // Already processed?
      if (this.results.has(step.id)) return false;
      
      // All dependencies completed?
      if (step.dependsOn) {
        const deps = step.dependsOn.map(depId => this.results.get(depId));
        const allCompleted = deps.every(d => d?.status === "completed");
        const anyFailed = deps.some(d => d?.status === "failed");
        
        if (anyFailed) {
          // Mark this step as failed due to dependency
          this.results.set(step.id, {
            stepId: step.id,
            role: step.role,
            status: "failed",
            error: "Dependency failed",
          });
          return false;
        }
        
        return allCompleted;
      }
      
      return true;
    });
  }
  
  // Execute a workflow
  async execute(
    workflowKey: string, 
    input: string,
    context: Record<string, string> = {}
  ): Promise<OrchestrationResult> {
    const workflow = this.workflows.get(workflowKey);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${workflowKey}`);
    }
    
    // Reset state
    this.results.clear();
    const startTime = Date.now();
    
    // Add input to context
    context.input = input;
    
    // Execute based on pattern
    const maxConcurrent = workflow.maxConcurrent || 3;
    let iterations = 0;
    const maxIterations = 100; // Safety limit
    
    while (iterations < maxIterations) {
      iterations++;
      
      const readySteps = this.getReadySteps(workflow);
      
      if (readySteps.length === 0) {
        // Check if all done
        const allProcessed = workflow.steps.every(s => this.results.has(s.id));
        if (allProcessed) break;
        
        // Deadlock detection
        const pending = workflow.steps.filter(s => !this.results.has(s.id));
        console.error(`[Orchestrator] Deadlock detected. Pending: ${pending.map(s => s.id).join(", ")}`);
        break;
      }
      
      // Execute ready steps (respecting maxConcurrent)
      const batch = readySteps.slice(0, maxConcurrent);
      
      if (workflow.pattern === "sequential") {
        // Run one at a time
        for (const step of batch) {
          await this.executeStep(step, context);
        }
      } else {
        // Run in parallel
        await Promise.all(batch.map(step => this.executeStep(step, context)));
      }
    }
    
    // Aggregate results
    const steps = Array.from(this.results.values());
    const completed = steps.filter(s => s.status === "completed");
    const failed = steps.filter(s => s.status === "failed");
    
    // Determine final output
    let finalOutput: string | undefined;
    
    if (workflow.pattern === "consensus" && completed.length > 1) {
      // Find consensus
      finalOutput = await this.synthesizeConsensus(steps, context);
    } else if (workflow.pattern === "debate") {
      // Synthesize debate
      finalOutput = await this.synthesizeDebate(steps, context);
    } else {
      // Use last completed step's output
      const lastCompleted = completed[completed.length - 1];
      finalOutput = lastCompleted?.output;
    }
    
    // Clean up agents
    for (const agent of this.agentPool.values()) {
      agent.close();
    }
    this.agentPool.clear();
    
    return {
      workflow: workflow.name,
      status: failed.length > 0 
        ? (completed.length > 0 ? "partial" : "failed") 
        : "completed",
      steps,
      finalOutput,
      totalDuration: Date.now() - startTime,
    };
  }
  
  // Synthesize consensus from multiple proposals
  private async synthesizeConsensus(
    steps: StepResult[], 
    context: Record<string, string>
  ): Promise<string> {
    const proposals = steps
      .filter(s => s.status === "completed" && s.output)
      .map(s => `[${s.role}]: ${s.output}`);
    
    if (proposals.length === 0) {
      return "No proposals to synthesize";
    }
    
    // Use coordinator to synthesize
    const coordinator = this.getAgent("coordinator");
    coordinator.setSession("consensus_synthesis");
    
    const prompt = `Synthesize these proposals into a consensus decision:

${proposals.join("\n\n")}

Original task: ${context.input}

Provide a final decision that best addresses the task, incorporating the best elements from each proposal.`;

    return coordinator.process(prompt);
  }
  
  // Synthesize debate results
  private async synthesizeDebate(
    steps: StepResult[], 
    context: Record<string, string>
  ): Promise<string> {
    const arguments_ = steps
      .filter(s => s.status === "completed" && s.output)
      .map(s => `[${s.role}]: ${s.output}`);
    
    if (arguments_.length === 0) {
      return "No arguments to synthesize";
    }
    
    const coordinator = this.getAgent("coordinator");
    coordinator.setSession("debate_synthesis");
    
    const prompt = `Synthesize this debate and reach a conclusion:

${arguments_.join("\n\n")}

Original topic: ${context.input}

Provide a balanced conclusion that acknowledges valid points from all sides.`;

    return coordinator.process(prompt);
  }
  
  // Create ad-hoc workflow from a task
  async autoOrchestrate(task: string): Promise<OrchestrationResult> {
    // Use coordinator to plan the workflow
    const coordinator = this.createAgent("coordinator");
    coordinator.setSession("auto_orchestrate");
    
    const planningPrompt = `Analyze this task and determine the best approach:

Task: ${task}

Available agent roles:
${Array.from(this.roles.values()).map(r => `- ${r.name}: ${r.description}`).join("\n")}

Determine:
1. Which roles are needed?
2. What should each role do?
3. What order should they work in?
4. Should they work sequentially or in parallel?

Respond in this JSON format:
{
  "workflow": "sequential|parallel|hierarchical",
  "steps": [
    { "role": "rolename", "task": "what they should do" }
  ]
}`;

    const planJson = await coordinator.process(planningPrompt);
    coordinator.close();
    
    // Parse the plan
    let plan: { workflow: string; steps: Array<{ role: string; task: string }> };
    
    try {
      // Extract JSON from response
      const jsonMatch = planJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in plan");
      plan = JSON.parse(jsonMatch[0]);
    } catch (err) {
      // Fallback to simple workflow
      plan = {
        workflow: "sequential",
        steps: [
          { role: "researcher", task: "Research the task" },
          { role: "coordinator", task: "Complete the task based on research" },
        ],
      };
    }
    
    // Create workflow from plan
    const workflow: Workflow = {
      name: "Auto-generated",
      description: "Auto-generated workflow for: " + task.slice(0, 50),
      pattern: plan.workflow as WorkflowPattern,
      steps: plan.steps.map((s, i) => ({
        id: `step_${i}`,
        role: s.role.toLowerCase(),
        task: s.task,
        dependsOn: plan.workflow === "sequential" && i > 0 ? [`step_${i-1}`] : undefined,
      })),
      maxConcurrent: plan.workflow === "parallel" ? 3 : 1,
    };
    
    // Execute the generated workflow
    this.addWorkflow(workflow);
    return this.execute("auto-generated", task);
  }
}

// ============================================
// CLI Integration
// ============================================

export async function runOrchestrationCLI(
  config: Config, 
  skills: Map<string, Skill>,
  args: string[]
): Promise<void> {
  const orchestrator = new Orchestrator(config, skills);
  
  const subCmd = args[0];
  
  if (!subCmd || subCmd === "help") {
    console.log(`
🤖 Multi-Agent Orchestration

Commands:
  velo orchestrate list              List available workflows
  velo orchestrate roles             List available agent roles
  velo orchestrate run <workflow> <task>   Execute a workflow
  velo orchestrate auto <task>       Auto-generate and run workflow

Examples:
  velo orchestrate run research_report "AI trends in 2026"
  velo orchestrate run consensus_decision "Choose best framework"
  velo orchestrate auto "Build a REST API"

Available Workflows:
${orchestrator.getWorkflows().map(w => `  - ${w.name}: ${w.description}`).join("\n")}
`);
    return;
  }
  
  if (subCmd === "list") {
    console.log("\n📋 Available Workflows:\n");
    for (const w of orchestrator.getWorkflows()) {
      console.log(`  ${w.name}`);
      console.log(`    Pattern: ${w.pattern}`);
      console.log(`    Steps: ${w.steps.map(s => s.role).join(" → ")}`);
      console.log(`    ${w.description}\n`);
    }
    return;
  }
  
  if (subCmd === "roles") {
    console.log("\n👥 Available Agent Roles:\n");
    for (const r of orchestrator.getRoles()) {
      console.log(`  ${r.name}`);
      console.log(`    ${r.description}\n`);
    }
    return;
  }
  
  if (subCmd === "run") {
    const workflowKey = args[1]?.toLowerCase().replace(/\s+/g, "_");
    const task = args.slice(2).join(" ");
    
    if (!workflowKey || !task) {
      console.error("Usage: velo orchestrate run <workflow> <task>");
      process.exit(1);
    }
    
    console.log(`\n🎯 Executing workflow: ${workflowKey}`);
    console.log(`Task: ${task}\n`);
    
    const result = await orchestrator.execute(workflowKey, task);
    
    console.log("\n═════════ ORCHESTRATION RESULT ═════════\n");
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.totalDuration}ms\n`);
    
    for (const step of result.steps) {
      const icon = step.status === "completed" ? "✓" : "✗";
      console.log(`${icon} [${step.role}] ${step.stepId} (${step.duration}ms)`);
      if (step.output) {
        console.log(`  ${step.output.slice(0, 100)}...`);
      }
      if (step.error) {
        console.log(`  Error: ${step.error}`);
      }
    }
    
    if (result.finalOutput) {
      console.log("\n📄 Final Output:\n");
      console.log(result.finalOutput);
    }
    
    return;
  }
  
  if (subCmd === "auto") {
    const task = args.slice(1).join(" ");
    
    if (!task) {
      console.error("Usage: velo orchestrate auto <task>");
      process.exit(1);
    }
    
    console.log(`\n🤖 Auto-orchestrating task: ${task}\n`);
    
    const result = await orchestrator.autoOrchestrate(task);
    
    console.log("\n═════════ ORCHESTRATION RESULT ═════════\n");
    console.log(`Generated Workflow: ${result.workflow}`);
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.totalDuration}ms\n`);
    
    for (const step of result.steps) {
      const icon = step.status === "completed" ? "✓" : "✗";
      console.log(`${icon} [${step.role}] ${step.stepId}`);
    }
    
    if (result.finalOutput) {
      console.log("\n📄 Final Output:\n");
      console.log(result.finalOutput);
    }
    
    return;
  }
  
  console.error(`Unknown orchestrate command: ${subCmd}`);
  console.error("Run 'velo orchestrate help' for usage");
}