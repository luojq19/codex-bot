export type ModelSpec = {
  id: string;
  label: string;
};

export const DEFAULT_MODEL = "gpt-5.5";

export const KNOWN_MODELS: ModelSpec[] = [
  { id: "gpt-5.5", label: "Frontier general-purpose model" },
  { id: "gpt-5.5-pro", label: "Higher-compute GPT-5.5 variant" },
  { id: "gpt-5.2", label: "Previous frontier model" },
  { id: "gpt-5.1-codex", label: "Codex-optimized GPT-5.1 model" },
  { id: "gpt-5.1-codex-mini", label: "Smaller Codex-optimized model" }
];

export function formatModels(currentModel: string): string {
  return KNOWN_MODELS.map((model) => {
    const marker = model.id === currentModel ? "*" : " ";
    return `${marker} ${model.id.padEnd(20)} ${model.label}`;
  }).join("\n");
}
