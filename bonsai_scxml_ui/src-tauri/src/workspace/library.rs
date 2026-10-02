use std::path::{Path, PathBuf};

#[derive(serde::Deserialize, Clone)]
pub(crate) struct BehaviorDirectoryMapping {
    pub(crate) key: String,
    pub(crate) path: String,
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct BehaviorTreeEntry {
    name: String,
    path: String,
    relative_path: String,
    kind: String,
    source: String,
    key: String,
    children: Vec<BehaviorTreeEntry>,
}

pub(crate) fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
    }

    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }

    PathBuf::from(path)
}

pub(crate) fn normalize_key(key: &str) -> String {
    key.trim().to_uppercase()
}

pub(crate) fn list_behavior_directory(
    key: &str,
    path: &str,
) -> Result<Vec<BehaviorTreeEntry>, String> {
    let key = normalize_key(key);
    let root = expand_home(path);

    let canonical_root = root.canonicalize().map_err(|error| {
        format!(
            "Could not open {key} directory '{}': {error}",
            root.display()
        )
    })?;

    if !canonical_root.is_dir() {
        return Err(format!(
            "{key} does not point to a directory: {}",
            canonical_root.display()
        ));
    }

    build_behavior_tree(&canonical_root, &canonical_root, &key)
}

fn workflow_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("xml") || extension.eq_ignore_ascii_case("scxml")
        })
        .unwrap_or(false)
}

fn build_behavior_tree(
    root: &Path,
    directory: &Path,
    key: &str,
) -> Result<Vec<BehaviorTreeEntry>, String> {
    let mut entries = Vec::new();

    let read_dir = std::fs::read_dir(directory).map_err(|error| {
        format!(
            "Could not read behavior directory '{}': {error}",
            directory.display()
        )
    })?;

    for item in read_dir {
        let item = item.map_err(|error| error.to_string())?;
        let file_type = item.file_type().map_err(|error| error.to_string())?;

        // Avoid recursive symlink loops.
        if file_type.is_symlink() {
            continue;
        }

        let path = item.path();
        let name = item.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        if file_type.is_dir() {
            let children = build_behavior_tree(root, &path, key)?;

            entries.push(BehaviorTreeEntry {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path: relative.clone(),
                kind: "directory".to_string(),
                source: format!("${{{key}}}/{relative}"),
                key: key.to_string(),
                children,
            });
        } else if file_type.is_file() && workflow_extension(&path) {
            entries.push(BehaviorTreeEntry {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path: relative.clone(),
                kind: "file".to_string(),
                source: format!("${{{key}}}/{relative}"),
                key: key.to_string(),
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(|left, right| {
        let left_dir = left.kind == "directory";
        let right_dir = right.kind == "directory";

        right_dir
            .cmp(&left_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}
