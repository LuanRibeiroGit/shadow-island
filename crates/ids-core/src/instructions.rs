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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum InstructionCategory {
    #[serde(rename = "pessoal")]
    Personal,
    #[serde(rename = "trabalho")]
    Work,
}

impl InstructionCategory {
    pub const ALL: [Self; 2] = [Self::Personal, Self::Work];

    pub fn dir(self) -> &'static str {
        match self {
            Self::Personal => "pessoal",
            Self::Work => "trabalho",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Personal => "Pessoal",
            Self::Work => "Trabalho",
        }
    }

    pub fn from_dir(dir: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|c| c.dir() == dir)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstructionKey {
    Global,
    Category(InstructionCategory),
    Project(InstructionCategory, String),
}

impl InstructionKey {
    pub fn parse(key: &str) -> CoreResult<Self> {
        let invalid = || CoreError::Settings(format!("invalid instructions key: {key}"));
        if key == GLOBAL_KEY {
            return Ok(Self::Global);
        }
        let parts: Vec<&str> = key.split('/').collect();
        match parts.as_slice() {
            [dir, file] if dir == file => InstructionCategory::from_dir(dir).map(Self::Category).ok_or_else(invalid),
            [dir, PROJECTS_DIR, name] if slug(name).as_deref() == Some(*name) => {
                InstructionCategory::from_dir(dir).map(|c| Self::Project(c, name.to_string())).ok_or_else(invalid)
            }
            _ => Err(invalid()),
        }
    }

    pub fn for_project(category: InstructionCategory, name: &str) -> Option<Self> {
        slug(name).map(|s| Self::Project(category, s))
    }

    pub fn as_key(&self) -> String {
        match self {
            Self::Global => GLOBAL_KEY.to_string(),
            Self::Category(c) => format!("{0}/{0}", c.dir()),
            Self::Project(c, name) => format!("{}/{PROJECTS_DIR}/{name}", c.dir()),
        }
    }

