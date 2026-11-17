use std::path::{Path, PathBuf};

use ids_core::db::now_ms;
use ids_core::db::queries as q;
use ids_core::instructions::{self as ins, InstructionKey, InstructionsOverview, KnownProject, LinkOutcome};
use tauri::State;

use super::{conn, err, CmdResult};
use crate::platform::home_dir;
use crate::state::AppState;

const NOT_CONFIGURED: &str = "Escolha a pasta das instruções antes de continuar.";

fn root(state: &AppState) -> Option<PathBuf> {
    let configured = state.backend_settings().instructions.dir;
    let configured = configured.trim();
    if !configured.is_empty() {
        return Some(PathBuf::from(configured));
    }
    if cfg!(debug_assertions) {
        return Path::new(env!("CARGO_MANIFEST_DIR")).ancestors().nth(3).map(|repo| repo.join("instructions"));
    }
    None
}

fn global_target() -> Option<PathBuf> {
    let home = home_dir()?;
    let cfg = std::env::var("CLAUDE_CONFIG_DIR").ok();
    Some(ins::global_target(&home, cfg.as_deref()))
}

fn known_projects(state: &State<'_, AppState>) -> CmdResult<Vec<KnownProject>> {
    let rows = q::projects(&*conn(state)?).map_err(err)?;
    Ok(rows.into_iter().map(|p| KnownProject { name: p.name, path: PathBuf::from(p.path) }).collect())
}

fn parse_key(key: &str) -> CmdResult<InstructionKey> {
    InstructionKey::parse(key).map_err(err)
}

#[tauri::command]
pub fn instructions_overview(state: State<'_, AppState>) -> CmdResult<Option<InstructionsOverview>> {
    let Some(root) = root(&state) else { return Ok(None) };
    let known = known_projects(&state)?;
    let home = home_dir();
    ins::overview(&root, home.as_deref(), global_target(), &known).map(Some).map_err(err)
}

#[tauri::command]
pub fn instructions_read(state: State<'_, AppState>, key: String) -> CmdResult<String> {
    let root = root(&state).ok_or(NOT_CONFIGURED)?;
    ins::read(&root, &parse_key(&key)?).map_err(err)
}

#[tauri::command]
pub fn instructions_save(state: State<'_, AppState>, key: String, content: String) -> CmdResult<()> {
    let root = root(&state).ok_or(NOT_CONFIGURED)?;
    ins::save(&root, &parse_key(&key)?, &content, now_ms()).map_err(err)?;
    log::info!("instructions saved: {key}");
    Ok(())
}

#[tauri::command]
pub fn instructions_link(state: State<'_, AppState>, key: String) -> CmdResult<LinkOutcome> {
    let root = root(&state).ok_or(NOT_CONFIGURED)?;
    let parsed = parse_key(&key)?;
    let project_dir = match &parsed {
        InstructionKey::Global => None,
        InstructionKey::Project(name) => Some(
            known_projects(&state)?
                .into_iter()
                .find(|p| ins::slug(&p.name).as_deref() == Some(name.as_str()) && p.path.is_dir())
                .map(|p| p.path)
                .ok_or("A pasta deste projeto não foi encontrada nesta máquina.")?,
        ),
    };
    let target = match &project_dir {
        Some(dir) => ins::project_target(dir),
        None => global_target().ok_or("pasta do usuário não encontrada")?,
    };
    let home = home_dir();
    let outcome = ins::link(&parsed.source(&root), &target, home.as_deref(), &state.data_dir.join("backups"), now_ms()).map_err(err)?;
    if let Some(dir) = &project_dir {
        if let Err(e) = ins::exclude_from_git(dir, ins::PROJECT_TARGET_FILE) {
            log::warn!("could not add {} to git exclude: {e}", ins::PROJECT_TARGET_FILE);
        }
    }
    log::info!("instructions linked: {key} (changed: {}, adopted: {}, kept local: {})", outcome.changed, outcome.adopted, outcome.kept_local);
    Ok(outcome)
}
