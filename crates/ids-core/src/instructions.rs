use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, CoreResult};

pub const GLOBAL_KEY: &str = "global";
pub const PROJECTS_DIR: &str = "projects";
pub const PROJECT_TARGET_FILE: &str = "CLAUDE.local.md";
pub const GLOBAL_TARGET_FILE: &str = "CLAUDE.md";
pub const MAX_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstructionKey {
    Global,
    Project(String),
}

impl InstructionKey {
    pub fn parse(key: &str) -> CoreResult<Self> {
        if key == GLOBAL_KEY {
            return Ok(Self::Global);
        }
        match key.strip_prefix("projects/") {
            Some(name) if slug(name).as_deref() == Some(name) => Ok(Self::Project(name.to_string())),
            _ => Err(CoreError::Settings(format!("invalid instructions key: {key}"))),
        }
    }

    pub fn for_project(name: &str) -> Option<Self> {
        slug(name).map(Self::Project)
    }

    pub fn as_key(&self) -> String {
        match self {
            Self::Global => GLOBAL_KEY.to_string(),
            Self::Project(name) => format!("{PROJECTS_DIR}/{name}"),
        }
    }

    pub fn source(&self, root: &Path) -> PathBuf {
        match self {
            Self::Global => root.join(format!("{GLOBAL_KEY}.md")),
            Self::Project(name) => root.join(PROJECTS_DIR).join(format!("{name}.md")),
        }
    }
}

