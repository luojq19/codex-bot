import type { Client } from "discord.js";
import type { AppConfig } from "./config.js";
import { startDiscordBot } from "./connectors/discord/bot.js";
import { startServer, type ServerHandle } from "./server/httpServer.js";

export type RuntimeOptions = {
  port: number;
  host?: string;
  discord: boolean;
  server: boolean;
};

export async function startRuntime(config: AppConfig, options: RuntimeOptions): Promise<void> {
  const handles: Array<{ name: string; stop(): Promise<void> }> = [];

  if (options.server) {
    const server = await startServer(config, { port: options.port, host: options.host });
    handles.push(serverHandle(server));
  }

  if (options.discord) {
    const client = await startDiscordBot(config);
    handles.push(discordHandle(client));
  }

  if (handles.length === 0) {
    throw new Error("No runtime modules enabled.");
  }

  console.log(`runtime started: ${handles.map((handle) => handle.name).join(", ")}`);
  await waitForShutdown(handles);
}

function serverHandle(server: ServerHandle): { name: string; stop(): Promise<void> } {
  return {
    name: "server",
    stop: () => server.stop()
  };
}

function discordHandle(client: Client): { name: string; stop(): Promise<void> } {
  return {
    name: "discord",
    stop: async () => {
      client.destroy();
    }
  };
}

async function waitForShutdown(handles: Array<{ name: string; stop(): Promise<void> }>): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      process.exitCode = 0;
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });

  console.log("runtime shutting down...");
  await Promise.allSettled(handles.map((handle) => handle.stop()));
}
