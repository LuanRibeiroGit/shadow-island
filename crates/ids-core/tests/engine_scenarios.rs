//! End-to-end scenarios for the engine, driven by realistic hook payloads
//! (`tests/fixtures/*.jsonl` at the repository root, shaped after the official
//! hooks reference). No real Claude Code session is needed.

use std::io::Write;
use std::path::PathBuf;

use ids_core::engine::{Engine, EngineConfig, Update};
use ids_core::event::Envelope;
use ids_core::model::{AgentSpecialty, AgentState};
use serde_json::{json, Value};

fn fixture(name: &str) -> Vec<Value> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures").join(name);
    std::fs::read_to_string(p)
        .unwrap()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

fn env(i: usize, payload: Value) -> Envelope {
    Envelope { v: 1, id: format!("env-{i}"), fired_at_ms: 1_000 + i as i64 * 10, payload }
}

fn run(engine: &mut Engine, payloads: &[Value]) -> Vec<Update> {
    let mut all = vec![];
    for (i, p) in payloads.iter().enumerate() {
        all.extend(engine.ingest(&env(i, p.clone())).unwrap().updates);
    }
    all
}

fn q<T: rusqlite::types::FromSql>(e: &Engine, sql: &str) -> T {
    e.conn().query_row(sql, [], |r| r.get(0)).unwrap()
}

