# Current design: compact teacher dashboard

The latest user direction (2026-11-03) keeps the laboratory theme as a restrained forest-green accent and identity only. Replace large chalkboards, paper note cards, decorative scenery and repeated stacked sections with a viewport-sized dashboard: class sidebar, persistent game tabs, four compact metrics, one evidence matrix and a contextual summary rail. Use Pretendard for data and headings; Gaegu only in the product mark.

Teacher starts at all-class overview. Selecting a class enters its student matrix for the current game directly. Keep the same arrangement for both games at both scope levels; the top game tabs change records, not the navigation or selected class. Retain explicit class/mission data boundaries and manual AI generation.

Fit key information into ordinary laptop screens. Size matrix pages from actual available height, use numbered previous/next controls and search for larger data sets, and show whole-scope totals independent of pagination/filtering. Do not claim every arbitrary-size class list or all raw answers fit simultaneously. Mobile and detailed records/reports may scroll. Preserve keyboard navigation, print reports, loading/error/empty states, reduced motion and live Sheet source.

Reuse existing TeacherModel/Scope/Insights/RecordUI and 21st-inspired heatmap/table primitives (prior metadata: Heat Map XL 2407, InlineAnalyticsTable 7475). 21st catalog search returned HTTP 401 during this task; no new external code was retrieved. Implement in native HTML/CSS/JS without a framework migration or private student data sent to design services.

Missing judgments are distinct from explicit false, rubric versions stay separate, and two-path steel-wool completion does not require every element. Clicking a cell opens the exact saved judgment reason and matching quote. Note pages 0/1/2 and older hint semantics stay separate.

Palette: forest board #2f5446/#1f3a30, neutral #f3f5f2 workspace, white panels, subdued green/amber cell states. No rankings or invented ability scores.
