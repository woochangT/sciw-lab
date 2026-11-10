CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  mission TEXT NOT NULL CHECK (mission IN ('m01','m02')),
  class_code TEXT NOT NULL,
  class_key TEXT NOT NULL,
  student_no TEXT NOT NULL,
  is_test INTEGER NOT NULL CHECK (is_test IN (0,1)),
  resume_key TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  progress TEXT NOT NULL DEFAULT 'explore',
  checkpoint TEXT CHECK (checkpoint IS NULL OR json_valid(checkpoint)),
  checkpoint_at TEXT,
  payload TEXT NOT NULL CHECK (json_valid(payload))
) STRICT;
CREATE INDEX sessions_class_mission ON sessions(class_key, is_test, mission, started_at);
CREATE INDEX sessions_resume ON sessions(mission, class_key, student_no, resume_key, started_at DESC, id DESC);

CREATE TABLE session_events (
  event_seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  quest TEXT,
  payload TEXT NOT NULL CHECK (json_valid(payload))
) STRICT;
CREATE INDEX events_by_session ON session_events(session_id, event_seq);
CREATE INDEX events_for_overview ON session_events(session_id, event_seq)
  WHERE quest IN ('studentInput','finalEvaluation','final','FINAL','clarify','hintView','professorSpeech');

CREATE TABLE write_receipts (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  id TEXT NOT NULL,
  PRIMARY KEY (session_id,id)
) WITHOUT ROWID;

CREATE TABLE ai_usage (
  bucket TEXT PRIMARY KEY,
  period INTEGER NOT NULL,
  count INTEGER NOT NULL
) STRICT;
CREATE TABLE class_reports (
  fingerprint TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload))
) STRICT;
