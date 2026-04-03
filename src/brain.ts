import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import type { Message, ProviderConfig, Tool } from "./types.ts";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ThinkResult {
  content: string;
  toolCalls: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class Brain {
  private client: OpenAI;
  private model: string;

  constructor(providerStr: string, providers: Record<string, ProviderConfig>) {
    const [providerName, modelName] = providerStr.trim().split(":");
    const config = providers[providerName];
    
    if (!config) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    // Prefer inline apiKey (config.toml), fall back to env var via apiKeyEnv
    const apiKey = config.apiKey || (config.apiKeyEnv ? process.env[config.apiKeyEnv] || "" : "");
    const baseURL = config.baseUrl || "https://api.openai.com/v1";

    this.client = new OpenAI({
      apiKey: apiKey || "no-key",
      baseURL,
    });
    this.model = modelName;
  }

  async think(
    messages: Message[],
    systemPrompt: string,
    tools?: Tool[]
  ): Promise<ThinkResult> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      tools: tools?.length ? this.formatTools(tools) : undefined,
      temperature: 0.5,
      top_p: 0.95,
      tool_choice: tools?.length ? "auto" : undefined,
    });
    
    const choice = response.choices[0];
    const content = choice.message.content || "";
    const toolCalls: ToolCall[] = [];

    // 1. OpenAI-style native tool_calls (highest priority)
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(jsonrepair(tc.function.arguments));
        } catch {
          args = {};
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
      }
    }

    // 2. ZeroClaw-style multi-format parsing — only if no native calls
    if (toolCalls.length === 0 && content.trim()) {
      const parsed = this.parseAllToolFormats(content);
      if (parsed.length > 0) {
        console.error(`[Brain] Fallback parser found ${parsed.length} tool call(s)`);
        toolCalls.push(...parsed);
      }
    }

    const usage = response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } : undefined;

    return { content, toolCalls, usage };
  }

  async thinkWithModel(
    messages: Message[],
    systemPrompt: string,
    modelOverride: string,
    tools?: Tool[],
    temperature?: number,
  ): Promise<ThinkResult> {
    const startTime = Date.now();
    const [providerName, modelName] = modelOverride.trim().split(":");
    const actualModel = modelName || providerName;

    console.error(`[Brain] Model: ${actualModel} (${tools?.length || 0} tools), thinking...`);

    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    const response = await this.client.chat.completions.create({
      model: actualModel,
      messages: fullMessages,
      tools: tools?.length ? this.formatTools(tools) : undefined,
      temperature: temperature ?? 0.5,
      top_p: 0.95,
      tool_choice: tools?.length ? "auto" : undefined,
    });

    const elapsed = Date.now() - startTime;
    console.error(`[Brain] ✓ ${actualModel} done in ${elapsed}ms`);

    const choice = response.choices[0];
    const content = choice.message.content || "";
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(jsonrepair(tc.function.arguments));
        } catch {
          args = {};
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
      }
    }

    const usage = response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } : undefined;

    return { content, toolCalls, usage };
  }

  async thinkWithToolResults(
    messages: Message[],
    systemPrompt: string,
    toolResults: Array<{ toolCallId: string; name: string; result: string }>,
    tools?: Tool[]
  ): Promise<ThinkResult> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    for (const tr of toolResults) {
      fullMessages.push({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: tr.result,
      } as OpenAI.Chat.ChatCompletionToolMessageParam);
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      tools: tools?.length ? this.formatTools(tools) : undefined,
      temperature: 0.5,
      top_p: 0.95,
      tool_choice: tools?.length ? "auto" : undefined,
    });

    const choice = response.choices[0];
    const content = choice.message.content || "";
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(jsonrepair(tc.function.arguments));
        } catch {
          args = {};
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
      }
    }

    return { content, toolCalls };
  }

  private formatTools(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
  }

  // ── ZeroClaw-style Multi-Format Parser ──────────────────────────────────
  // Priority: XML tags > GLM-style > Markdown
  // SECURITY: Never extract arbitrary JSON from response body

  parseAllToolFormats(response: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const cleaned = this.stripThinkTags(response);

    const xmlCalls = this.parseXmlToolCalls(cleaned);
    if (xmlCalls.length > 0) calls.push(...xmlCalls);

    const glmCalls = this.parseGlmStyleCalls(cleaned);
    if (glmCalls.length > 0) calls.push(...glmCalls);

    const mdCalls = this.parseMarkdownToolCalls(cleaned);
    if (mdCalls.length > 0) calls.push(...mdCalls);

    return calls;
  }

  private stripThinkTags(text: string): string {
    return text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<thought[\s\S]*?<\/thought>/gi, "")
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
      .trim();
  }

  private parseXmlToolCalls(response: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const invokeRe = /<(?:invoke|tool_call|function)(?:\s+name=["']([^"']+)["']|\s*)>([\s\S]*?)<\/(?:invoke|tool_call|function)>/gi;
    let m;
    while ((m = invokeRe.exec(response)) !== null) {
      const nameAttr = m[1];
      const inner = m[2];
      let name = nameAttr || "";
      if (!name) {
        const nameMatch = inner.match(/"name"\s*:\s*"([^"]+)"/);
        if (nameMatch) name = nameMatch[1];
      }
      const args: Record<string, unknown> = {};
      const paramRe = /<parameter\s+name=["']([^"']+)["']>([\s\S]*?)<\/parameter>/gi;
      let pm;
      while ((pm = paramRe.exec(inner)) !== null) {
        let val: unknown = pm[2].trim();
        try { val = JSON.parse(val as string); } catch { }
        args[pm[1]] = val;
      }
      const jsonBlock = inner.match(/\{[^{}]*"name"[^{}]*\}/s);
      if (jsonBlock) {
        try {
          const obj = JSON.parse(jsonBlock[0]);
          if (obj.name) name = obj.name;
          if (obj.arguments) Object.assign(args, obj.arguments);
          else if (obj.args) Object.assign(args, obj.args);
        } catch { }
      }
      if (name) {
        calls.push({
          id: `xml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: this.mapToolAlias(name),
          arguments: args,
        });
      }
    }
    return calls;
  }

  private parseGlmStyleCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const lineRe = /^(\w+)\s*>\s*([\s\S]+)$/gm;
    let m;
    while ((m = lineRe.exec(text)) !== null) {
      const name = m[1];
      const rest = m[2].trim();
      if (name === "I" || name === "The" || name === "This" || name === "It") continue;
      if (rest.includes("\n") && rest.includes(":")) {
        const args: Record<string, unknown> = {};
        for (const ln of rest.split("\n")) {
          const kv = ln.trim().match(/^(\w+)\s*:\s*(.+)$/);
          if (kv) {
            let val: unknown = kv[2].trim();
            try { val = JSON.parse(val as string); } catch { }
            args[kv[1]] = val;
          }
        }
        if (Object.keys(args).length > 0) {
          calls.push({ id: `glm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: this.mapToolAlias(name), arguments: args });
          continue;
        }
      }
      if (rest.includes('="')) {
        const args: Record<string, unknown> = {};
        const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
        let am;
        while ((am = attrRe.exec(rest)) !== null) {
          args[am[1]] = am[2];
        }
        if (Object.keys(args).length > 0) {
          calls.push({ id: `glm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: this.mapToolAlias(name), arguments: args });
          continue;
        }
      }
      const param = this.defaultParamFor(name);
      let val: unknown = rest;
      try { val = JSON.parse(rest); } catch { }
      calls.push({ id: `glm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: this.mapToolAlias(name), arguments: { [param]: val } });
    }
    return calls;
  }

  private parseMarkdownToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const mdRe = /^[*_](\w+)(?:\s+([^*_]+))?[*_]$/gm;
    let m;
    while ((m = mdRe.exec(text)) !== null) {
      const name = m[1];
      const argsStr = (m[2] || "").trim();
      if (name === "I" || name === "The" || name === "This" || name === "It") continue;
      const args: Record<string, unknown> = {};
      if (argsStr) {
        const kvRe = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*(\S+)/g;
        let kv;
        let hasKV = false;
        while ((kv = kvRe.exec(argsStr)) !== null) {
          const k = kv[1] || kv[3];
          const v = kv[2] ?? kv[4];
          args[k] = v;
          hasKV = true;
        }
        if (!hasKV) {
          const param = this.defaultParamFor(name);
          args[param] = argsStr.replace(/["']/g, "");
        }
      }
      calls.push({ id: `md_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: this.mapToolAlias(name), arguments: args });
    }
    return calls;
  }

  private mapToolAlias(name: string): string {
    const aliases: Record<string, string> = {
      "browser": "browser", "browse": "browser", "open": "browser",
      "web_search": "web_search", "search": "web_search", "google": "web_search",
      "web_extract": "web_extract", "extract": "web_extract", "scrape": "web_extract",
      "shell": "shell", "bash": "shell", "exec": "shell", "command": "shell",
      "file_read": "file_read", "read": "file_read",
      "file_write": "file_write", "write": "file_write",
      "memory_recall": "memory_recall", "recall": "memory_recall",
      "http_request": "http_request", "fetch": "http_request", "curl": "http_request",
    };
    return aliases[name] || name;
  }

  private defaultParamFor(tool: string): string {
    const defaults: Record<string, string> = {
      "browser": "url", "web_search": "query", "web_extract": "url",
      "shell": "command", "file_read": "path", "file_write": "path",
      "memory_recall": "query", "http_request": "url", "git_log": "path",
    };
    return defaults[tool] || "input";
  }

  stripToolCalls(content: string): string {
    return content
      .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/gi, "")
      .replace(/[*_](\w+)(?:\s+[^*_]+)?[*_]/g, "")
      .trim();
  }
}