    pub fn source(&self, root: &Path) -> PathBuf {
        match self {
            Self::Global => root.join(format!("{GLOBAL_KEY}.md")),
            Self::Category(c) => root.join(c.dir()).join(format!("{}.md", c.dir())),
            Self::Project(c, name) => root.join(c.dir()).join(PROJECTS_DIR).join(format!("{name}.md")),
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

fn import_path(line: &str, home: Option<&Path>) -> Option<PathBuf> {
    let raw = line.trim().strip_prefix('@')?;
    match raw.strip_prefix("~/") {
        Some(rest) => home.map(|h| h.join(rest)),
        None => Some(PathBuf::from(raw)),
    }
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

pub fn with_category_import(text: &str, root: &Path, category: InstructionCategory, home: Option<&Path>) -> String {
    let own = import_line(&InstructionKey::Category(category).source(root), home);
    let others: Vec<PathBuf> = InstructionCategory::ALL.into_iter().filter(|c| *c != category).map(|c| InstructionKey::Category(c).source(root)).collect();
    let is_other = |l: &str| import_path(l, home).is_some_and(|p| others.contains(&p));
    let mut has_own = text.lines().any(|l| l.trim() == own);
    if has_own && !text.lines().any(is_other) {
        return text.to_string();
    }
    let mut lines: Vec<String> = Vec::new();
    for l in text.lines() {
        if is_other(l) {
            if !has_own {
                lines.push(own.clone());
                has_own = true;
            }
            continue;
        }
        lines.push(l.to_string());
    }
    if !has_own {
        lines.insert(0, own);
    }
    let mut out = lines.join("\n");
    if text.is_empty() || text.ends_with('\n') || lines.len() == 1 {
        out.push('\n');
    }
    out
}

fn ensure_category_import(root: &Path, key: &InstructionKey, home: Option<&Path>, now_ms: i64) -> CoreResult<()> {
    let InstructionKey::Project(category, _) = key else { return Ok(()) };
    let source = key.source(root);
    let current = read_optional(&source)?;
    let next = with_category_import(&current, root, *category, home);
    if next != current || !source.exists() {
        write_atomic(&source, &next, now_ms)?;
    }
    Ok(())
}

pub fn read(root: &Path, key: &InstructionKey) -> CoreResult<String> {
    read_optional(&key.source(root))
}

pub fn save(root: &Path, key: &InstructionKey, content: &str, home: Option<&Path>, now_ms: i64) -> CoreResult<()> {
    if content.len() > MAX_BYTES {
        return Err(CoreError::Settings("instructions file too large".into()));
    }
    let content = match key {
        InstructionKey::Project(category, _) => with_category_import(content, root, *category, home),
        _ => content.to_string(),
    };
    write_atomic(&key.source(root), &content, now_ms)
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

fn without_stale_imports(text: &str, root: &Path, source: &Path, home: Option<&Path>) -> String {
    let stale = |l: &str| import_path(l, home).is_some_and(|p| p != source && p.starts_with(root));
    if !text.lines().any(stale) {
        return text.to_string();
    }
    let kept: Vec<&str> = text.lines().filter(|l| !stale(l)).collect();
    let joined = kept.join("\n");
    let trimmed = joined.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}\n")
    }
}

pub fn link(source: &Path, target: &Path, home: Option<&Path>, backup_dir: &Path, now_ms: i64) -> CoreResult<LinkOutcome> {
    link_cleaning(source, target, None, home, backup_dir, now_ms)
}

pub fn link_key(root: &Path, key: &InstructionKey, target: &Path, home: Option<&Path>, backup_dir: &Path, now_ms: i64) -> CoreResult<LinkOutcome> {
    if let InstructionKey::Category(_) = key {
        return Err(CoreError::Settings("category instructions cannot be linked".into()));
    }
    let stale_root = matches!(key, InstructionKey::Project(..)).then_some(root);
    let outcome = link_cleaning(&key.source(root), target, stale_root, home, backup_dir, now_ms)?;
    ensure_category_import(root, key, home, now_ms)?;
    Ok(outcome)
}

fn link_cleaning(source: &Path, target: &Path, stale_root: Option<&Path>, home: Option<&Path>, backup_dir: &Path, now_ms: i64) -> CoreResult<LinkOutcome> {
    let line = import_line(source, home);
    let original = read_optional(target)?;
    let current = match stale_root {
        Some(root) => without_stale_imports(&original, root, source, home),
        None => original.clone(),
    };
    let mut outcome = LinkOutcome { target: target.to_string_lossy().to_string(), changed: false, adopted: false, kept_local: false, backup: None };
    let already = current.lines().any(|l| l.trim() == line);
    if already && current == original {
        return Ok(outcome);
    }

    let local = current.trim();
    let source_text = read_optional(source)?;
    let next = if already {
        current.clone()
    } else if local.is_empty() {
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

    if !original.is_empty() {
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

pub fn project_files(root: &Path) -> CoreResult<Vec<(InstructionCategory, String)>> {
    let mut found = Vec::new();
    for category in InstructionCategory::ALL {
        let dir = root.join(category.dir()).join(PROJECTS_DIR);
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) if e.kind() == ErrorKind::NotFound => continue,
            Err(e) => return Err(e.into()),
        };
        let mut names: Vec<String> = entries
            .filter_map(Result::ok)
            .filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_suffix(".md")).map(str::to_string))
            .filter(|n| slug(n).as_deref() == Some(n.as_str()))
            .collect();
        names.sort();
        found.extend(names.into_iter().map(|n| (category, n)));
    }
    Ok(found)
}

pub fn project_category(root: &Path, name: &str) -> Option<InstructionCategory> {
    InstructionCategory::ALL.into_iter().find(|c| InstructionKey::for_project(*c, name).is_some_and(|k| k.source(root).is_file()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionEntry {
    pub key: String,
    pub name: String,
    pub slug: Option<String>,
    pub category: Option<InstructionCategory>,
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
    pub categories: Vec<InstructionEntry>,
    pub projects: Vec<InstructionEntry>,
}

pub struct KnownProject {
    pub name: String,
    pub path: PathBuf,
}

pub fn repo_root(path: &Path) -> Option<PathBuf> {
    path.ancestors().find(|dir| dir.join(".git").exists()).map(Path::to_path_buf)
}

pub fn repo_projects(known: Vec<KnownProject>) -> Vec<KnownProject> {
    let mut out: Vec<KnownProject> = Vec::new();
    for p in known {
        let Some(root) = repo_root(&p.path) else { continue };
        if out.iter().any(|o| o.path == root) {
            continue;
        }
        let name = root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(p.name);
        out.push(KnownProject { name, path: root });
    }
    out
}

fn entry(root: &Path, key: &InstructionKey, name: String, project_path: Option<&Path>, target: Option<PathBuf>, home: Option<&Path>) -> InstructionEntry {
    let source = key.source(root);
    let meta = fs::metadata(&source).ok();
    let line = import_line(&source, home);
    let (slug, category) = match key {
        InstructionKey::Global => (None, None),
        InstructionKey::Category(c) => (None, Some(*c)),
        InstructionKey::Project(c, s) => (Some(s.clone()), Some(*c)),
    };
    InstructionEntry {
        key: key.as_key(),
        name,
        slug,
        category,
        file: source.to_string_lossy().to_string(),
        exists: meta.is_some(),
        bytes: meta.map(|m| m.len()).unwrap_or(0),
        project_path: project_path.map(|p| p.to_string_lossy().to_string()),
        linked: target.as_deref().is_some_and(|t| is_linked(t, &line)),
        target: target.map(|t| t.to_string_lossy().to_string()),
    }
}

fn unclassified_entry(slug: String, name: String, project_path: &Path, target: Option<PathBuf>) -> InstructionEntry {
    InstructionEntry {
        key: format!("{PROJECTS_DIR}/{slug}"),
        name,
        slug: Some(slug),
        category: None,
        file: String::new(),
        exists: false,
        bytes: 0,
        project_path: Some(project_path.to_string_lossy().to_string()),
        linked: false,
        target: target.map(|t| t.to_string_lossy().to_string()),
    }
}

pub fn overview(root: &Path, home: Option<&Path>, global_target: Option<PathBuf>, known: &[KnownProject]) -> CoreResult<InstructionsOverview> {
    let global = entry(root, &InstructionKey::Global, "Global".into(), None, global_target, home);
    let categories = InstructionCategory::ALL.into_iter().map(|c| entry(root, &InstructionKey::Category(c), c.label().into(), None, None, home)).collect();
    let mut projects: Vec<InstructionEntry> = Vec::new();
    for p in known {
        let Some(name_slug) = slug(&p.name) else { continue };
        if projects.iter().any(|e| e.slug.as_deref() == Some(name_slug.as_str())) {
            continue;
        }
        let target = p.path.is_dir().then(|| project_target(&p.path));
        match project_category(root, &name_slug) {
            Some(c) => projects.push(entry(root, &InstructionKey::Project(c, name_slug), p.name.clone(), Some(&p.path), target, home)),
            None => projects.push(unclassified_entry(name_slug, p.name.clone(), &p.path, target)),
        }
    }
    for (category, name) in project_files(root)? {
        let key = InstructionKey::Project(category, name.clone());
        if !projects.iter().any(|e| e.key == key.as_key()) {
            projects.push(entry(root, &key, name, None, None, home));
        }
    }
    Ok(InstructionsOverview { root: root.to_string_lossy().to_string(), global, categories, projects })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PERSONAL: InstructionCategory = InstructionCategory::Personal;
    const WORK: InstructionCategory = InstructionCategory::Work;

    #[test]
    fn slugs_are_safe_file_names() {
        assert_eq!(slug("Ilha das Sombras").as_deref(), Some("ilha-das-sombras"));
        assert_eq!(slug("my_app.v2").as_deref(), Some("my_app.v2"));
        assert_eq!(slug("../etc/passwd").as_deref(), Some("etc-passwd"));
        assert_eq!(slug("..."), None);
        assert_eq!(slug(""), None);
    }

    #[test]
    fn keys_round_trip_through_the_folder_layout() {
        let cases = [
            ("global", InstructionKey::Global),
            ("pessoal/pessoal", InstructionKey::Category(PERSONAL)),
            ("trabalho/trabalho", InstructionKey::Category(WORK)),
            ("pessoal/projects/ilha-das-sombras", InstructionKey::Project(PERSONAL, "ilha-das-sombras".into())),
            ("trabalho/projects/bankeiro", InstructionKey::Project(WORK, "bankeiro".into())),
        ];
        let root = Path::new("/r");
        for (text, key) in cases {
            assert_eq!(InstructionKey::parse(text).unwrap(), key);
            assert_eq!(key.as_key(), text);
            assert_eq!(key.source(root), root.join(format!("{text}.md")));
        }
    }

    #[test]
    fn keys_reject_traversal_and_unknown_shapes() {
        for bad in [
            "projects/ilha-das-sombras",
            "pessoal/projects/../global",
            "pessoal/projects/..",
            "pessoal/projects/",
            "pessoal/projects/a/b",
            "pessoal/projects/My App",
            "pessoal/trabalho",
            "outra/outra",
            "outra/projects/app",
            "../pessoal/pessoal",
            "pessoal",
            "other",
            "",
        ] {
            assert!(InstructionKey::parse(bad).is_err(), "{bad} should be rejected");
        }
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
        let key = InstructionKey::Global;
        assert_eq!(read(dir.path(), &key).unwrap(), "");
        save(dir.path(), &key, "# Global\n", None, 1).unwrap();
        assert_eq!(read(dir.path(), &key).unwrap(), "# Global\n");
        assert!(save(dir.path(), &key, &"x".repeat(MAX_BYTES + 1), None, 2).is_err());
    }

    #[test]
    fn saving_a_project_puts_the_category_import_first() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let root = home.join("repo/instructions");
        let key = InstructionKey::Project(PERSONAL, "app".into());
        save(&root, &key, "# App\n", Some(home), 1).unwrap();
        assert_eq!(read(&root, &key).unwrap(), "@~/repo/instructions/pessoal/pessoal.md\n# App\n");
        save(&root, &InstructionKey::Category(PERSONAL), "# Pessoal\n", Some(home), 2).unwrap();
        assert_eq!(read(&root, &InstructionKey::Category(PERSONAL)).unwrap(), "# Pessoal\n");
    }

    #[test]
    fn category_import_is_not_duplicated() {
        let root = Path::new("/r/instructions");
        let text = "# App\n\n@/r/instructions/trabalho/trabalho.md\nregras\n";
        assert_eq!(with_category_import(text, root, WORK, None), text);
        assert_eq!(with_category_import("", root, WORK, None), "@/r/instructions/trabalho/trabalho.md\n");
        let once = with_category_import("x", root, WORK, None);
        assert_eq!(once, "@/r/instructions/trabalho/trabalho.md\nx");
        assert_eq!(with_category_import(&once, root, WORK, None), once);
    }

    #[test]
    fn category_import_is_swapped_when_the_category_changes() {
        let home = Path::new("/home/u");
        let root = home.join("repo/instructions");
        let text = "@~/repo/instructions/pessoal/pessoal.md\n# App\n";
        assert_eq!(with_category_import(text, &root, WORK, Some(home)), "@~/repo/instructions/trabalho/trabalho.md\n# App\n");
        let absolute = "# App\n@/home/u/repo/instructions/trabalho/trabalho.md\n";
        assert_eq!(with_category_import(absolute, &root, PERSONAL, Some(home)), "# App\n@~/repo/instructions/pessoal/pessoal.md\n");
        let both = "@~/repo/instructions/pessoal/pessoal.md\n@~/repo/instructions/trabalho/trabalho.md\n";
        assert_eq!(with_category_import(both, &root, PERSONAL, Some(home)), "@~/repo/instructions/pessoal/pessoal.md\n");
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
        let source = dir.path().join("instructions/pessoal/projects/app.md");
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
    fn linking_a_project_creates_its_file_with_the_category_import() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let root = home.join("repo/instructions");
        let target = home.join("app/CLAUDE.local.md");
        let key = InstructionKey::Project(WORK, "app".into());
        let out = link_key(&root, &key, &target, Some(home), &home.join("b"), 1).unwrap();
        assert!(out.changed);
        assert_eq!(fs::read_to_string(&target).unwrap(), "@~/repo/instructions/trabalho/projects/app.md\n");
        assert_eq!(read(&root, &key).unwrap(), "@~/repo/instructions/trabalho/trabalho.md\n");
        let again = link_key(&root, &key, &target, Some(home), &home.join("b"), 2).unwrap();
        assert!(!again.changed);
        assert_eq!(read(&root, &key).unwrap(), "@~/repo/instructions/trabalho/trabalho.md\n");
    }

    #[test]
    fn linking_a_project_adopts_local_content_below_the_category_import() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let root = home.join("repo/instructions");
        let target = home.join("app/CLAUDE.local.md");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, "notas do app\n").unwrap();
        let key = InstructionKey::Project(PERSONAL, "app".into());
        let out = link_key(&root, &key, &target, Some(home), &home.join("b"), 1).unwrap();
        assert!(out.adopted && out.backup.is_some());
        assert_eq!(read(&root, &key).unwrap(), "@~/repo/instructions/pessoal/pessoal.md\nnotas do app\n");
    }

    #[test]
    fn linking_a_project_drops_stale_imports_from_the_root() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let root = home.join("repo/instructions");
        let target = home.join("app/CLAUDE.local.md");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, "@~/repo/instructions/projects/app.md\n").unwrap();
        let key = InstructionKey::Project(PERSONAL, "app".into());
        let out = link_key(&root, &key, &target, Some(home), &home.join("b"), 1).unwrap();
        assert!(out.changed && !out.kept_local && out.backup.is_some());
        assert_eq!(fs::read_to_string(&target).unwrap(), "@~/repo/instructions/pessoal/projects/app.md\n");

        fs::write(&target, "notas\n@~/repo/instructions/pessoal/projects/app.md\n@~/repo/instructions/trabalho/projects/app.md\n@~/outro/regras.md\n").unwrap();
        let moved = InstructionKey::Project(WORK, "app".into());
        let out = link_key(&root, &moved, &target, Some(home), &home.join("b"), 2).unwrap();
        assert!(out.changed);
        assert_eq!(fs::read_to_string(&target).unwrap(), "notas\n@~/repo/instructions/trabalho/projects/app.md\n@~/outro/regras.md\n");
    }

