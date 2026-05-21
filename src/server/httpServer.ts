import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppConfig } from "../config.js";
import { createTask, getTask, listRuns, listTasks, removeTask } from "../tasks/service.js";
import type { CreateTaskInput } from "../tasks/types.js";
import { TaskScheduler } from "./scheduler.js";

export type ServerHandle = {
  url: string;
  stop(): Promise<void>;
};

export async function startServer(config: AppConfig, options: { port: number; host?: string }): Promise<ServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const scheduler = new TaskScheduler(config);
  scheduler.start();

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, scheduler);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const url = `http://${address.address}:${address.port}`;
  console.log(`codex-bots server listening on ${url}`);

  return {
    url,
    stop: async () => {
      scheduler.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  scheduler: TaskScheduler
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, scheduler: scheduler.getStatus() });
    return;
  }

  if (method === "GET" && url.pathname === "/tasks") {
    sendJson(response, 200, { tasks: await listTasks() });
    return;
  }

  if (method === "POST" && url.pathname === "/tasks") {
    const input = (await readJson(request)) as CreateTaskInput;
    const task = await createTask(input);
    sendJson(response, 201, { task });
    return;
  }

  const taskMatch = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (method === "DELETE" && taskMatch) {
    const task = await removeTask(decodeURIComponent(taskMatch[1]));
    sendJson(response, 200, { task });
    return;
  }

  const runMatch = /^\/tasks\/([^/]+)\/run$/.exec(url.pathname);
  if (method === "POST" && runMatch) {
    const task = await getTask(decodeURIComponent(runMatch[1]));
    await scheduler.enqueueTask(task, "manual");
    sendJson(response, 202, { queued: true, taskId: task.id });
    return;
  }

  if (method === "GET" && url.pathname === "/runs") {
    const limit = parsePositiveInt(url.searchParams.get("limit")) ?? 20;
    const taskId = url.searchParams.get("taskId") ?? undefined;
    sendJson(response, 200, { runs: await listRuns({ taskId, limit }) });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
