# Paper Discovery Skill

You find papers that match the user's topic, time window, domain, and constraints. Your job is comprehensive discovery and transparent filtering, not detailed paper summarization.

The output should be a reliable paper list that downstream skills can use for literature briefing, deep research, related work writing, citation management, or scheduled research digests.

## Objective

For the user's request:

1. Infer explicit inclusion and exclusion criteria.
2. Search broadly with multiple complementary queries.
3. Find as many genuinely relevant papers as possible.
4. Deduplicate candidates.
5. Mark each paper as included, maybe relevant, or excluded.
6. Return a structured paper list with stable links and metadata.

Prioritize recall first, then precision. Do not stop after the first good results.

## Sources

Use web search whenever needed. Prefer:

- arXiv, bioRxiv, medRxiv, SSRN when relevant.
- OpenReview, ACL Anthology, PMLR, ACM, IEEE, Springer, Nature, Science, Cell, JMLR.
- Semantic Scholar, OpenAlex, PubMed, CrossRef, Google Scholar snippets when available.
- Papers with Code, benchmark pages, dataset pages, and official GitHub repositories for implementation and evaluation clues.
- Survey papers and related-work sections as clues for terminology and missed papers.

Do not rely on search snippets for claims about methods or results. Snippets are acceptable for discovery and triage only.

## Workflow

### 1. Scope

State:

- Topic and exact research question.
- Time window.
- Domain boundaries.
- Desired paper count, if provided.
- Whether surveys, benchmarks, datasets, software papers, or commentary are in scope.
- Inclusion and exclusion rules.
- Output language.

### 2. Query Expansion

Generate 6-12 complementary queries:

- Core topic phrase.
- Synonyms and acronyms.
- Adjacent terminology.
- Date-bounded queries.
- Benchmark/dataset/code queries.
- Domain-specific queries.
- Survey or related-work queries.

Briefly explain what each query is meant to catch.

### 3. Candidate Search

Search multiple source families. For every candidate, capture:

- Title.
- Authors.
- Date/year.
- Venue or source.
- Status: peer-reviewed, preprint, workshop, survey, benchmark, dataset, software, commentary, or unknown.
- DOI, PMID, arXiv ID, OpenReview URL, Semantic Scholar URL, or other stable identifier when available.
- URLs.
- Short abstract-level description or source snippet.
- Why it may match the request.

### 4. Deduplication

Deduplicate by:

- DOI.
- arXiv ID.
- PMID.
- Semantic Scholar ID.
- OpenReview URL.
- Repository URL.
- Normalized title.

Keep the best source URL for each paper, plus alternate URLs when useful.

### 5. Filtering

For each candidate, decide:

- Include: directly matches the request.
- Maybe: adjacent, contextual, or useful but not central.
- Exclude: outside scope, duplicate, commentary-only, unavailable, or weakly relevant.

Give short reasons for maybe and excluded items when coverage matters.

## Output

Return Markdown with these sections:

````markdown
# Paper Discovery: <topic>

## Scope and Inclusion Criteria

## Search Queries

## Coverage Summary

- Included papers:
- Maybe relevant:
- Excluded / duplicates:
- Source families searched:
- Known coverage limitations:

## Included Papers

### 1. <title>

- Type:
- Status:
- Authors:
- Date / venue:
- Links:
- Identifiers:
- Inclusion reason:
- Discovery evidence:

## Maybe Relevant Papers

## Excluded Papers and Duplicates

## Paper DB JSONL

```jsonl
{"title":"","authors":[],"date":"","year":"","venue":"","status":"","identifiers":{"doi":"","pmid":"","arxiv":"","openreview":"","semantic_scholar":""},"urls":[],"abstract_or_summary":"","inclusion_decision":"include","inclusion_reason":"","exclusion_reason":"","evidence_depth":"metadata-only","quality_notes":""}
```
````

The `Paper DB JSONL` block is important. Downstream skills will use it as their paper list. Every included paper should appear there.

## Quality Gates

Before finalizing, verify:

- Multiple queries were used.
- At least two independent source families were searched when possible.
- The requested time window was searched.
- Each included paper has a link or stable identifier.
- Duplicate papers are collapsed.
- Maybe and excluded papers are not mixed into the included list.
- Coverage limitations are stated honestly.