    #[test]
    fn categories_cannot_be_linked() {
        let dir = tempfile::tempdir().unwrap();
        let key = InstructionKey::Category(PERSONAL);
        assert!(link_key(dir.path(), &key, &dir.path().join("CLAUDE.md"), None, &dir.path().join("b"), 1).is_err());
        assert!(!dir.path().join("CLAUDE.md").exists());
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
    fn subfolders_collapse_into_their_repository() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("ilha-das-sombras");
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::create_dir_all(repo.join("apps/desktop/src/castle")).unwrap();
        let worktree = dir.path().join("other");
        fs::create_dir_all(&worktree).unwrap();
        fs::write(worktree.join(".git"), "gitdir: /x").unwrap();
        let known = vec![
            KnownProject { name: "castle".into(), path: repo.join("apps/desktop/src/castle") },
            KnownProject { name: "ilha-das-sombras".into(), path: repo.clone() },
            KnownProject { name: "Projects".into(), path: dir.path().to_path_buf() },
            KnownProject { name: "other".into(), path: worktree.clone() },
        ];
        let out = repo_projects(known);
        let found: Vec<(&str, &Path)> = out.iter().map(|p| (p.name.as_str(), p.path.as_path())).collect();
        assert_eq!(found, [("ilha-das-sombras", repo.as_path()), ("other", worktree.as_path())]);
    }

