# Literature Briefing Skill

You write paper-by-paper digests from a discovered paper list. The user wants to understand the main content of each relevant paper without reading the original paper first.

This skill is downstream of `paper-discovery`. When `paper_discovery.md` is available in the workspace, treat it as the primary paper list. Do not redo broad discovery unless the upstream list is clearly inadequate or the user asks for additional search. If no discovery artifact is available, perform a lightweight discovery pass first and say that coverage may be limited.

## Objective

For each included paper:

1. Read the best available source.
2. Explain the paper's background, problem, method, main results, limitations, and why it matters.
3. Keep the digest self-contained.
4. Preserve links and identifiers from the upstream paper list.

The main body must be ordered paper digests, not a thematic survey essay. Cross-paper notes are allowed only as a short support section.

## Reading Policy

Prefer full text, official HTML, PDF, accepted paper pages, appendices, official project pages, and official code repositories. If only an abstract or metadata is available, label the digest as abstract-level.

Do not invent results, metrics, author claims, venues, dates, or code links. If the source does not provide a detail, say it is unavailable.

## Digest Fields

Each paper digest must include:

- **Type**: paper, survey, benchmark, dataset, software, preprint, etc.
- **Status**: peer-reviewed, preprint, workshop, unknown, etc.
- **Authors**.
- **Date / venue**.
- **Links**.
- **Evidence depth**: full-text, abstract+metadata, or metadata-only.
- **One-line takeaway**.
- **Background**: the area or practical need the paper sits in.
- **Problem**: the gap, question, or failure mode addressed.
- **Method**: the main model, algorithm, benchmark design, system architecture, dataset construction, or experimental approach.
- **Main results**: important empirical or theoretical findings, including benchmarks or metrics when available.
- **Limitations**: assumptions, weak evidence, missing evaluations, unsolved cases, or likely failure modes.
- **Why it matters**: why this paper matters for the user's topic.

## Ordering

Follow the paper order from `paper_discovery.md` unless a better reading order is obvious. Good default ordering:

1. Most directly relevant papers.
2. Recent papers inside the requested time window.
3. Benchmarks/datasets that define the area.
4. Foundational or survey papers needed to understand the newer work.
5. Adjacent context papers.

State the ordering rule briefly.

## Output

Return Markdown with this structure:

```markdown
# Literature Briefing: <topic>

## Scope

## Coverage Summary

## Recommended Reading Order

## Paper Digests

### 1. <title>

- Type:
- Status:
- Authors:
- Date / venue:
- Links:
- Evidence depth:
- One-line takeaway:
- Background:
- Problem:
- Method:
- Main results:
- Limitations:
- Why it matters:

### 2. <title>

...

## Maybe Relevant / Excluded Papers

## Code, Data, and Benchmarks

## Short Cross-Paper Notes

## Follow-Up Questions

## References
```

The `Paper Digests` section is the main body. If the report is long, keep the first screen useful: scope, paper count, and reading order.

## Quality Gates

Before finalizing, verify:

- The output is paper-by-paper, not mainly thematic synthesis.
- Every included paper fits the user's request or has an explicit reason for inclusion.
- Every included paper has a link or stable identifier.
- Every digest states evidence depth.
- Methods and results are specific when the source provides specifics.
- Preprints and peer-reviewed papers are clearly distinguished.
- Unknown or unavailable details are not filled in from imagination.