pub fn slug(name: &str) -> Option<String> {
    let mut out = String::new();
    for c in name.trim().to_lowercase().chars() {
        let keep = c.is_ascii_alphanumeric() || c == '.' || c == '_';
        if keep {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches(|c| c == '-' || c == '.');
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

pub fn global_target(home: &Path, claude_config_dir: Option<&str>) -> PathBuf {
    match claude_config_dir.filter(|s| !s.is_empty()) {
        Some(dir) => PathBuf::from(dir).join(GLOBAL_TARGET_FILE),
        None => home.join(".claude").join(GLOBAL_TARGET_FILE),
    }
}

pub fn project_target(project_dir: &Path) -> PathBuf {
    project_dir.join(PROJECT_TARGET_FILE)
}

pub fn import_line(source: &Path, home: Option<&Path>) -> String {
    let shown = match home.and_then(|h| source.strip_prefix(h).ok()) {
        Some(rest) => format!("~/{}", rest.to_string_lossy()),
        None => source.to_string_lossy().to_string(),
    };
    format!("@{}", shown.replace('\\', "/"))
}

fn read_optional(path: &Path) -> CoreResult<String> {
    match fs::read_to_string(path) {
        Ok(t) => Ok(t),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

fn write_atomic(path: &Path, content: &str, now_ms: i64) -> CoreResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut tmp_name = path.file_name().unwrap_or_default().to_os_string();
    tmp_name.push(format!(".ids-tmp-{now_ms}"));
    let tmp = path.with_file_name(tmp_name);
    fs::write(&tmp, content.as_bytes())?;
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })?;
    Ok(())
}

pub fn read(root: &Path, key: &InstructionKey) -> CoreResult<String> {
    read_optional(&key.source(root))
}

pub fn save(root: &Path, key: &InstructionKey, content: &str, now_ms: i64) -> CoreResult<()> {
    if content.len() > MAX_BYTES {
        return Err(CoreError::Settings("instructions file too large".into()));
    }
    write_atomic(&key.source(root), content, now_ms)
}

pub fn is_linked(target: &Path, line: &str) -> bool {
    read_optional(target).map(|t| t.lines().any(|l| l.trim() == line)).unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkOutcome {
    pub target: String,
    pub changed: bool,
    pub adopted: bool,
    pub kept_local: bool,
    pub backup: Option<String>,
}

fn backup_name(target: &Path, now_ms: i64) -> String {
    let parent = target.parent().and_then(Path::file_name).map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let file = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    format!("{parent}-{file}.{now_ms}.bak")
}

pub fn link(source: &Path, target: &Path, home: Option<&Path>, backup_dir: &Path, now_ms: i64) -> CoreResult<LinkOutcome> {
    let line = import_line(source, home);
    let current = read_optional(target)?;
    let mut outcome = LinkOutcome { target: target.to_string_lossy().to_string(), changed: false, adopted: false, kept_local: false, backup: None };
    if current.lines().any(|l| l.trim() == line) {
        return Ok(outcome);
    }

    let local = current.trim();
    let source_text = read_optional(source)?;
    let next = if local.is_empty() {
        format!("{line}\n")
    } else if source_text.trim().is_empty() {
        write_atomic(source, &format!("{local}\n"), now_ms)?;
        outcome.adopted = true;
        format!("{line}\n")
    } else if local == source_text.trim() {
        format!("{line}\n")
    } else {
        outcome.kept_local = true;
        format!("{}\n\n{line}\n", current.trim_end())
    };

    if !current.is_empty() {
        fs::create_dir_all(backup_dir)?;
        let backup = backup_dir.join(backup_name(target, now_ms));
        fs::copy(target, &backup)?;
        outcome.backup = Some(backup.to_string_lossy().to_string());
    }
    if !source.exists() {
        write_atomic(source, "", now_ms)?;
    }
    write_atomic(target, &next, now_ms)?;
    outcome.changed = true;
    Ok(outcome)
}

pub fn exclude_from_git(project_dir: &Path, file_name: &str) -> CoreResult<bool> {
    let git = project_dir.join(".git");
    if !git.is_dir() {
        return Ok(false);
    }
    let exclude = git.join("info").join("exclude");
    let current = read_optional(&exclude)?;
    if current.lines().any(|l| l.trim() == file_name || l.trim() == format!("/{file_name}")) {
        return Ok(false);
    }
    let separator = if current.is_empty() || current.ends_with('\n') { "" } else { "\n" };
    fs::create_dir_all(exclude.parent().unwrap_or(&git))?;
    fs::write(&exclude, format!("{current}{separator}{file_name}\n"))?;
    Ok(true)
}

pub fn project_files(root: &Path) -> CoreResult<Vec<String>> {
    let dir = root.join(PROJECTS_DIR);
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_suffix(".md")).map(str::to_string))
        .filter(|n| slug(n).as_deref() == Some(n.as_str()))
        .collect();
    names.sort();
    Ok(names)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionEntry {
    pub key: String,
    pub name: String,
    pub file: String,
    pub exists: bool,
    pub bytes: u64,
    pub project_path: Option<String>,
    pub target: Option<String>,
    pub linked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsOverview {
    pub root: String,
    pub global: InstructionEntry,
    pub projects: Vec<InstructionEntry>,
}

pub struct KnownProject {
    pub name: String,
    pub path: PathBuf,
}

fn entry(root: &Path, key: &InstructionKey, name: String, project_path: Option<&Path>, target: Option<PathBuf>, home: Option<&Path>) -> InstructionEntry {
    let source = key.source(root);
    let meta = fs::metadata(&source).ok();
    let line = import_line(&source, home);
    InstructionEntry {
        key: key.as_key(),
        name,
        file: source.to_string_lossy().to_string(),
        exists: meta.is_some(),
        bytes: meta.map(|m| m.len()).unwrap_or(0),
        project_path: project_path.map(|p| p.to_string_lossy().to_string()),
        linked: target.as_deref().is_some_and(|t| is_linked(t, &line)),
        target: target.map(|t| t.to_string_lossy().to_string()),
    }
}

pub fn overview(root: &Path, home: Option<&Path>, global_target: Option<PathBuf>, known: &[KnownProject]) -> CoreResult<InstructionsOverview> {
    let global = entry(root, &InstructionKey::Global, "Global".into(), None, global_target, home);
    let mut projects: Vec<InstructionEntry> = Vec::new();
    for p in known {
        let Some(key) = InstructionKey::for_project(&p.name) else { continue };
        if projects.iter().any(|e| e.key == key.as_key()) {
            continue;
        }
        let target = p.path.is_dir().then(|| project_target(&p.path));
        projects.push(entry(root, &key, p.name.clone(), Some(&p.path), target, home));
    }
    for name in project_files(root)? {
        let key = InstructionKey::Project(name.clone());
        if !projects.iter().any(|e| e.key == key.as_key()) {
            projects.push(entry(root, &key, name, None, None, home));
        }
    }
    Ok(InstructionsOverview { root: root.to_string_lossy().to_string(), global, projects })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_are_safe_file_names() {
        assert_eq!(slug("Ilha das Sombras").as_deref(), Some("ilha-das-sombras"));
        assert_eq!(slug("my_app.v2").as_deref(), Some("my_app.v2"));
        assert_eq!(slug("../etc/passwd").as_deref(), Some("etc-passwd"));
        assert_eq!(slug("..."), None);
        assert_eq!(slug(""), None);
    }

    #[test]
    fn keys_reject_traversal() {
        assert_eq!(InstructionKey::parse("global").unwrap(), InstructionKey::Global);
        assert_eq!(InstructionKey::parse("projects/ilha-das-sombras").unwrap(), InstructionKey::Project("ilha-das-sombras".into()));
        assert!(InstructionKey::parse("projects/../global").is_err());
        assert!(InstructionKey::parse("projects/").is_err());
        assert!(InstructionKey::parse("other").is_err());
    }

    #[test]
    fn import_line_uses_home_shortcut() {
        let home = Path::new("/home/u");
        assert_eq!(import_line(Path::new("/home/u/repo/instructions/global.md"), Some(home)), "@~/repo/instructions/global.md");
        assert_eq!(import_line(Path::new("/srv/instructions/global.md"), Some(home)), "@/srv/instructions/global.md");
    }

    #[test]
    fn save_and_read_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let key = InstructionKey::Project("app".into());
        assert_eq!(read(dir.path(), &key).unwrap(), "");
        save(dir.path(), &key, "# App\n", 1).unwrap();
        assert_eq!(read(dir.path(), &key).unwrap(), "# App\n");
        assert!(save(dir.path(), &key, &"x".repeat(MAX_BYTES + 1), 2).is_err());
    }

    #[test]
    fn link_adopts_existing_content_when_source_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let source = home.join("repo/instructions/global.md");
        let target = home.join(".claude/CLAUDE.md");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, "# Regras\nsempre pt-BR\n").unwrap();

        let out = link(&source, &target, Some(home), &home.join("backups"), 7).unwrap();
        assert!(out.changed && out.adopted && !out.kept_local);
        assert_eq!(fs::read_to_string(&source).unwrap(), "# Regras\nsempre pt-BR\n");
        assert_eq!(fs::read_to_string(&target).unwrap(), "@~/repo/instructions/global.md\n");
        assert_eq!(fs::read_to_string(out.backup.unwrap()).unwrap(), "# Regras\nsempre pt-BR\n");
        assert!(is_linked(&target, &import_line(&source, Some(home))));
    }

    #[test]
    fn link_keeps_local_content_that_differs() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("instructions/projects/app.md");
        let target = dir.path().join("app/CLAUDE.local.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&source, "shared rules\n").unwrap();
        fs::write(&target, "private notes\n").unwrap();

        let out = link(&source, &target, None, &dir.path().join("backups"), 3).unwrap();
        assert!(out.kept_local && !out.adopted);
        let text = fs::read_to_string(&target).unwrap();
        assert!(text.starts_with("private notes\n\n@"));
        assert_eq!(fs::read_to_string(&source).unwrap(), "shared rules\n");
    }

    #[test]
    fn link_is_idempotent_and_creates_missing_target() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("instructions/global.md");
        let target = dir.path().join("claude/CLAUDE.md");
        let first = link(&source, &target, None, &dir.path().join("b"), 1).unwrap();
        assert!(first.changed && first.backup.is_none());
        assert!(source.exists());
        let second = link(&source, &target, None, &dir.path().join("b"), 2).unwrap();
        assert!(!second.changed);
        assert_eq!(fs::read_to_string(&target).unwrap().matches('@').count(), 1);
    }

    #[test]
    fn identical_content_is_replaced_by_the_import() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("i/global.md");
        let target = dir.path().join("c/CLAUDE.md");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&source, "same\n").unwrap();
        fs::write(&target, "same").unwrap();
        let out = link(&source, &target, None, &dir.path().join("b"), 1).unwrap();
        assert!(!out.kept_local && !out.adopted && out.backup.is_some());
        assert_eq!(fs::read_to_string(&target).unwrap(), format!("{}\n", import_line(&source, None)));
    }

    #[test]
    fn git_exclude_is_appended_once() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!exclude_from_git(dir.path(), PROJECT_TARGET_FILE).unwrap());
        fs::create_dir_all(dir.path().join(".git/info")).unwrap();
        fs::write(dir.path().join(".git/info/exclude"), "# git ls-files\n*.tmp").unwrap();
        assert!(exclude_from_git(dir.path(), PROJECT_TARGET_FILE).unwrap());
        assert!(!exclude_from_git(dir.path(), PROJECT_TARGET_FILE).unwrap());
        assert_eq!(fs::read_to_string(dir.path().join(".git/info/exclude")).unwrap(), "# git ls-files\n*.tmp\nCLAUDE.local.md\n");
    }

    #[test]
    fn overview_merges_known_projects_and_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("instructions");
        let app_dir = dir.path().join("work/My App");
        fs::create_dir_all(&app_dir).unwrap();
        save(&root, &InstructionKey::Project("orphan".into()), "x", 1).unwrap();
        save(&root, &InstructionKey::Project("my-app".into()), "y", 1).unwrap();
        let known = [
            KnownProject { name: "My App".into(), path: app_dir.clone() },
            KnownProject { name: "my app".into(), path: dir.path().join("old/my app") },
            KnownProject { name: "gone".into(), path: dir.path().join("missing") },
        ];
        let o = overview(&root, None, Some(dir.path().join(".claude/CLAUDE.md")), &known).unwrap();
        let keys: Vec<&str> = o.projects.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, ["projects/my-app", "projects/gone", "projects/orphan"]);
        assert!(o.projects[0].exists && o.projects[0].target.is_some() && !o.projects[0].linked);
        assert!(o.projects[1].target.is_none());
        assert!(o.projects[2].project_path.is_none());
        assert!(!o.global.exists && !o.global.linked);

        let key = InstructionKey::Project("my-app".into());
        link(&key.source(&root), &project_target(&app_dir), None, &dir.path().join("b"), 2).unwrap();
        let o = overview(&root, None, None, &known).unwrap();
        assert!(o.projects[0].linked);
    }
}
