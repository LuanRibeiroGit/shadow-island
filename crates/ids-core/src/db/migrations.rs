//! Versioned schema migrations. Each entry runs once, in order, inside a
//! transaction; the applied version is tracked in `schema_migrations`.

pub const MIGRATIONS: &[(i64, &str)] = &[(1, V1)];

const V1: &str = r#"
CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
);

CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    cwd             TEXT,
    model           TEXT,
    source          TEXT,
    title           TEXT,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    end_reason      TEXT,
    last_event_at   INTEGER NOT NULL,
    transcript_path TEXT
);
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_project ON sessions(project_id);

CREATE TABLE agents (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id     TEXT REFERENCES agents(id) ON DELETE SET NULL,
    agent_id      TEXT,
    agent_type    TEXT,
    specialty     TEXT NOT NULL,
    is_main       INTEGER NOT NULL,
    name          TEXT NOT NULL,
    cwd           TEXT,
    state         TEXT NOT NULL,
    activity      TEXT,
    current_tool  TEXT,
    detail        TEXT,
    task          TEXT,
    room          TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    last_event    TEXT
);
CREATE INDEX idx_agents_session ON agents(session_id);
CREATE INDEX idx_agents_active ON agents(ended_at);

CREATE TABLE missions (
    id            INTEGER PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
    project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    kind          TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    completed_at  INTEGER,
    UNIQUE(session_id, kind, external_id)
);
CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_started ON missions(started_at);

CREATE TABLE events (
    id            INTEGER PRIMARY KEY,
    envelope_id   TEXT NOT NULL UNIQUE,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
    mission_id    INTEGER REFERENCES missions(id) ON DELETE SET NULL,
    event_name    TEXT NOT NULL,
    tool_name     TEXT,
    tool_use_id   TEXT,
    category      TEXT,
    detail        TEXT,
    is_failure    INTEGER NOT NULL DEFAULT 0,
    fired_at      INTEGER NOT NULL,
    received_at   INTEGER NOT NULL,
    data          TEXT
);
CREATE INDEX idx_events_session ON events(session_id, fired_at);
CREATE INDEX idx_events_agent ON events(agent_id, fired_at);
CREATE INDEX idx_events_fired ON events(fired_at);
CREATE INDEX idx_events_name ON events(event_name);

CREATE TABLE usage_records (
    message_id            TEXT PRIMARY KEY,
    session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id              TEXT REFERENCES agents(id) ON DELETE SET NULL,
    model                 TEXT,
    input_tokens          INTEGER NOT NULL DEFAULT 0,
    output_tokens         INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
    recorded_at           INTEGER NOT NULL
);
CREATE INDEX idx_usage_session ON usage_records(session_id);
CREATE INDEX idx_usage_agent ON usage_records(agent_id);
CREATE INDEX idx_usage_time ON usage_records(recorded_at);

CREATE TABLE agent_statistics (
    agent_id        TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    tool_count      INTEGER NOT NULL DEFAULT 0,
    tool_failures   INTEGER NOT NULL DEFAULT 0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    errors          INTEGER NOT NULL DEFAULT 0,
    monsters_defeated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE activity_history (
    id          INTEGER PRIMARY KEY,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    state       TEXT NOT NULL,
    category    TEXT,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER
);
CREATE INDEX idx_activity_agent ON activity_history(agent_id, started_at);
CREATE INDEX idx_activity_open ON activity_history(agent_id, ended_at);

CREATE TABLE encounters (
    id          INTEGER PRIMARY KEY,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    monster     TEXT NOT NULL,
    signature   TEXT NOT NULL,
    status      TEXT NOT NULL,
    opened_at   INTEGER NOT NULL,
    closed_at   INTEGER
);
CREATE INDEX idx_encounters_agent ON encounters(agent_id, status);

CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE characters (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE transcript_offsets (
    path        TEXT PRIMARY KEY,
    offset      INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
"#;
