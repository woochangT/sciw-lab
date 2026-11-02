# Current design: multiple-class overview and evidence heatmaps

Preserve Woochang main intro, the forest lab backdrop, chalkboard and paper surfaces, Gaegu display, Pretendard body, and student game visual identity. The newest user direction (2026-11-03) starts teachers at a multi-class overview, since one teacher manages several classes. Never put a stepper or required grade/class selection gate in front of the overview.

The first screen shows recorded classes, answer progress and a class-by-element heatmap for a selected game. Grade and explicit test filters narrow the overview rather than block entry. Class rows/cards open that class's game summary; a heatmap cell can drill into its class/game analysis directly. Provide an obvious return to the whole-class overview. Keep classes in numeric grade/room order, not attainment rank.

Use percentages only for final-answer element judgments that exist under the selected criterion. Show met/assessed counts. Unsubmitted or unknown judgments are hatched and marked missing, distinct from an explicit 0%. Keep rubric 1.1, 1.2, keyword and unversioned records separate. Unversioned records are reference-only and cannot establish equal-criterion class differences. Inside game analysis, include a student heatmap that opens original answers and automatic judgment details.

Rubric 1.2 removes the previous card sorting task. Do not represent missing sorting logs as failure. New hintLevel values are professor note page exposure (0, 1, 2); version this interpretation and keep old hint-level semantics separate. Show missing exposure as missing. Store explicit note schema and zero exposure on new game starts.

Retain saved GPT-6 Luna medium teaching focus and printable reports in class/game analysis. Generate/regenerate is the only model trigger; page load, filtering, navigation and data refresh read source records or saved reports. Do not upload private source conversations, attachments or student records to design tools. No ability scores, student ranks or automatic prescriptions.

21st metadata references: Heat Map XL 2407 and InlineAnalyticsTable 7475 informed a matrix with numeric cell evidence and row drill-in. Adapt using the existing native HTML/CSS/JS primitives rather than importing a React dependency. Existing game summary cards and board/paper controls are reused. Preserve responsive table-only scrolling, keyboard focus, reduced motion, error/loading/empty states and source separation.

Tokens: ink #2b2a28, board #2f5446/#1f3a30, wood #8a6a45, chalk #f6f3ea, paper #fffdf8, brass #c99a3e. Use color and text together for cell meaning.
