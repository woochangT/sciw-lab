# Current design: compact teacher dashboard

The latest user direction (2026-11-03) keeps the laboratory theme as a restrained forest-green accent and identity only. Replace large chalkboards, paper note cards, decorative scenery and repeated stacked sections with a viewport-sized dashboard: class sidebar, persistent game tabs, four compact metrics, one evidence matrix and a contextual summary rail. Use Pretendard for data and headings; Gaegu only in the product mark.

Teacher starts at a list of classes with submission progress; the class heatmap is one tab away. Selecting a class opens up to two teaching questions with groups of students who need to work on the same explanation element. Saved answer comparisons and the searchable answer list follow. Participation shows ordered game stages and evaluation status. Seven colored squares and the recognized proportion link to the focused student row in the Student Answer Analysis rubric. The game tabs preserve the current task and class. Keep manual AI generation and explicit class and mission boundaries.

Fit the class focus and participation summary into ordinary laptop screens. Keep search and pagination in the student and matrix views and show whole-scope totals independent of their filters. Mobile and detailed student records may scroll. Preserve keyboard navigation, loading and error states, reduced motion and the live Sheet source.

Reuse existing TeacherModel/Scope/Insights/RecordUI and 21st-inspired heatmap/table primitives (prior metadata: Heat Map XL 2407, InlineAnalyticsTable 7475). 21st catalog search returned HTTP 401 during this task; no new external code was retrieved. Implement in native HTML/CSS/JS without a framework migration or private student data sent to design services.

Missing judgments are distinct from explicit false, rubric versions stay separate, and two-path steel-wool completion does not require every element. Clicking a cell opens the exact saved judgment reason and matching quote. Note pages 0/1/2 and older hint semantics stay separate.

Palette: forest board #2f5446/#1f3a30, neutral #f3f5f2 workspace, white panels, subdued green/amber cell states. No rankings or invented ability scores.
