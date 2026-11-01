# Current design: class selection, game selection, teaching report

Preserve Woochang main PR #4 intro, lab backdrop, chalkboard, mission silhouette keyrings and student game design. Teacher navigation now requires explicit grade/class selection and then a game choice before showing any dashboard. Read the existing 감자 and 강철솜 mission tabs; numerically sort recognized grade/class forms, group aliases such as 3-2 and 3학년 2반, and keep unrecognized/test codes explicit. Do not invent grades.

Inside the class overview, place a large chalkboard-style teaching headline and two-sentence focus before participation notes and student answers. AI teaching help has no separate nav tab. The primary action opens a saved detailed report. Include snapshot counts/bars, observations and alternatives, mission-specific experiment diagrams, ready-to-say questions, short activities and first/final answer excerpts. Provide a print stylesheet; printing is a user action.

Require explicit generate/regenerate clicks for any GPT-6 Luna medium request. Page load, grade/class/game selection, report navigation, source refresh and report restoration never call the LLM. Store each report in this browser, scoped by workbook/source/class/test/game/first-or-latest. New source data marks the report stale without replacing its frozen evidence. Regeneration retains the old report until a successful replacement.

21st inspiration: current metadata stepper search 29815, 772, 40065 grounded the visible class > game > records sequence. Reuse native project paper/board primitives and existing colors/fonts. No hosted generation, paid retrieval or private-data upload was needed. Earlier chart references 28571 and 29837 were inspected in prior work; no proficiency radar is used.

Tokens: ink #2b2a28, board #2f5446/#1f3a30, wood #8a6a45, chalk #f6f3ea, paper #fffdf8, brass #c99a3e. Gaegu display, Pretendard body. Keep responsive flow, keyboard focus, loading/error/empty states, test separation, no ability ranks and reduced-motion support.
