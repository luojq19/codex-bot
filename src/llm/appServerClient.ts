import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { AppConfig } from "../config.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type RpcResponseError = {
  code?: number;
  message: string;
  data?: JsonValue;
};

export type RpcNotification = {
  method: string;
  params?: JsonValue;
};

type RpcRequest = {
  id: number | string;
  method: string;
  params?: JsonValue;
};

type PendingRequest = {
  method: string;
  resolve(value: JsonValue | undefined): void;
  reject(error: Error): void;
  timeout?: ReturnType<typeof setTimeout>;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

let sharedClient: Promise<CodexAppServerClient> | undefined;
let sharedClientKey: string | undefined;

export async function getSharedCodexAppServerClient(config: AppConfig): Promise<CodexAppServerClient> {
  const key = `${config.codexCommand}|search:${config.webSearchEnabled ? "on" : "off"}`;
  if (!sharedClient || sharedClientKey !== key) {
    sharedClientKey = key;
    sharedClient = CodexAppServerClient.start(config)
      .then((client) => {
        client.addCloseHandler(() => {
          if (sharedClientKey === key) {
            sharedClient = undefined;
            sharedClientKey = undefined;
          }
        });
        return client;
      })
      .catch((error: unknown) => {
        if (sharedClientKey === key) {
          sharedClient = undefined;
          sharedClientKey = undefined;
        }
        throw error;
      });
  }
  return sharedClient;
}

export function clearSharedCodexAppServerClient(): void {
  void sharedClient?.then((client) => client.close()).catch(() => undefined);
  sharedClient = undefined;
  sharedClientKey = undefined;
}

export class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: ReadlineInterface;
  private readonly pending = new Map<number | string, PendingRequest>();
  private readonly notificationHandlers = new Set<(notification: RpcNotification) => void>();
  private readonly closeHandlers = new Set<() => void>();
  private nextId = 1;
  private closed = false;
  private stderrTail = "";

  private constructor(config: AppConfig) {
    const args = [
      ...(config.webSearchEnabled ? ["--search"] : []),
      "app-server",
      "--listen",
      "stdio://"
    ];
    this.child = spawn(config.codexCommand, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.lines = createInterface({ input: this.child.stdout });

    this.lines.on("line", (line) => this.handleLine(line));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderrTail = appendTail(this.stderrTail, String(chunk), 4000);
    });
    this.child.on("error", (error) => this.closeWithError(error));
    this.child.on("exit", (code, signal) => {
      const suffix = this.stderrTail.trim() ? `\n${this.stderrTail.trim()}` : "";
      this.closeWithError(
        new Error(`codex app-server exited: code=${code ?? "null"} signal=${signal ?? "null"}${suffix}`)
      );
    });
  }

  static async start(config: AppConfig): Promise<CodexAppServerClient> {
    const client = new CodexAppServerClient(config);
    try {
      await client.request("initialize", {
        clientInfo: {
          name: "codex-bots",
          title: "Codex Bots",
          version: "0.1.0"
        },
        capabilities: {
          experimentalApi: true
        }
      });
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  request<T extends JsonValue | undefined = JsonValue | undefined>(
    method: string,
    params?: JsonValue,
    options: { timeoutMs?: number } = {}
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("codex app-server client is closed"));
    }

    const id = this.nextId++;
    const request: RpcRequest = { id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      timeout.unref?.();
      this.pending.set(id, {
        method,
        timeout,
        resolve: (value) => resolve(value as T),
        reject
      });
      this.write(request);
    });
  }

  addNotificationHandler(handler: (notification: RpcNotification) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  addCloseHandler(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(): void {
    if (!this.markClosed(new Error("codex app-server client is closed"))) {
      return;
    }
    this.lines.close();
    this.child.kill("SIGTERM");
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (!isObject(parsed)) {
      return;
    }
    if ("id" in parsed && ("result" in parsed || "error" in parsed) && !("method" in parsed)) {
      this.handleResponse(parsed);
      return;
    }
    if (typeof parsed.method === "string" && "id" in parsed) {
      this.handleServerRequest(parsed as { id: number | string; method: string; params?: JsonValue });
      return;
    }
    if (typeof parsed.method === "string") {
      const notification = {
        method: parsed.method,
        params: isJsonValue(parsed.params) ? parsed.params : undefined
      };
      for (const handler of [...this.notificationHandlers]) {
        handler(notification);
      }
    }
  }

  private handleResponse(response: { id?: unknown; result?: unknown; error?: unknown }): void {
    const id = response.id;
    if (typeof id !== "number" && typeof id !== "string") {
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    if (isObject(response.error)) {
      const error = response.error as RpcResponseError;
      pending.reject(new Error(error.message || `${pending.method} failed`));
      return;
    }
    pending.resolve(isJsonValue(response.result) ? response.result : undefined);
  }

  private handleServerRequest(request: { id: number | string; method: string; params?: JsonValue }): void {
    this.write({
      id: request.id,
      result: defaultServerRequestResponse(request.method)
    });
  }

  private write(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private closeWithError(error: Error): void {
    this.markClosed(error);
  }

  private markClosed(error: Error): boolean {
    if (this.closed) {
      return false;
    }
    this.closed = true;
    this.rejectPending(error);
    for (const handler of [...this.closeHandlers]) {
      handler();
    }
    return true;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function defaultServerRequestResponse(method: string): JsonValue {
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
    return { decision: "decline" };
  }
  if (method === "item/permissions/requestApproval") {
    return { permissions: {}, scope: "turn" };
  }
  if (method === "item/tool/requestUserInput") {
    return { answers: {} };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: "decline" };
  }
  if (method === "item/tool/call") {
    return {
      contentItems: [{ type: "inputText", text: "codex-bots has no handler for this tool call." }],
      success: false
    };
  }
  return {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isJsonValue(value: unknown): value is JsonValue {
  return (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value) ||
    Array.isArray(value) ||
    isObject(value)
  );
}

function appendTail(existing: string, next: string, limit: number): string {
  const combined = existing + next;
  return combined.length > limit ? combined.slice(combined.length - limit) : combined;
}
