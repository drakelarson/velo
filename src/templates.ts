/**
 * Prompt Templates System
 * Reusable, typed prompt templates with variable interpolation
 */

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: "system" | "user" | "reasoning" | "task";
  template: string;
  variables: string[];
  examples?: string[];
}

// Built-in prompt templates
export const BUILTIN_TEMPLATES: PromptTemplate[] = [
  // System prompts
  {
    id: "assistant",
    name: "General Assistant",
    description: "Helpful AI assistant with concise responses",
    category: "system",
    template: `You are {{name}}, a helpful AI assistant.

Known facts about the user:
{{facts}}

Personality: {{personality}}

Instructions:
- Be concise and direct
- Use tools when appropriate
- Ask clarifying questions when needed`,
    variables: ["name", "facts", "personality"],
    examples: ["velo template apply assistant --name Velo --facts 'user likes Python' --personality 'friendly'"]
  },
  {
    id: "coder",
    name: "Coding Assistant",
    description: "Expert programmer focused on clean, efficient code",
    category: "system",
    template: `You are {{name}}, an expert software engineer.

Specializations: {{languages}}
Code style: {{style}}

Guidelines:
- Write clean, well-documented code
- Explain complex logic with comments
- Suggest optimizations when relevant
- Follow {{style}} conventions`,
    variables: ["name", "languages", "style"],
    examples: ["velo template apply coder --name CodeBot --languages 'Python, TypeScript, Rust' --style 'Google'"]
  },
  {
    id: "researcher",
    name: "Research Agent",
    description: "Thorough researcher with fact-checking",
    category: "system",
    template: `You are {{name}}, a meticulous research assistant.

Focus areas: {{domains}}

Research process:
1. Gather comprehensive information
2. Verify facts from multiple sources
3. Cite sources when possible
4. Synthesize findings clearly

Output format:
- Key findings first
- Supporting evidence
- Confidence levels for claims`,
    variables: ["name", "domains"],
  },
  
  // Reasoning strategies
  {
    id: "react",
    name: "ReAct Prompting",
    description: "Reasoning + Acting for step-by-step problem solving",
    category: "reasoning",
    template: `For each step:
1. **Thought**: Analyze what's needed
2. **Action**: Use appropriate tool
3. **Observation**: Process result

Question: {{question}}

Let's work through this systematically.`,
    variables: ["question"],
    examples: ["velo template apply react --question 'What is the capital of France?'"]
  },
  {
    id: "cot",
    name: "Chain of Thought",
    description: "Explicit step-by-step reasoning",
    category: "reasoning",
    template: `Let's think through this step by step.

{{problem}}

Step 1: Let me understand what we're trying to solve...
Step 2: Breaking this down into parts...
Step 3: Working through each part...
Step 4: Combining results...
Final answer: ...`,
    variables: ["problem"],
  },
  {
    id: "tree-of-thought",
    name: "Tree of Thought",
    description: "Explore multiple reasoning paths",
    category: "reasoning",
    template: `Problem: {{problem}}

Let me explore multiple approaches:

**Approach A:**
- Hypothesis: ...
- Reasoning: ...
- Pros: ...
- Cons: ...

**Approach B:**
- Hypothesis: ...
- Reasoning: ...
- Pros: ...
- Cons: ...

**Approach C:**
- Hypothesis: ...
- Reasoning: ...
- Pros: ...
- Cons: ...

**Best Approach:** Based on analysis, I'll proceed with...`,
    variables: ["problem"],
  },
  {
    id: "reflexion",
    name: "Reflexion",
    description: "Self-reflection and improvement",
    category: "reasoning",
    template: `Task: {{task}}

**First Attempt:**
[Your initial response]

**Reflection:**
- What worked well?
- What could be improved?
- Any errors or oversights?

**Improved Response:**
[Refined response based on reflection]`,
    variables: ["task"],
  },
  
  // Task templates
  {
    id: "summarize",
    name: "Document Summarizer",
    description: "Create concise summaries",
    category: "task",
    template: `Summarize the following text in {{style}} style.

Text:
{{text}}

Requirements:
- Length: ~{{length}} words
- Format: {{format}}
- Focus on: {{focus}}`,
    variables: ["text", "style", "length", "format", "focus"],
    examples: ["velo template apply summarize --text file:article.txt --style bullet --length 200"]
  },
  {
    id: "explain",
    name: "Concept Explainer",
    description: "Explain complex topics simply",
    category: "task",
    template: `Explain {{concept}} to a {{audience}}.

Include:
1. Simple definition
2. Real-world analogy
3. Key components
4. Common misconceptions
5. Practical examples

Context: {{context}}`,
    variables: ["concept", "audience", "context"],
  },
];

/**
 * Template Manager
 */
export class TemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private customDir: string;

  constructor(customDir?: string) {
    this.customDir = customDir || "./templates";
    
    // Load built-in templates
    for (const t of BUILTIN_TEMPLATES) {
      this.templates.set(t.id, t);
    }
    
    // Load custom templates (would scan customDir for .md files)
  }

  get(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  list(category?: string): PromptTemplate[] {
    const all = Array.from(this.templates.values());
    if (category) {
      return all.filter(t => t.category === category);
    }
    return all;
  }

  /**
   * Apply variables to a template
   */
  apply(templateId: string, vars: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let result = template.template;
    
    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(vars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(pattern, value);
    }
    
    // Check for unfilled variables
    const unfilled = result.match(/\{\{(\w+)\}\}/g);
    if (unfilled) {
      const vars = unfilled.map(m => m.slice(2, -2));
      throw new Error(`Missing variables: ${vars.join(", ")}`);
    }
    
    return result;
  }

  /**
   * Create a custom template
   */
  create(template: PromptTemplate): void {
    this.templates.set(template.id, template);
    // Would persist to customDir/{id}.md
  }
}