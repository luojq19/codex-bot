import { REST, Routes } from "discord.js";
import { loadDiscordToken } from "./config.js";

const DISCORD_MESSAGE_LIMIT = 2000;

export async function sendDiscordMessage(channelId: string, content: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(loadDiscordToken());
  for (const chunk of chunkDiscordMessage(content)) {
    await rest.post(Routes.channelMessages(channelId), {
      body: {
        content: chunk
      }
    });
  }
}

export function chunkDiscordMessage(content: string): string[] {
  if (content.length <= DISCORD_MESSAGE_LIMIT) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, DISCORD_MESSAGE_LIMIT));
    remaining = remaining.slice(DISCORD_MESSAGE_LIMIT);
  }
  return chunks;
}
