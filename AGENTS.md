# Project Instructions

## Project Memory

- Before changing the project, read the current decisions at the top of `docs/project-memory.md` and the history relevant to the task. Keep confirmed decisions there in the same change cycle.
- For result parsing, CAP, AMRAP, ranking or points, consult the `wod-ranking-scoring` skill when available and the "Regras atuais de resultados e pontuacao" section in project memory. The repository keeps these rules even when the personal skill is unavailable.
- The current consolidated rules supersede older historical entries. Do not restore the two-athlete minimum, prescription matching or proportional points. Later explicit user decisions can change these rules; update memory and relevant regression coverage together.
- For tab-loading performance, consult `docs/navegacao-abas.md`; preserve account isolation, invalidation after writes and fresh ranking reads.

## Commit Approval

- After making changes, finish the relevant verification and summarize the result, then ask the user whether to commit.
- Do not create a commit without the user's explicit approval for the current changes. Approval from a previous task does not authorize commits for new changes.
- If the user has already explicitly requested a commit for the current changes, proceed without asking again.
- Do not push or deploy unless the user has authorized those actions for the current changes.
