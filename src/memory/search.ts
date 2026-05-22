export type MemoryChunk = {
  source: string;
  title: string;
  content: string;
  line: number;
};

export type MemorySearchResult = MemoryChunk & {
  score: number;
  snippet: string;
};

export function chunkMarkdown(source: string, markdown: string): MemoryChunk[] {
  const lines = markdown.split(/\r?\n/);
  const chunks: MemoryChunk[] = [];
  let title = "Document";
  let startLine = 1;
  let current: string[] = [];

  const flush = (): void => {
    const content = current.join("\n").trim();
    if (!content) {
      return;
    }
    chunks.push({
      source,
      title,
      content,
      line: startLine
    });
  };

  lines.forEach((line, index) => {
    const heading = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      title = heading[2];
      startLine = index + 1;
      current = [line];
      return;
    }
    current.push(line);
  });

  flush();
  return chunks;
}

export function rankMemoryChunks(
  query: string,
  chunks: MemoryChunk[],
  options: { limit?: number; snippetLength?: number } = {}
): MemorySearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  const phrase = query.trim().toLowerCase();
  const results = chunks
    .map((chunk) => {
      const score = scoreChunk(chunk, terms, phrase);
      return score > 0
        ? {
            ...chunk,
            score,
            snippet: buildSnippet(chunk.content, terms, options.snippetLength ?? 360)
          }
        : undefined;
    })
    .filter((result): result is MemorySearchResult => Boolean(result))
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source) || a.line - b.line);

  return results.slice(0, options.limit ?? 5);
}

function tokenize(query: string): string[] {
  const words = query
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]+/gu);
  return [...new Set((words ?? []).filter((word) => word.length >= 2))];
}

function scoreChunk(chunk: MemoryChunk, terms: string[], phrase: string): number {
  const content = chunk.content.toLowerCase();
  const title = chunk.title.toLowerCase();
  let score = phrase && content.includes(phrase) ? 8 : 0;

  for (const term of terms) {
    const contentHits = countOccurrences(content, term);
    const titleHits = countOccurrences(title, term);
    score += contentHits * (term.length >= 4 ? 2 : 1);
    score += titleHits * 4;
  }

  return score;
}

function countOccurrences(value: string, term: string): number {
  let count = 0;
  let index = value.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }
  return count;
}

function buildSnippet(content: string, terms: string[], maxLength: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const center = firstHit >= 0 ? firstHit : 0;
  const start = Math.max(0, center - Math.floor(maxLength / 3));
  const end = Math.min(normalized.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}
