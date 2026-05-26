import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { Attachment, ChatInputCommandInteraction, Message, SlashCommandAttachmentOption } from "discord.js";

export const DISCORD_IMAGE_OPTION_NAMES = Array.from({ length: 20 }, (_, index) => `image${index + 1}`);

export type DownloadedDiscordImages = {
  paths: string[];
  cleanup: () => Promise<void>;
};

export function addImageAttachmentOptions<T extends { addAttachmentOption(callback: (option: SlashCommandAttachmentOption) => SlashCommandAttachmentOption): T }>(
  builder: T
): T {
  let updated = builder;
  for (const name of DISCORD_IMAGE_OPTION_NAMES) {
    updated = updated.addAttachmentOption((option) =>
      option.setName(name).setDescription(`Optional image attachment ${name.replace("image", "")}`)
    );
  }
  return updated;
}

export async function downloadImageAttachments(
  interaction: ChatInputCommandInteraction
): Promise<DownloadedDiscordImages> {
  const attachments = DISCORD_IMAGE_OPTION_NAMES.flatMap((name) => {
    const attachment = interaction.options.getAttachment(name);
    return attachment ? [attachment] : [];
  });

  return downloadImageAttachmentList(attachments);
}

export async function downloadMessageImageAttachments(message: Message): Promise<DownloadedDiscordImages> {
  return downloadImageAttachmentList([...message.attachments.values()]);
}

async function downloadImageAttachmentList(attachments: Attachment[]): Promise<DownloadedDiscordImages> {
  if (attachments.length === 0) {
    return {
      paths: [],
      cleanup: async () => {}
    };
  }

  for (const attachment of attachments) {
    if (!isImageAttachment(attachment)) {
      throw new Error(`${attachment.name} is not an image attachment.`);
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "codex-bots-discord-images-"));
  const paths: string[] = [];

  try {
    for (const [index, attachment] of attachments.entries()) {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to download ${attachment.name}: HTTP ${response.status}.`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const path = join(dir, `image-${index + 1}${imageExtension(attachment)}`);
      await writeFile(path, buffer);
      paths.push(path);
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  return {
    paths,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

function isImageAttachment(attachment: Attachment): boolean {
  if (attachment.contentType?.startsWith("image/")) {
    return true;
  }
  return /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(attachment.name);
}

function imageExtension(attachment: Attachment): string {
  const extension = extname(attachment.name).toLowerCase();
  if (/^\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(extension)) {
    return extension;
  }
  const fromContentType = attachment.contentType?.split("/")[1]?.toLowerCase();
  if (fromContentType && /^[a-z0-9+.-]+$/.test(fromContentType)) {
    return `.${fromContentType.replace("jpeg", "jpg")}`;
  }
  return ".png";
}
