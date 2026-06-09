CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  map_id TEXT NOT NULL,
  player_name TEXT NOT NULL,

  best_distance INTEGER NOT NULL DEFAULT 0,
  best_finished INTEGER NOT NULL DEFAULT 0,
  best_elapsed_ms INTEGER,
  best_reason TEXT,
  best_at TEXT,

  last_distance INTEGER NOT NULL DEFAULT 0,
  last_finished INTEGER NOT NULL DEFAULT 0,
  last_elapsed_ms INTEGER,
  last_reason TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(map_id, player_name)
);

CREATE INDEX IF NOT EXISTS idx_scores_map_rank
ON scores (
  map_id,
  best_finished DESC,
  best_elapsed_ms ASC,
  best_distance DESC
);