#[test]
fn multi_agent_session_end_to_end() {
    let mut e = Engine::in_memory(EngineConfig::default()).unwrap();
    let payloads = fixture("session-multiagent.jsonl");
    run(&mut e, &payloads);

    // One main + three subagents, no duplicates.
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM agents"), 4);
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM agents WHERE is_main = 1"), 1);
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM agents WHERE parent_id = 'sess-0001#main'"), 3);

    // Specialties come from real agent_type metadata.
    let spec: String = q(&e, "SELECT specialty FROM agents WHERE agent_id = 'ag-explore-1'");
    assert_eq!(spec, "researcher");
    let spec: String = q(&e, "SELECT specialty FROM agents WHERE agent_id = 'ag-test-1'");
    assert_eq!(spec, "tester");
    let spec: String = q(&e, "SELECT specialty FROM agents WHERE agent_id = 'ag-dev-1'");
    assert_eq!(spec, "general");

    // Subagent tasks come from the Agent tool description.
    let task: String = q(&e, "SELECT task FROM agents WHERE agent_id = 'ag-explore-1'");
    assert_eq!(task, "Mapear rotas da API");

    // Test failure spawned a monster; the identical command later passed -> defeated.
    let (monster, status): (String, String) = e
        .conn()
        .query_row("SELECT monster, status FROM encounters", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(monster, "test_phantom");
    assert_eq!(status, "defeated");

    // Missions: prompt, task, 3 subagents, all completed.
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM missions"), 5);
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM missions WHERE status = 'completed'"), 5);

    // Session ended, all agents ended, nothing active in memory.
    assert!(q::<Option<i64>>(&e, "SELECT ended_at FROM sessions").is_some());
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM agents WHERE ended_at IS NULL"), 0);
    assert!(e.active_agents().is_empty());

    // Every event persisted, privacy: no file contents or full commands.
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM events") as usize, payloads.len());
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM events WHERE detail LIKE '%--%' OR data LIKE '%/home/dev%'"), 0);

    // Tool counts are per agent.
    assert_eq!(q::<i64>(&e, "SELECT tool_count FROM agent_statistics WHERE agent_id = 'sess-0001#ag-test-1'"), 2);
    assert_eq!(q::<i64>(&e, "SELECT tool_failures FROM agent_statistics WHERE agent_id = 'sess-0001#ag-test-1'"), 1);
}

#[test]
fn duplicate_envelopes_are_ignored() {
    let mut e = Engine::in_memory(EngineConfig::default()).unwrap();
    let p = json!({"session_id":"s","hook_event_name":"UserPromptSubmit","prompt":"x","cwd":"/p"});
    assert!(!e.ingest(&env(1, p.clone())).unwrap().duplicate);
    assert!(e.ingest(&env(1, p)).unwrap().duplicate);
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM missions"), 1);
}

#[test]
fn states_follow_real_events() {
    let mut e = Engine::in_memory(EngineConfig::default()).unwrap();
    let s = |ev: &str, extra: Value| {
        let mut v = json!({"session_id":"s","hook_event_name":ev,"cwd":"/p"});
        v.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        v
    };
    let steps = vec![
        (s("UserPromptSubmit", json!({"prompt":"x"})), AgentState::Running),
        (s("PreToolUse", json!({"tool_name":"Read","tool_input":{"file_path":"/p/a.rs"},"tool_use_id":"t1"})), AgentState::Reading),
        (s("PreToolUse", json!({"tool_name":"Edit","tool_input":{"file_path":"/p/a.rs"},"tool_use_id":"t2"})), AgentState::Coding),
        (s("PreToolUse", json!({"tool_name":"Bash","tool_input":{"command":"cargo build"},"tool_use_id":"t3"})), AgentState::Building),
        (s("PreToolUse", json!({"tool_name":"WebSearch","tool_input":{"query":"x"},"tool_use_id":"t4"})), AgentState::Exploring),
        (s("PreToolUse", json!({"tool_name":"Unknown","tool_input":{},"tool_use_id":"t5"})), AgentState::Running),
        (s("Notification", json!({"notification_type":"permission_prompt","message":"m"})), AgentState::Waiting),
        (s("StopFailure", json!({"error":"rate_limit"})), AgentState::Error),
        (s("UserPromptSubmit", json!({"prompt":"y"})), AgentState::Running),
        (s("Stop", json!({"background_tasks":[{"id":"b","type":"shell","status":"running"}]})), AgentState::Waiting),
        (s("UserPromptSubmit", json!({"prompt":"z"})), AgentState::Running),
        (s("Stop", json!({"background_tasks":[]})), AgentState::Success),
        (s("Notification", json!({"notification_type":"idle_prompt","message":"m"})), AgentState::Idle),
    ];
    for (i, (p, want)) in steps.into_iter().enumerate() {
        e.ingest(&env(i, p)).unwrap();
        assert_eq!(e.active_agents()[0].state, want, "step {i}");
    }
    let statuses: Vec<String> = {
        let mut st = e.conn().prepare("SELECT status FROM missions ORDER BY id").unwrap();
        st.query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
    };
    assert_eq!(statuses, vec!["error", "completed", "completed"]);
}

#[test]
fn out_of_order_async_delivery_is_tolerated() {
    let mut e = Engine::in_memory(EngineConfig::default()).unwrap();
    // Subagent tool event arrives before SubagentStart; Post before Pre.
    let evs = vec![
        json!({"session_id":"s","hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/a"},"tool_use_id":"t1","agent_id":"x","agent_type":"Explore"}),
        json!({"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/a"},"tool_use_id":"t1","agent_id":"x","agent_type":"Explore"}),
        json!({"session_id":"s","hook_event_name":"SubagentStart","agent_id":"x","agent_type":"Explore"}),
        json!({"session_id":"s","hook_event_name":"SubagentStop","agent_id":"x","agent_type":"Explore"}),
        // A late event for the finished subagent must not revive it.
        json!({"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Grep","tool_input":{},"tool_use_id":"t9","agent_id":"x","agent_type":"Explore"}),
    ];
    for (i, p) in evs.into_iter().enumerate() {
        e.ingest(&env(i, p)).unwrap();
    }
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM agents WHERE agent_id = 'x'"), 1);
    let st: String = q(&e, "SELECT state FROM agents WHERE agent_id = 'x'");
    assert_eq!(st, "SUCCESS");
    assert!(q::<Option<i64>>(&e, "SELECT ended_at FROM agents WHERE agent_id = 'x'").is_some());
    // The stale PreToolUse(t1) did not count as a second tool call.
    assert_eq!(q::<i64>(&e, "SELECT tool_count FROM agent_statistics WHERE agent_id = 's#x'"), 0);
}

