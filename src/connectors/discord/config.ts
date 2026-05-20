export type DiscordEnv = {
  token: string;
  clientId: string;
  guildId?: string;
  defaultChannelId?: string;
};

export function loadDiscordEnv(): DiscordEnv {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required.");
  }
  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID is required.");
  }

  return {
    token,
    clientId,
    guildId: process.env.DISCORD_GUILD_ID,
    defaultChannelId: process.env.DISCORD_DEFAULT_CHANNEL_ID
  };
}

export function loadDiscordToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required for Discord delivery.");
  }
  return token;
}
