import { REST, Routes } from "discord.js";
import { loadDiscordToken } from "./config.js";

const DISCORD_MESSAGE_LIMIT = 2000;
const CHUNK_BODY_LIMIT = 1900;

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

  const bodyChunks = splitMessageBody(content);
  if (bodyChunks.length === 1) {
    return bodyChunks;
  }

  return bodyChunks.map((chunk, index) => `(${index + 1}/${bodyChunks.length})\n${chunk}`);
}

function splitMessageBody(content: string): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/(\n{2,})/);
  let current = "";

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      continue;
    }

    if (paragraph.length > CHUNK_BODY_LIMIT) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLongParagraph(paragraph));
      continue;
    }

    if (current.length + paragraph.length > CHUNK_BODY_LIMIT) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current += paragraph;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function splitLongParagraph(paragraph: string): string[] {
  const chunks: string[] = [];
  let remaining = paragraph.trim();

  while (remaining.length > CHUNK_BODY_LIMIT) {
    const splitAt = findSplitPoint(remaining);
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function findSplitPoint(value: string): number {
  const hardLimit = Math.min(CHUNK_BODY_LIMIT, value.length);
  const protectedRanges = findProtectedRanges(value);
  const candidates = ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", "; ", "；", "，", ", ", " "]
    .map((token) => {
      const index = value.lastIndexOf(token, hardLimit);
      return index >= 0 ? index + token.length : -1;
    })
    .filter((index) => index > 0 && isSafeBoundary(index, protectedRanges));
  if (candidates.length) {
    return Math.max(...candidates);
  }

  const protectedRange = protectedRanges.find((range) => range.start < hardLimit && hardLimit < range.end);
  if (protectedRange) {
    if (protectedRange.start > 0) {
      return protectedRange.start;
    }
    if (protectedRange.end <= CHUNK_BODY_LIMIT) {
      return protectedRange.end;
    }
  }

  return hardLimit;
}

type ProtectedRange = {
  start: number;
  end: number;
};

function findProtectedRanges(value: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  const pattern = /\[[^\]\n]+\]\((?:https?:\/\/|www\.)[^\s)]+\)|https?:\/\/[^\s<]+|www\.[^\s<]+/g;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    ranges.push({
      start,
      end: start + match[0].length
    });
  }
  return ranges;
}

function isSafeBoundary(index: number, ranges: ProtectedRange[]): boolean {
  return !ranges.some((range) => range.start < index && index < range.end);
}
