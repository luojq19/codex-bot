import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { APP_DIR } from "../tasks/paths.js";

export const THREADS_PATH = join(APP_DIR, "threads.json");

export type ThreadBinding = {
  conversationKey: string;
  threadId: string;
  model: string;
  source?: "cli" | "discord";
  createdAt: string;
  updatedAt: string;
};

export async function listThreadBindings(): Promise<ThreadBinding[]> {
  const store = await readThreadStore();
  return Object.values(store).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getThreadBinding(conversationKey: string): Promise<ThreadBinding | undefined> {
  const store = await readThreadStore();
  return store[conversationKey];
}

export async function upsertThreadBinding(input: {
  conversationKey: string;
  threadId: string;
  model: string;
  source?: "cli" | "discord";
}): Promise<ThreadBinding> {
  const store = await readThreadStore();
  const existing = store[input.conversationKey];
  const now = new Date().toISOString();
  const binding: ThreadBinding = {
    conversationKey: input.conversationKey,
    threadId: input.threadId,
    model: input.model,
    source: input.source ?? existing?.source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  store[input.conversationKey] = binding;
  await writeThreadStore(store);
  return binding;
}

export async function removeThreadBinding(conversationKey: string): Promise<ThreadBinding | undefined> {
  const store = await readThreadStore();
  const binding = store[conversationKey];
  if (!binding) {
    return undefined;
  }
  delete store[conversationKey];
  await writeThreadStore(store);
  return binding;
}

type ThreadStore = Record<string, ThreadBinding>;

async function readThreadStore(): Promise<ThreadStore> {
  try {
    const raw = await readFile(THREADS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${THREADS_PATH} must contain an object.`);
    }
    return parsed as ThreadStore;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeThreadStore(store: ThreadStore): Promise<void> {
  await mkdir(dirname(THREADS_PATH), { recursive: true, mode: 0o700 });
  const tempPath = `${THREADS_PATH}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(tempPath, THREADS_PATH);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
