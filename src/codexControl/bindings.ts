import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { APP_DIR } from "../tasks/paths.js";

export const CODEX_CONTROL_BINDINGS_PATH = join(APP_DIR, "codex-control-bindings.json");

export type CodexControlBinding = {
  conversationKey: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
};

type BindingStore = Record<string, CodexControlBinding>;

export async function getCodexControlBinding(conversationKey: string): Promise<CodexControlBinding | undefined> {
  const store = await readBindings();
  return store[conversationKey];
}

export async function saveCodexControlBinding(
  conversationKey: string,
  sessionId: string
): Promise<CodexControlBinding> {
  const store = await readBindings();
  const existing = store[conversationKey];
  const now = new Date().toISOString();
  const binding: CodexControlBinding = {
    conversationKey,
    sessionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  store[conversationKey] = binding;
  await writeBindings(store);
  return binding;
}

export async function removeCodexControlBinding(conversationKey: string): Promise<CodexControlBinding | undefined> {
  const store = await readBindings();
  const binding = store[conversationKey];
  if (!binding) {
    return undefined;
  }
  delete store[conversationKey];
  await writeBindings(store);
  return binding;
}

async function readBindings(): Promise<BindingStore> {
  try {
    const raw = await readFile(CODEX_CONTROL_BINDINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${CODEX_CONTROL_BINDINGS_PATH} must contain an object.`);
    }
    return parsed as BindingStore;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeBindings(store: BindingStore): Promise<void> {
  await mkdir(dirname(CODEX_CONTROL_BINDINGS_PATH), { recursive: true, mode: 0o700 });
  const tempPath = `${CODEX_CONTROL_BINDINGS_PATH}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(tempPath, CODEX_CONTROL_BINDINGS_PATH);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
