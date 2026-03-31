import { Hono } from "hono";
import { Agent } from "../agent.ts";

// MCP HTTP transport state
let mcpServer: any = null;

export function createWebhookChannel(agent: Agent, port: number = 3000) {
  const app = new Hono();

  app.post("/chat", async (c) => {
    const body = await c.req.json<{ message: string; session?: string }>();
    
    if (!body.message) {
      return c.json({ error: "Missing message" }, 400);
    }

    if (body.session) {
      agent.setSession(body.session);
    }

    const response = await agent.process(body.message);
    return c.json({ response });
  });

  app.post("/chat/stream", async (c) => {
    const body = await c.req.json<{ message: string; session?: string }>();
    
    if (!body.message) {
      return c.json({ error: "Missing message" }, 400);
    }

    if (body.session) {
      agent.setSession(body.session);
    }

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of agent.streamProcess(body.message)) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  });

  app.post("/remember", async (c) => {
    const body = await c.req.json<{ key: string; value: string }>();
    agent.remember(body.key, body.value);
    return c.json({ success: true });
  });

  app.get("/recall/:key", (c) => {
    const value = agent.recall(c.req.param("key"));
    return c.json({ value });
  });

  app.get("/memory", (c) => {
    return c.json({ memory: agent.getMemoryStatus() });
  });

  app.get("/sessions", (c) => {
    const sessions = agent.getSessions().map(s => ({
      id: s,
      messageCount: agent.getSessionMessageCount(s)
    }));
    return c.json({ sessions });
  });

  app.delete("/session/:id", (c) => {
    agent.clearSession(c.req.param("id"));
    return c.json({ cleared: true });
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  // === MCP HTTP Endpoints ===
  
  // List available MCP tools
  app.get("/mcp/tools", (c) => {
    const skills = Array.from((agent as any).skills?.keys?.() || []);
    return c.json({
      server: "Velo MCP",
      tools: skills,
      count: skills.length
    });
  });

  // Execute an MCP tool
  app.post("/mcp/call", async (c) => {
    const body = await c.req.json<{ tool: string; arguments?: Record<string, unknown> }>();
    
    if (!body.tool) {
      return c.json({ error: "Missing tool name" }, 400);
    }

    const skill = (agent as any).skills?.get?.(body.tool);
    if (!skill) {
      return c.json({ error: `Tool not found: ${body.tool}` }, 404);
    }

    try {
      const result = await skill.execute(body.arguments || {});
      return c.json({ result });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // MCP server info
  app.get("/mcp", (c) => {
    const skills = Array.from((agent as any).skills?.keys?.() || []);
    return c.json({
      name: "Velo MCP Server",
      version: "0.1.0",
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
      tools_count: skills.length,
      endpoints: {
        tools: "GET /mcp/tools",
        call: "POST /mcp/call { tool, arguments }",
        memory: "GET /memory",
        chat: "POST /chat { message, session? }"
      }
    });
  });

  return {
    start: () => {
      console.log(`[Webhook] Server started on port ${port}`);
      console.log(`[Webhook] MCP endpoints: GET /mcp, GET /mcp/tools, POST /mcp/call`);
      return Bun.serve({ port, fetch: app.fetch });
    },
  };
}