# Todo

- [x] Implement a Codex app-server thread runtime for persistent Discord conversations.
- [ ] Add structured paper discovery scripts for the paper-discovery skill.

# Details

## Add structured paper discovery scripts for the paper-discovery skill.

Second-stage code enhancement after the Markdown-only prompt upgrade.

Key notes:
- Add `skills/paper-discovery/scripts/` helpers for structured academic search.
- Prefer free or optional-key sources first: arXiv and OpenAlex; add Semantic Scholar as optional when an API key is available.
- Normalize search results into `paper_db.jsonl` with title, authors, date/year, venue/status, identifiers, URLs, abstract, citation count, source, and relevance notes.
- Add deduplication by DOI, arXiv ID, Semantic Scholar paper id, URL, and normalized title.
- Consider changing skill execution from read-only to controlled workspace-write so research runs can persist intermediate artifacts directly.
- Keep code-source discovery separate from paper discovery, but allow downstream skills to include GitHub, Papers with Code, benchmark, and dataset references.
- Add tests for query expansion, result normalization, deduplication, and artifact generation.