    #[test]
    fn project_files_scan_both_categories() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        save(root, &InstructionKey::Project(WORK, "b".into()), "", None, 1).unwrap();
        save(root, &InstructionKey::Project(PERSONAL, "z".into()), "", None, 1).unwrap();
        save(root, &InstructionKey::Project(PERSONAL, "a".into()), "", None, 1).unwrap();
        fs::write(root.join("pessoal/projects/Not A Slug.md"), "").unwrap();
        assert_eq!(project_files(root).unwrap(), [(PERSONAL, "a".to_string()), (PERSONAL, "z".to_string()), (WORK, "b".to_string())]);
    }

    #[test]
    fn overview_classifies_known_projects_and_lists_orphans() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("instructions");
        let app_dir = dir.path().join("work/My App");
        let site_dir = dir.path().join("home/site");
        let new_dir = dir.path().join("home/novo");
        for d in [&app_dir, &site_dir, &new_dir] {
            fs::create_dir_all(d).unwrap();
        }
        save(&root, &InstructionKey::Project(WORK, "my-app".into()), "y", None, 1).unwrap();
        save(&root, &InstructionKey::Project(PERSONAL, "site".into()), "s", None, 1).unwrap();
        save(&root, &InstructionKey::Project(PERSONAL, "orphan".into()), "x", None, 1).unwrap();
        save(&root, &InstructionKey::Category(WORK), "w", None, 1).unwrap();
        let known = [
            KnownProject { name: "My App".into(), path: app_dir.clone() },
            KnownProject { name: "my app".into(), path: dir.path().join("old/my app") },
            KnownProject { name: "site".into(), path: site_dir.clone() },
            KnownProject { name: "novo".into(), path: new_dir.clone() },
            KnownProject { name: "gone".into(), path: dir.path().join("missing") },
        ];
        let o = overview(&root, None, Some(dir.path().join(".claude/CLAUDE.md")), &known).unwrap();
        let keys: Vec<&str> = o.projects.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, ["trabalho/projects/my-app", "pessoal/projects/site", "projects/novo", "projects/gone", "pessoal/projects/orphan"]);
        let categories: Vec<Option<InstructionCategory>> = o.projects.iter().map(|e| e.category).collect();
        assert_eq!(categories, [Some(WORK), Some(PERSONAL), None, None, Some(PERSONAL)]);
        assert!(o.projects[0].exists && o.projects[0].target.is_some() && !o.projects[0].linked);
        assert!(!o.projects[2].exists && o.projects[2].target.is_some() && o.projects[2].slug.as_deref() == Some("novo"));
        assert!(o.projects[3].target.is_none());
        assert!(o.projects[4].project_path.is_none());
        assert!(!o.global.exists && !o.global.linked);
        let cats: Vec<(&str, &str, bool)> = o.categories.iter().map(|e| (e.key.as_str(), e.name.as_str(), e.exists)).collect();
        assert_eq!(cats, [("pessoal/pessoal", "Pessoal", false), ("trabalho/trabalho", "Trabalho", true)]);
        assert!(o.categories.iter().all(|e| e.target.is_none() && !e.linked));

        let json = serde_json::to_value(&o).unwrap();
        assert_eq!(json["projects"][0]["category"], "trabalho");
        assert_eq!(json["projects"][2]["category"], serde_json::Value::Null);
        assert_eq!(json["categories"][0]["category"], "pessoal");

        let key = InstructionKey::Project(WORK, "my-app".into());
        link_key(&root, &key, &project_target(&app_dir), None, &dir.path().join("b"), 2).unwrap();
        let o = overview(&root, None, None, &known).unwrap();
        assert!(o.projects[0].linked);
    }
}