#[test]
fn internal_subagent_stop_without_start_is_ignored() {
    let mut e = Engine::in_memory(EngineConfig::default()).unwrap();
    e.ingest(&env(1, json!({"session_id":"s","hook_event_name":"SubagentStop","agent_id":"internal","agent_type":""}))).unwrap();
    assert_eq!(q::<i64>(&e, "SELECT COUNT(*) FROM agents WHERE agent_id = 'internal'"), 0);
}

#[test]
fn unresolved_monster_retreats_instead_of_being_defeated() {
    let mut e = Engine::in_memory(EngineConfig::default()).unwrap();
    let evs = vec![
        json!({"session_id":"s","hook_event_name":"PostToolUseFailure","tool_name":"Bash","tool_input":{"command":"npm install left-pad"},"error":"npm ERR! could not resolve","is_interrupt":false}),
        json!({"session_id":"s","hook_event_name":"Stop","background_tasks":[]}),
    ];
    for (i, p) in evs.into_iter().enumerate() {
        e.ingest(&env(i, p)).unwrap();
    }
    let (m, st): (String, String) = e.conn().query_row("SELECT monster, status FROM encounters", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!(m, "dependency_dragon");
    assert_eq!(st, "retreated");
}

#[test]
fn specialty_overrides_from_settings() {
    let mut cfg = EngineConfig::default();
    cfg.specialty_overrides.insert("general-purpose".into(), AgentSpecialty::Developer);
    let mut e = Engine::in_memory(cfg).unwrap();
    e.ingest(&env(1, json!({"session_id":"s","hook_event_name":"SubagentStart","agent_id":"a","agent_type":"general-purpose"}))).unwrap();
    assert_eq!(e.active_agents().iter().find(|a| !a.is_main).unwrap().specialty, AgentSpecialty::Developer);
}

#[test]
fn usage_is_read_from_allowed_transcripts() {
    let dir = tempfile::tempdir().unwrap();
    let t = dir.path().join("s.jsonl");
    let mut f = std::fs::File::create(&t).unwrap();
    writeln!(f, r#"{{"type":"assistant","message":{{"id":"m1","model":"claude-x","usage":{{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":10}}}}}}"#).unwrap();
    let cfg = EngineConfig { transcript_roots: vec![dir.path().to_path_buf()], ..Default::default() };
    let mut e = Engine::in_memory(cfg).unwrap();
    let out = e
        .ingest(&env(1, json!({"session_id":"s","hook_event_name":"Stop","transcript_path":t.to_string_lossy(),"background_tasks":[]})))
        .unwrap();
    assert!(out.updates.iter().any(|u| matches!(u, Update::Usage { .. })));
    assert_eq!(q::<i64>(&e, "SELECT input_tokens FROM usage_records WHERE agent_id = 's#main'"), 100);

    // Outside the allowed roots: ignored.
    let other = tempfile::tempdir().unwrap();
    let t2 = other.path().join("x.jsonl");
    std::fs::copy(&t, &t2).unwrap();
    let mut e2 = Engine::in_memory(EngineConfig { transcript_roots: vec![dir.path().to_path_buf()], ..Default::default() }).unwrap();
    e2.ingest(&env(1, json!({"session_id":"s","hook_event_name":"Stop","transcript_path":t2.to_string_lossy()}))).unwrap();
    assert_eq!(q::<i64>(&e2, "SELECT COUNT(*) FROM usage_records"), 0);
}

#[test]
fn engine_state_survives_restart() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("ids.db");
    {
        let mut e = Engine::open(&db, EngineConfig::default()).unwrap();
        e.ingest(&env(1, json!({"session_id":"s","hook_event_name":"SubagentStart","agent_id":"a","agent_type":"Explore"}))).unwrap();
    }
    let e = Engine::open(&db, EngineConfig::default()).unwrap();
    assert_eq!(e.active_agents().len(), 2);
}
