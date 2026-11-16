//! Small file logger (`<data>/logs/app.log`, rotated at 1 MB). Messages are
//! single-line and never include payload contents; home paths are redacted.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use log::{Level, LevelFilter, Log, Metadata, Record};

const MAX_BYTES: u64 = 1024 * 1024;

struct FileLogger {
    path: PathBuf,
    home: Option<String>,
    lock: Mutex<()>,
}

impl Log for FileLogger {
    fn enabled(&self, m: &Metadata) -> bool {
        m.level() <= Level::Info || m.target().starts_with("ilha") || m.target().starts_with("ids")
    }

    fn log(&self, r: &Record) {
        if !self.enabled(r.metadata()) {
            return;
        }
        let mut msg = r.args().to_string().replace(['\n', '\r'], " ");
        if let Some(h) = &self.home {
            msg = msg.replace(h.as_str(), "~");
        }
        let line = format!("{} {:5} {}: {}\n", ids_core::db::now_ms(), r.level(), r.target(), msg);
        let _g = self.lock.lock();
        if fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0) > MAX_BYTES {
            let _ = fs::rename(&self.path, self.path.with_extension("log.1"));
        }
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&self.path) {
            let _ = f.write_all(line.as_bytes());
        }
        if cfg!(debug_assertions) {
            eprint!("{line}");
        }
    }

    fn flush(&self) {}
}

pub fn init(log_dir: PathBuf) -> PathBuf {
    let _ = fs::create_dir_all(&log_dir);
    let path = log_dir.join("app.log");
    let home = crate::platform::home_dir().map(|h| h.to_string_lossy().to_string()).filter(|h| h.len() > 1);
    let logger = FileLogger { path: path.clone(), home, lock: Mutex::new(()) };
    if log::set_boxed_logger(Box::new(logger)).is_ok() {
        log::set_max_level(LevelFilter::Debug);
    }
    path
}

pub fn tail(path: &std::path::Path, max_lines: usize) -> Vec<String> {
    let text = fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(max_lines)..].iter().map(|s| s.to_string()).collect()
}
