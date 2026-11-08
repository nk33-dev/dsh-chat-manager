# Third-party notices

| Component | Used for | License |
| --- | --- | --- |
| DeepSeek Harness / Cordis | Plugin host, slot registry, Remote gateway | MIT |
| React | Client rendering | MIT |
| Zod | Request and response validation | MIT |
| TypeScript, tsdown, Vitest | Build and tests | MIT / Apache-2.0 |

`react`, `react/jsx-runtime`, `zod`, and `@deepseek-ai/cordis` stay external in the client bundle: the Harness module loader supplies them. Nothing else is bundled into the shipped client.
