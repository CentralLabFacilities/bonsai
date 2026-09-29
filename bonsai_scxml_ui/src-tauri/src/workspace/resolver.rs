use std::path::{Path, PathBuf};

use super::library::{expand_home, normalize_key, BehaviorDirectoryMapping};

#[derive(serde::Serialize, Clone)]
pub(crate) struct WorkflowSourceResult {
    content: String,
    path: String,
    file_name: String,
    root_key: Option<String>,
}

pub(crate) fn read_workflow_source(
    src: &str,
    directories: &[BehaviorDirectoryMapping],
    current_file_path: Option<&str>,
) -> Result<WorkflowSourceResult, String> {
    let (candidate, root_key, root_path) =
        resolve_workflow_path(src, directories, current_file_path)?;

    let resolved_path = candidate.canonicalize().map_err(|error| {
        format!(
            "Could not resolve workflow file '{}': {error}",
            candidate.display()
        )
    })?;

    if let Some(root) = root_path {
        let canonical_root = root.canonicalize().map_err(|error| {
            format!(
                "Could not resolve Behavior Library directory '{}': {error}",
                root.display()
            )
        })?;

        if !resolved_path.starts_with(&canonical_root) {
            return Err(format!(
                "Workflow source '{}' is outside its Behavior Library directory.",
                resolved_path.display()
            ));
        }
    }

    let content = std::fs::read_to_string(&resolved_path).map_err(|error| {
        format!(
            "Could not read workflow file '{}': {error}",
            resolved_path.display()
        )
    })?;

    let file_name = resolved_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(WorkflowSourceResult {
        content,
        path: resolved_path.to_string_lossy().to_string(),
        file_name,
        root_key,
    })
}

fn parse_library_source(src: &str) -> Option<(String, String)> {
    if !src.starts_with("${") {
        return None;
    }

    let closing = src.find('}')?;
    let key = normalize_key(&src[2..closing]);
    let relative = src[closing + 1..]
        .trim_start_matches(|character| character == '/' || character == '\\')
        .to_string();

    Some((key, relative))
}

fn resolve_workflow_path(
    src: &str,
    directories: &[BehaviorDirectoryMapping],
    current_file_path: Option<&str>,
) -> Result<(PathBuf, Option<String>, Option<PathBuf>), String> {
    let src = src.trim();

    if src.is_empty() {
        return Err("Workflow source path is empty.".to_string());
    }

    if let Some((key, relative)) = parse_library_source(src) {
        let mapping = directories
            .iter()
            .find(|directory| normalize_key(&directory.key) == key)
            .ok_or_else(|| {
                format!("No Behavior Library directory is configured for key {key}.")
            })?;

        let root = expand_home(&mapping.path);
        let candidate = root.join(relative);

        return Ok((candidate, Some(key), Some(root)));
    }

    let source_path = expand_home(src);

    if source_path.is_absolute() {
        return Ok((source_path, None, None));
    }

    if let Some(current) = current_file_path {
        if let Some(parent) = Path::new(current).parent() {
            return Ok((parent.join(source_path), None, None));
        }
    }

    Err(format!(
        "Cannot resolve workflow source '{src}'. The Behavior Library key must be resolved to a local path before opening the file."
    ))
}
