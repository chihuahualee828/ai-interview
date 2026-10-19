[![ENGLISH](https://img.shields.io/badge/ENGLISH-456956?style=flat-square)](README.md) [![繁體中文](https://img.shields.io/badge/%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87-737C75?style=flat-square)](README.zh-TW.md)

# Recall — AI Interview Cards

Recall is an **AI interview question bank** and an independent community edition of [AI Engineering Interview Questions Company Wise](https://github.com/pallavi-shekhar/ai-engineering-interview-questions-company-wise). It provides a multilingual static website and uses LLMs to condense source materials into structured study answers. GitHub Actions automatically tracks upstream changes and updates the question bank.

**Many questions still lack answers or need more complete explanations.** Everyone is welcome to discuss approaches and help improve them. To participate, open the [website](https://hikari-tsai.github.io/ai-interview/), find a question, and use **Discuss this question** below the card to enter its discussion area.

Practice one question at a time, ask for a hint, and reveal an answer organized around **Principle → Trade-off → Implementation → Production**.

## Features

- Traditional Chinese, English, and Japanese interfaces and study content.
- Sequential or non-repeating random practice within your selected filters.
- Filter by topic tags, company, keywords, or answer availability.
- Original questions and source links alongside AI-assisted explanations.
- Incremental GitHub Actions updates that process changed content and retry pending work.

Built with Astro and TypeScript. The website is fully static; model calls happen only during content generation. Interface translations live in `lang/`.

## Get started

Requires Node.js 22.12 or later and npm.

```sh
npm ci
npm run dev
```

Open [the local website](http://127.0.0.1:4321).

The dataset contains **598 questions**. Select **With answers** to practice questions with an answer in the current language. Answers are rewritten from the original question and linked article text, not expanded from an earlier short answer. Traditional Chinese explanations target roughly **2,000 characters**, with equivalent detail in English and Japanese. Questions without readable original explanations remain pending.

See the [maintenance and deployment guide](docs/maintenance.md) for setup, synchronization, and GitHub Pages deployment.

## Project structure

```text
.
├── .github/
│   ├── workflows/
│   │   ├── update-and-deploy.yml      # Scheduled dataset import, build, and deployment
│   │   └── validate-contribution.yml  # PR checks without model secrets or deployment
│   ├── ISSUE_TEMPLATE/               # Answer contribution forms
│   ├── DISCUSSION_TEMPLATE/          # Question discussion forms
│   ├── pull_request_template.md      # Contribution and review checklist
│   └── CODEOWNERS                    # Maintainer review assignments
├── content/community/                # Human-authored Markdown answers, one file per language
├── data/
│   ├── questions/                    # Imported questions, stable IDs, tags, and source links
│   ├── answers/                      # Generated answers and hints in three languages
│   ├── sources/                      # Public source metadata and content hashes, not article text
│   ├── state/                        # Upstream sync progress and generation retry state
│   └── overrides/                    # Optional pinned JSON overrides for maintainers
├── lang/                             # Interface text: zh-TW.json, en.json, ja.json
├── src/
│   ├── pages/                        # Astro routes, question pages, and the public catalog
│   ├── components/                   # Cards, filters, sources, contribution entries, and share metadata
│   ├── client/                       # Browser interactions and navigation
│   ├── lib/                          # Catalog loading, community content, filters, and localization
│   ├── styles/                       # Shared website styles
│   └── config/                       # Project repository configuration
├── scripts/
│   ├── sync.ts                       # Import changed upstream questions and refresh sources
│   ├── generate.ts                   # Generate or retry source-grounded AI answers
│   ├── validate.ts                   # Validate questions, answers, community files, and translations
│   └── lib/                          # Parsing, source extraction, prompts, hashes, and file utilities
├── public/                           # Static assets, favicon, and social-sharing cover
├── tests/                            # Unit and pipeline tests; e2e/ contains browser tests
├── docs/                             # Architecture, maintenance, and design documentation
├── licenses/                         # Preserved upstream license
├── CONTRIBUTING.md                   # Community answer format and submission workflow
├── .env.example                      # Example local generation settings, without credentials
├── astro.config.mjs                  # Static site URL, base path, and build configuration
├── package.json                      # Dependencies and development commands
├── LICENSE                           # Project Apache-2.0 license
└── NOTICE                            # Attribution and modification notices
```

To contribute an answer, add or edit `content/community/Qxxxx/<locale>.md` following [CONTRIBUTING.md](CONTRIBUTING.md). Community answers take priority in their language and are not overwritten by the generator. Use `lang/` for interface wording and `src/components/` for card layout changes.

`dist/` contains the generated website, and `.private/` holds local article snapshots and temporary working files. Both are excluded from Git.

## Contribute an answer

Each card offers **Discuss this question**, **Suggest an answer or fix**, and **Edit the answer**. Use [Discussions](https://github.com/Hikari-Tsai/ai-interview/discussions) to compare approaches, an Issue form to submit text without Git knowledge, or a PR to edit a community Markdown answer. Contributions in any one of the three languages are welcome, including answers to currently pending questions.

Community answers are stored separately from AI output and take priority in their language. Scheduled generation never overwrites them. Maintainers review and merge contributions before the site automatically rebuilds. See the [contribution guide](CONTRIBUTING.md).

## Automatic updates

The [GitHub Actions workflow](.github/workflows/update-and-deploy.yml) runs daily at **02:17 UTC / 10:17 Taiwan time** and can also be started manually from the Actions tab.

- Imports prepared questions, multilingual answers, source metadata and editorial overrides from one pinned commit of [Hikari-Tsai/ai-interview](https://github.com/Hikari-Tsai/ai-interview). The original question provenance remains attributed to pallavi-shekhar/Outcome School.
- Validates a temporary copy using this fork’s validator, interface translations and community contributions before replacing data. It does not independently refresh source articles, generate answers or change upstream answer statuses.
- Validates data, runs tests, and commits updated records. When site content changes, it rebuilds and deploys to GitHub Pages if deployment is enabled.
- Uses deterministic commit summaries with `--no-llm`. No LLM API key or model settings are required, and no model requests are made by the workflow.

The page footer shows the latest recorded question sync or answer generation time in **UTC+8**. Reloading the page does not change this timestamp. Push-triggered runs validate and build the committed dataset; scheduled and manual runs import the latest Hikari snapshot first.

Configure GitHub Pages and optional Supabase login as described in the [maintenance guide](docs/maintenance.md). See [dataset synchronization](docs/hikari-data-sync.md) for the import boundary, local override handling and failure recovery. Your fork receives new answers when Hikari publishes them; answers still missing or stale upstream retain that status.

## Sources and acknowledgments

The question collection comes from [AI Engineering Interview Questions Company Wise](https://github.com/pallavi-shekhar/ai-engineering-interview-questions-company-wise), hosted under the `pallavi-shekhar` GitHub account. Its README credits **Outcome School** and carries the notice `Copyright (C) 2026 Outcome School`. Thank you to Outcome School and the upstream maintainers and contributors for collecting and organizing the questions and answer links.

Recall imports question text, company/topic groupings, and available answer text or links from that README. Each card preserves a link to the original repository and a commit-pinned source location so readers can check the version used. The original question collection is not authored by this project.

The linked explanations are separate sources, including Outcome School articles and other authors' articles or videos. Credit for those explanations belongs to their respective authors. Cards retain the original explanation links; where supported, the generator reads linked articles to prepare study notes. Full article text is not published in this repository or on the website.

This project adds structured question records, stable question numbers, tags, the flashcard interface, translations, and incremental update automation. It also adds AI-assisted hints and explanations organized around Principle, Trade-off, Implementation, and Production. These notes may contain supplemental examples or recommendations and may contain errors; they are not quotations or official answers approved by the source authors or named companies. Company labels come from the upstream collection and do not imply affiliation or endorsement.

## License

Original project code, documentation, and original contributions are licensed under the [Apache License, Version 2.0](LICENSE), copyright © 2026 Hikari Tsai.

Imported upstream material retains its Apache-2.0 license and original attribution. An unchanged copy of the upstream license is preserved in [licenses/upstream-Apache-2.0.txt](licenses/upstream-Apache-2.0.txt). See [NOTICE](NOTICE) for copyright notices, source attribution, and a description of this project's modifications.

External articles, videos, and other third-party content retain their respective licenses and terms. A link in the upstream README does not make the linked work Apache-2.0, and this project's license does not grant additional rights to it. Dependencies retain their own licenses.

## Optional private answers

GitHub sign-in can sync private personal answers through Supabase while public study and community contributions remain available without login. See [setup, RLS and security checks](docs/personal-answer-sync.md). No private credentials belong in the static site.
