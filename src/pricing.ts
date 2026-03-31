/**
 * Model Pricing Configuration (March 2026)
 * 
 * All pricing is per 1 million tokens (1M tokens)
 * 
 * Users can override in velo.toml:
 * [pricing.overrides]
 * "openai:gpt-5.4" = { input = 2.50, output = 15.00 }
 */

export interface ModelPricing {
  input: number;    // USD per 1M tokens
  output: number;   // USD per 1M tokens
  context?: number; // Max context window
  provider?: string;
  category?: "flagship" | "standard" | "budget" | "local" | "open-source";
}

// Actual March 2026 pricing for all major models
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // ============================================
  // LOCAL MODELS (FREE)
  // ============================================
  "ollama:llama3.2": {
    input: 0, output: 0, context: 128000, provider: "ollama", category: "local"
  },
  "ollama:llama4-scout": {
    input: 0, output: 0, context: 10000000, provider: "ollama", category: "local"
  },
  "ollama:llama4-maverick": {
    input: 0, output: 0, context: 1000000, provider: "ollama", category: "local"
  },
  "ollama:qwen2.5": {
    input: 0, output: 0, context: 128000, provider: "ollama", category: "local"
  },
  "ollama:deepseek-v3": {
    input: 0, output: 0, context: 164000, provider: "ollama", category: "local"
  },
  
  // ============================================
  // BUDGET MODELS (< $1/M tokens)
  // ============================================
  
  // NVIDIA NIM / StepFun
  "nvidia:stepfun-ai/step-3.5-flash": {
    input: 0.10, output: 0.30, context: 256000, provider: "nvidia", category: "budget"
  },
  
  // Google Gemini
  "google:gemini-3.1-flash-lite": {
    input: 0.10, output: 0.40, context: 1000000, provider: "google", category: "budget"
  },
  "google:gemini-2.0-flash": {
    input: 0.10, output: 0.40, context: 1000000, provider: "google", category: "budget"
  },
  
  // xAI Grok
  "xai:grok-4.1-fast": {
    input: 0.20, output: 0.50, context: 2000000, provider: "xai", category: "budget"
  },
  
  // OpenAI GPT-5 mini/nano
  "openai:gpt-5.4-mini": {
    input: 0.75, output: 3.00, context: 128000, provider: "openai", category: "budget"
  },
  "openai:gpt-5.4-nano": {
    input: 0.20, output: 0.80, context: 128000, provider: "openai", category: "budget"
  },
  
  // MiniMax
  "minimax:minimax-m2.7": {
    input: 0.30, output: 1.20, context: 205000, provider: "minimax", category: "budget"
  },
  
  // DeepSeek (open-source API)
  "deepseek:deepseek-v3.2": {
    input: 0.27, output: 1.10, context: 164000, provider: "deepseek", category: "open-source"
  },
  "deepseek:deepseek-r1": {
    input: 0.55, output: 2.19, context: 164000, provider: "deepseek", category: "open-source"
  },
  
  // Meta Llama 4 (open-source API)
  "meta:llama-4-scout": {
    input: 0.08, output: 0.30, context: 10000000, provider: "meta", category: "open-source"
  },
  "meta:llama-4-maverick": {
    input: 0.15, output: 0.60, context: 1000000, provider: "meta", category: "open-source"
  },
  
  // Kimi (Moonshot)
  "moonshot:kimi-k2.5": {
    input: 0.60, output: 2.50, context: 262144, provider: "moonshot", category: "open-source"
  },
  
  // GLM
  "zhipu:glm-5": {
    input: 1.00, output: 3.20, context: 203000, provider: "zhipu", category: "open-source"
  },
  
  // ============================================
  // STANDARD MODELS ($1-5/M tokens)
  // ============================================
  
  // OpenAI GPT-5
  "openai:gpt-5.2": {
    input: 1.75, output: 14.00, context: 400000, provider: "openai", category: "standard"
  },
  "openai:gpt-5.4": {
    input: 2.50, output: 15.00, context: 1050000, provider: "openai", category: "standard"
  },
  
  // Google Gemini
  "google:gemini-3.1-pro": {
    input: 2.00, output: 12.00, context: 1000000, provider: "google", category: "standard"
  },
  
  // xAI Grok
  "xai:grok-4.20": {
    input: 2.00, output: 6.00, context: 2000000, provider: "xai", category: "standard"
  },
  
  // Anthropic Claude
  "anthropic:claude-sonnet-4.6": {
    input: 3.00, output: 15.00, context: 200000, provider: "anthropic", category: "standard"
  },
  "anthropic:claude-haiku-4.5": {
    input: 1.00, output: 5.00, context: 200000, provider: "anthropic", category: "budget"
  },
  
  // ============================================
  // FLAGSHIP MODELS ($5+/M tokens)
  // ============================================
  
  // OpenAI GPT-5 Pro
  "openai:gpt-5.4-pro": {
    input: 30.00, output: 180.00, context: 1050000, provider: "openai", category: "flagship"
  },
  
  // Anthropic Claude Opus
  "anthropic:claude-opus-4.6": {
    input: 5.00, output: 25.00, context: 200000, provider: "anthropic", category: "flagship"
  },
  
  // ============================================
  // OPENROUTER (pass-through with 5.5% fee)
  // ============================================
  "openrouter:openai/gpt-5.4": {
    input: 2.64, output: 15.83, context: 1050000, provider: "openrouter", category: "standard"
  },
  "openrouter:anthropic/claude-sonnet-4.6": {
    input: 3.17, output: 15.83, context: 200000, provider: "openrouter", category: "standard"
  },
  "openrouter:google/gemini-3.1-pro": {
    input: 2.11, output: 12.66, context: 1000000, provider: "openrouter", category: "standard"
  },
  "openrouter:x-ai/grok-4.20": {
    input: 2.11, output: 6.33, context: 2000000, provider: "openrouter", category: "standard"
  },
  "openrouter:deepseek/deepseek-v3.2": {
    input: 0.28, output: 1.16, context: 164000, provider: "openrouter", category: "open-source"
  },
  "openrouter:meta-llama/llama-4-scout": {
    input: 0.08, output: 0.32, context: 10000000, provider: "openrouter", category: "open-source"
  },
};

