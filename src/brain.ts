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

    const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] || "" : "";
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
    
    console.error(`[Brain] Model: ${this.model}, Tools: ${tools?.length || 0}, Tool calls in response: ${response.choices[0]?.message?.tool_calls?.length || 0}`);
    console.error(`[Brain] Raw response: ${JSON.stringify(response)}`);

    const choice = response.choices[0];
    const content = choice.message.content || "";
    const toolCalls: ToolCall[] = [];

    // Parse tool calls from API response (OpenAI-style)
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(jsonrepair(tc.function.arguments));
        } catch {
          args = {};
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        });
      }
    }

    // Fallback: parse XML tool calls from content (for non-compliant models)
    // Note: condition must group correctly — only trigger on actual XML tool call syntax
    if (toolCalls.length === 0 && (content.includes("<function=") || content.includes("<tool_call"))) {
      console.error(`[Brain] XML fallback triggered`);
      const parsed = this.parseXmlToolCalls(content);
      toolCalls.push(...parsed);
      console.error(`[Brain] Parsed ${parsed.length} XML tool calls`);
    }

    // Fallback: parse markdown-style tool calls from content (for models that output *tool args* as plain text)
    if (toolCalls.length === 0) {
      const parsed = this.parseMarkdownToolCalls(content);
      if (parsed.length > 0) {
        console.error(`[Brain] Markdown tool call fallback: ${parsed.length} calls`);
        toolCalls.push(...parsed);
      }
    }

    // Extract token usage
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

    // Split provider:model format if present
    const [providerName, modelName] = modelOverride.trim().split(":");
    const actualModel = modelName || providerName; // Handle "gemma-3-4b-it" or "google:gemma-3-4b-it"

    console.error(`[Brain] Model: ${actualModel} (${tools?.length || 0} tools), thinking...`);

    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    const response = await this.client.chat.completions.create({
      model: actualModel,
      messages: fullMessages,
      tools: tools?.length ? this.formatTools(tools) : undefined,
      temperature: temperature || 0.5,
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
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        });
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

    // Add tool results as tool messages
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
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        });
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

  // Fallback for models that output XML-style tool calls in content
  private parseXmlToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const regex = /(?:<\/tool_call>)?<function=([^>]+)>([\s\S]*?)<\/function>(?:[\s\n]*<\/tool_call>)?/gi;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1].trim();
      const body = match[2];
      const args: Record<string, unknown> = {};

      // Parse parameters
      const paramRegex = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/gi;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(body)) !== null) {
        args[paramMatch[1].trim()] = paramMatch[2].trim();
      }

      toolCalls.push({
        id: `xml_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name,
        arguments: args,
      });
    }

    return toolCalls;
  }

  // Fallback for models that output tool calls as markdown italic text: *tool_name arg1 "value" arg2 123*
  // Also handles: *browser https://example.com*, *search query*, etc.
  parseMarkdownToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Match patterns like:
    // *web_search query="latest news"*
    // *browser https://example.com*
    // *search term1 term2*
    // *tool_name arg1="value" arg2=123*
    const markdownRegex = /^\*(\w+)(?:\s+(.+?))?\*$/gm;
    let match;

    while ((match = markdownRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const argsStr = match[2]?.trim() || "";

      // Skip if name doesn't look like a tool (too long, has spaces, etc.)
      if (!name || name.length > 50 || /\s/.test(name)) continue;

      // Try to parse args as key="value" or key=value or positional
      const args: Record<string, unknown> = {};
      
      if (argsStr) {
        // Try JSON-style: key="value" or key='value'
        const kvRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
        let kvMatch;
        let hasKVPairs = false;
        while ((kvMatch = kvRegex.exec(argsStr)) !== null) {
          const key = kvMatch[1];
          const value = kvMatch[2] ?? kvMatch[3] ?? kvMatch[4];
          args[key] = value;
          hasKVPairs = true;
        }

        // If no KV pairs, treat as positional "query" argument (common for search tools)
        if (!hasKVPairs && argsStr.trim()) {
          // Map common aliases
          const aliasMap: Record<string, string> = {
            site: "url", link: "url", page: "url",
            search: "query", q: "query", term: "query",
            file: "path", directory: "path",
          };
          const firstKey = aliasMap[name] || "query";
          args[firstKey] = argsStr;
        }
      }

      toolCalls.push({
        id: `md_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name,
        arguments: args,
      });
    }

    return toolCalls;
  }

  // Strip tool calls from visible output
  stripToolCalls(content: string): string {
    return content
      .replace(/<\/tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, "")
      .replace(/^\*(\w+)(?:\s+(.+?))?\*$/gm, "")
      .trim();
  }
}

// Export for backward compatibility
export function parseToolCalls(content: string): Array<{ name: string; args: Record<string, string> }> {
  const regex = /(?:<\/tool_call>)?<function=([^>]+)>([\s\S]*?)<\/function>(?:[\s\n]*<\/tool_call>)?/gi;
  const toolCalls: Array<{ name: string; args: Record<string, string> }> = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    const body = match[2];
    const args: Record<string, string> = {};

    const paramRegex = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/gi;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(body)) !== null) {
      args[paramMatch[1].trim()] = paramMatch[2].trim();
    }

    toolCalls.push({ name, args });
  }

  return toolCalls;
}

export function stripToolCalls(content: string): string {
  return content
    .replace(/<\/tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, "")
    .replace(/^\*(\w+)(?:\s+(.+?))?\*$/gm, "")
    .trim();
}