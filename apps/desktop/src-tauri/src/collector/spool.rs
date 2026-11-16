//! Spool replay: events `ids-hook` wrote to disk while the app was closed (or the
//! integration was paused).

use std::path::{Path, PathBuf};
use std::time::Duration;

pub fn spool_file(data_dir: &Path) -> PathBuf {
    data_dir.join("spool").join("events.jsonl")
}

pub fn spool_size(data_dir: &Path) -> u64 {
    std::fs::metadata(spool_file(data_dir)).map(|m| m.len()).unwrap_or(0)
}

/// Atomically take the current spool file and return its lines. The file is
/// renamed first so new hook writes go to a fresh file; a short pause lets writers
/// that already opened the old file finish.
pub fn take(data_dir: &Path, now_ms: i64) -> std::io::Result<Vec<Vec<u8>>> {
    let src = spool_file(data_dir);
    if !src.exists() {
        return Ok(vec![]);
    }
    let taken = data_dir.join("spool").join(format!("replay-{now_ms}.jsonl"));
    std::fs::rename(&src, &taken)?;
    std::thread::sleep(Duration::from_millis(150));
    let data = std::fs::read(&taken)?;
    let lines = data
        .split(|&b| b == b'\n')
        .filter(|l| !l.iter().all(u8::is_ascii_whitespace))
        .map(<[u8]>::to_vec)
        .collect();
    std::fs::remove_file(&taken)?;
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_returns_lines_and_clears() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("spool")).unwrap();
        std::fs::write(spool_file(dir.path()), b"{\"a\":1}\n\n{\"b\":2}\n").unwrap();
        let lines = take(dir.path(), 1).unwrap();
        assert_eq!(lines.len(), 2);
        assert!(!spool_file(dir.path()).exists());
        assert!(take(dir.path(), 2).unwrap().is_empty());
    }
}