// Get pricing for a model (with user overrides)
export function getModelPricing(
  modelKey: string,
  overrides?: Record<string, ModelPricing>
): ModelPricing {
  // Normalize key
  const normalizedKey = modelKey.toLowerCase().trim();
  
  // Check overrides first
  if (overrides?.[normalizedKey]) {
    return overrides[normalizedKey];
  }
  
  // Check default pricing (case-insensitive)
  for (const [key, pricing] of Object.entries(DEFAULT_PRICING)) {
    if (key.toLowerCase() === normalizedKey) {
      return pricing;
    }
  }
  
  // Try partial match for versioned models
  const [provider, modelName] = normalizedKey.split(":");
  
  for (const [key, pricing] of Object.entries(DEFAULT_PRICING)) {
    const [keyProvider, keyModel] = key.toLowerCase().split(":");
    
    // Match by provider and base model name
    if (keyProvider === provider) {
      const baseName = modelName?.split("-").slice(0, 3).join("-");
      const keyBase = keyModel?.split("-").slice(0, 3).join("-");
      
      if (baseName && keyBase && (modelName?.includes(keyBase) || keyModel?.includes(baseName))) {
        return pricing;
      }
    }
  }
  
  // Default fallback (budget-tier pricing)
  return {
    input: 0.50,
    output: 1.50,
    context: 128000,
    provider: provider || "unknown",
    category: "budget"
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
  if (cost === 0) return "FREE";
  if (cost < 0.00001) return `$${(cost * 1000000).toFixed(2)}μ`;
  if (cost < 0.001) return `$${(cost * 1000).toFixed(4)}m`;
  if (cost < 0.01) return `$${cost.toFixed(5)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  if (cost < 100) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

// Get all available models sorted by cost
export function getAvailableModels(): Array<{ key: string; pricing: ModelPricing }> {
  return Object.entries(DEFAULT_PRICING)
    .map(([key, pricing]) => ({ key, pricing }))
    .sort((a, b) => {
      // Sort by category first, then by input cost
      const categoryOrder = { "local": 0, "open-source": 1, "budget": 2, "standard": 3, "flagship": 4 };
      const catA = categoryOrder[a.pricing.category || "budget"];
      const catB = categoryOrder[b.pricing.category || "budget"];
      if (catA !== catB) return catA - catB;
      return a.pricing.input - b.pricing.input;
    });
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

// Get pricing summary for a model
export function getPricingSummary(modelKey: string, overrides?: Record<string, ModelPricing>): string {
  const pricing = getModelPricing(modelKey, overrides);
  const lines = [
    `Model: ${modelKey}`,
    `Provider: ${pricing.provider || "unknown"}`,
    `Category: ${pricing.category || "standard"}`,
    `Input: $${pricing.input}/1M tokens`,
    `Output: $${pricing.output}/1M tokens`,
  ];
  
  if (pricing.context) {
    const contextK = pricing.context / 1000;
    const contextM = pricing.context / 1_000_000;
    if (contextM >= 1) {
      lines.push(`Context: ${contextM}M tokens`);
    } else {
      lines.push(`Context: ${contextK}K tokens`);
    }
  }
  
  // Example costs
  const example1K = calculateCost(1000, 500, pricing);
  const example10K = calculateCost(10000, 5000, pricing);
  lines.push(``, `Example costs:`);
  lines.push(`  1K input + 500 output: ${formatCost(example1K)}`);
  lines.push(`  10K input + 5K output: ${formatCost(example10K)}`);
  
  return lines.join("\n");
}