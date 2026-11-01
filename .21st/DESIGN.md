# Current design: 선생님의 수업 기록장

Keep the main d4ae232 / PR #4 intro: laboratory background, framed chalk sign, potato/steel-wool silhouette keyrings and two mission entries. Add only subtle entry/sway motion and a teacher-recordbook link. Student mission starts remain the upstream version.

The teacher page uses that same lab background, wood-framed chalkboard, Gaegu display writing and warm pinned notes. Its default is the real connected Google Sheet. Primary actions use plain Korean: see class participation, read student answers, leave teaching notes. Participation/answer-present/answer-absent are clickable filters. Put raw first/final answers before event and keyword judgment details. Keep test data and automated QA separate from classroom figures.

21st references: inspected Bar Chart (28571) and Radar Chart (29837) earlier; the radar was not used. Current simplification was grounded in Onboarding Checklist search results 5587, 26526, 29442 (metadata only) to make the next action explicit. No additional component code retrieval, hosted generation or private data upload was used.

Colors match the main intro: ink #2b2a28, board #2f5446/#1f3a30, wood #8a6a45, chalk #f6f3ea, paper #fffdf8, brass #c99a3e. Motion: small keyring sway, paper entrance and dialog entrance; reduced-motion disables each.

2026-11-01 follow-up: replace the third manual-note step with an AI teaching assistant. Reuse the existing paper/board primitives; show observation plus evidence/alternative, ready-to-say questions and optional short activities. Manual plans remain collapsed underneath. Claude analysis runs only on demand; keep test/limited-record caveats visible and do not fabricate a result when no API key is configured.

2026-11-01 model correction: user selected GPT-6 Luna medium using the existing OpenAI key. Update the teacher badge and transmission copy to OpenAI; keep all class-scoped teaching UI unchanged.
