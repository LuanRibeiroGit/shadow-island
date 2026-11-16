use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("invalid event: {0}")]
    InvalidEvent(String),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("settings error: {0}")]
    Settings(String),
}

pub type CoreResult<T> = Result<T, CoreError>;
