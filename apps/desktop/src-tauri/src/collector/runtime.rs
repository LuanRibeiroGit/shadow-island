//! `runtime.json`: tells `ids-hook` where the collector listens and which token to
//! send. Created on start (user-only permissions), removed on exit.

use std::path::{Path, PathBuf};

pub fn new_token() -> String {
    let mut bytes = [0u8; 24];
    if getrandom::fill(&mut bytes).is_err() {
        // Extremely unlikely; fall back to time-based entropy (still local-only).
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        bytes[..16].copy_from_slice(&t.to_le_bytes());
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn path(data_dir: &Path) -> PathBuf {
    data_dir.join("runtime.json")
}

pub fn write(data_dir: &Path, port: u16, token: &str, protect: impl Fn(&Path)) -> std::io::Result<()> {
    std::fs::create_dir_all(data_dir)?;
    let p = path(data_dir);
    let tmp = data_dir.join("runtime.json.tmp");
    std::fs::write(&tmp, format!("{{\"port\":{port},\"token\":\"{token}\",\"pid\":{}}}", std::process::id()))?;
    protect(&tmp);
    std::fs::rename(&tmp, &p)
}

pub fn remove(data_dir: &Path) {
    let _ = std::fs::remove_file(path(data_dir));
}

/// Constant-time comparison for the token header.
pub fn token_matches(expected: &str, got: &str) -> bool {
    let (a, b) = (expected.as_bytes(), got.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens() {
        let t = new_token();
        assert_eq!(t.len(), 48);
        assert_ne!(t, new_token());
        assert!(token_matches(&t, &t.clone()));
        assert!(!token_matches(&t, "x"));
    }
}
