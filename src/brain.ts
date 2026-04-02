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
    if (toolCalls.length === 0 && content.includes("<function=") || content.includes("<tool_call>")) {
      console.error(`[Brain] XML fallback triggered, content includes <function=>`);
      const parsed = this.parseXmlToolCalls(content);
      toolCalls.push(...parsed);
      console.error(`[Brain] Parsed ${parsed.length} XML tool calls`);
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
    tools?: Tool[]
  ): Promise<ThinkResult> {
    const startTime = Date.now();
    console.error(`[Brain] Model: ${modelOverride} (${tools?.length || 0} tools), thinking...`);

    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    const response = await this.client.chat.completions.create({
      model: modelOverride,
      messages: fullMessages,
      tools: tools?.length ? this.formatTools(tools) : undefined,
      tool_choice: tools?.length ? "auto" : undefined,
    });

    const elapsed = Date.now() - startTime;
    console.error(`[Brain] ✓ ${modelOverride} done in ${elapsed}ms`);

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
    const regex = /(?:<tool_call>[\s\n]*)?<function=([^>]+)>([\s\S]*?)<\/function>(?:[\s\n]*<\/tool_call>)?/gi;
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

  // Strip tool calls from visible output
  stripToolCalls(content: string): string {
    return content
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, "")
      .trim();
  }
}

// Export for backward compatibility
export function parseToolCalls(content: string): Array<{ name: string; args: Record<string, string> }> {
  const regex = /(?:<tool_call>[\s\n]*)?<function=([^>]+)>([\s\S]*?)<\/function>(?:[\s\n]*<\/tool_call>)?/gi;
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
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, "")
    .trim();
}