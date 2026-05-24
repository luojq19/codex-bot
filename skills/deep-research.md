# Deep Research Skill

You write a survey-style research report from a discovered paper list. This skill is downstream of `paper-discovery`.

Use `paper_discovery.md` in the workspace as the primary paper list when it is available. Do not redo broad paper discovery unless the upstream list is clearly inadequate. Your job is to read, compare, synthesize, and explain the research landscape.

## Objective

Produce a comprehensive survey-style report that helps the user understand:

1. What the research area is about.
2. Which papers define the area.
3. How the papers relate to each other.
4. What methods, benchmarks, datasets, and assumptions are common.
5. What the main trends, disagreements, gaps, and future directions are.

Unlike `literature-briefing`, the main body here is cross-paper synthesis. Still preserve enough per-paper detail to support the synthesis.

## Workflow

### 1. Read the Paper List

Use the included papers from `paper_discovery.md`. Preserve links, identifiers, peer-review status, and inclusion reasons.

If the paper list has serious gaps, run targeted follow-up searches and label them as follow-up discovery.

### 2. Deep Reading

For the most important papers, read the best available source: full text, official HTML, PDF, accepted paper page, appendix, project page, benchmark page, and official code.

For each key paper, extract:

- Problem.
- Contribution.
- Method.
- Experimental setup.
- Main results.
- Limitations.
- Relation to other papers.

### 3. Taxonomy

Organize the area into useful categories. Depending on the topic, categories may be:

- Method families.
- Task definitions.
- Benchmark families.
- Data sources.
- Agent/system architectures.
- Evaluation protocols.
- Application domains.
- Chronological waves.

### 4. Comparative Analysis

Compare papers across:

- Assumptions.
- Methods.
- Datasets.
- Metrics.
- Strengths.
- Weaknesses.
- Reproducibility and code availability.
- Practical usefulness.

### 5. Gaps and Research Directions

Identify:

- Missing evaluations.
- Fragile assumptions.
- Dataset or benchmark blind spots.
- Open technical problems.
- Promising next experiments.
- Papers the user should read first.

## Output

Return Markdown with this structure:

```markdown
# Deep Research Report: <topic>

## Scope and Source Base

## Executive Summary

## Research Landscape

## Taxonomy of Approaches

## Key Papers and What They Contribute

## Comparative Tables

## Methods and Benchmarks

## Code, Data, and Reproducibility

## Limitations of Current Literature

## Open Problems and Future Directions

## Recommended Reading Path

## References
```

Use tables where they clarify comparisons. Every important claim should be traceable to a paper or source in the discovered paper list.

## Quality Gates

Before finalizing, verify:

- The report is a survey-style synthesis, not just a list of isolated paper summaries.
- The source base comes from `paper_discovery.md` or a clearly described follow-up discovery pass.
- Preprints and peer-reviewed papers are distinguished.
- Important claims are source-grounded.
- Gaps and limitations are explicit.
- Recommended reading path is practical.
