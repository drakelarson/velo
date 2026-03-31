/**
 * Model Pricing Configuration
 * 
 * Users can override these in velo.toml:
 * 
 * [pricing.overrides]
 * "openai:gpt-4o-mini" = { input = 0.15, output = 0.60 }
 * "custom:model" = { input = 1.0, output = 2.0 }
 */

export interface ModelPricing {
  input: number;  // USD per 1M tokens
  output: number; // USD per 1M tokens
  context?: number; // Max context window
  provider?: string;
}

// Default pricing for popular models (2026 rates)
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // NVIDIA NIM (via StepFun)
  "nvidia:stepfun-ai/step-3.5-flash": {
    input: 0.10,
    output: 0.30,
    context: 256000,
    provider: "nvidia",
  },
  "nvidia:stepfun-ai/step-3": {
    input: 0.57,
    output: 1.42,
    context: 256000,
    provider: "nvidia",
  },
  
  // OpenAI
  "openai:gpt-4o": {
    input: 2.50,
    output: 10.00,
    context: 128000,
    provider: "openai",
  },
  "openai:gpt-4o-mini": {
    input: 0.15,
    output: 0.60,
    context: 128000,
    provider: "openai",
  },
  "openai:gpt-4-turbo": {
    input: 10.00,
    output: 30.00,
    context: 128000,
    provider: "openai",
  },
  "openai:o1-preview": {
    input: 15.00,
    output: 60.00,
    context: 128000,
    provider: "openai",
  },
  "openai:o1-mini": {
    input: 3.00,
    output: 12.00,
    context: 128000,
    provider: "openai",
  },
  
  // Anthropic
  "anthropic:claude-3.5-sonnet": {
    input: 3.00,
    output: 15.00,
    context: 200000,
    provider: "anthropic",
  },
  "anthropic:claude-3.5-sonnet-20241022": {
    input: 3.00,
    output: 15.00,
    context: 200000,
    provider: "anthropic",
  },
  "anthropic:claude-3-haiku": {
    input: 0.25,
    output: 1.25,
    context: 200000,
    provider: "anthropic",
  },
  "anthropic:claude-3-opus": {
    input: 15.00,
    output: 75.00,
    context: 200000,
    provider: "anthropic",
  },
  
  // MiniMax
  "minimax:minimax-m2.7": {
    input: 0.30,
    output: 1.20,
    context: 205000,
    provider: "minimax",
  },
  "minimax:minimax-m2.7-highspeed": {
    input: 0.30,
    output: 1.20,
    context: 205000,
    provider: "minimax",
  },
  "minimax:minimax-m2.5": {
    input: 0.30,
    output: 1.20,
    context: 128000,
    provider: "minimax",
  },
  
  // Google
  "google:gemini-2.0-flash": {
    input: 0.10,
    output: 0.40,
    context: 1000000,
    provider: "google",
  },
  "google:gemini-1.5-pro": {
    input: 1.25,
    output: 5.00,
    context: 2000000,
    provider: "google",
  },
  
  // OpenRouter (pass-through pricing, 5.5% fee)
  "openrouter:anthropic/claude-3.5-sonnet": {
    input: 3.17,  // 3.00 + 5.5%
    output: 15.83, // 15.00 + 5.5%
    context: 200000,
    provider: "openrouter",
  },
  "openrouter:openai/gpt-4o-mini": {
    input: 0.16,
    output: 0.63,
    context: 128000,
    provider: "openrouter",
  },
  
  // Ollama (local, free)
  "ollama:llama3.2": {
    input: 0,
    output: 0,
    context: 128000,
    provider: "ollama",
  },
  "ollama:qwen2.5": {
    input: 0,
    output: 0,
    context: 128000,
    provider: "ollama",
  },
};

// Get pricing for a model (with user overrides)
export function getModelPricing(
  modelKey: string,
  overrides?: Record<string, ModelPricing>
): ModelPricing {
  // Check overrides first
  if (overrides?.[modelKey]) {
    return overrides[modelKey];
  }
  
  // Check default pricing
  if (DEFAULT_PRICING[modelKey]) {
    return DEFAULT_PRICING[modelKey];
  }
  
  // Try partial match (e.g., "openai:gpt-4o-mini-2024-07-18" -> "openai:gpt-4o-mini")
  const [provider, ...modelParts] = modelKey.split(":");
  const modelBase = modelParts.join(":");
  
  for (const [key, pricing] of Object.entries(DEFAULT_PRICING)) {
    if (key.startsWith(`${provider}:`) && key.includes(modelBase.split("-").slice(0, 2).join("-"))) {
      return pricing;
    }
  }
  
  // Default fallback (moderate pricing)
  return {
    input: 1.00,
    output: 3.00,
    context: 128000,
    provider: provider || "unknown",
  };
}

// Calculate cost for token usage
export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  pricing: ModelPricing
): number {
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// Format cost for display
export function formatCost(cost: number): string {
  if (cost < 0.0001) {
    return `$${(cost * 1000000).toFixed(2)}μ`;
  } else if (cost < 0.01) {
    return `$${(cost * 1000).toFixed(4)}m`;
  } else if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  } else {
    return `$${cost.toFixed(2)}`;
  }
}

// Get all available models with pricing
export function getAvailableModels(): Array<{ key: string; pricing: ModelPricing }> {
  return Object.entries(DEFAULT_PRICING).map(([key, pricing]) => ({
    key,
    pricing,
  }));
}

// Compare models by cost for a typical use case
export function compareModelCosts(
  promptTokens: number = 1000,
  completionTokens: number = 500
): Array<{ key: string; cost: number; pricing: ModelPricing }> {
  return Object.entries(DEFAULT_PRICING)
    .map(([key, pricing]) => ({
      key,
      cost: calculateCost(promptTokens, completionTokens, pricing),
      pricing,
    }))
    .sort((a, b) => a.cost - b.cost);
}