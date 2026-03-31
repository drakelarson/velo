import { Hono } from "hono";
import { Agent } from "../agent.ts";

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

  return {
    start: () => {
      console.log(`[Webhook] Server started on port ${port}`);
      return Bun.serve({ port, fetch: app.fetch });
    },
  };
}