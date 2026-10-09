use std::collections::BTreeMap;
use std::fs::{self, DirBuilder, File, Metadata, OpenOptions};
use std::future::Future;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::core::editor_export::{build_workflow_from_editor, EditorExportRequestDto};
use crate::core::model::StateKind;
use crate::core::scxml::serialize_scxml;

const MAX_STAGED_ROOTS: usize = 8;
const MAX_SCXML_BYTES: usize = 8 * 1024 * 1024;
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeLoadData {
    pub path_to_config: String,
    pub path_to_task: String,
    pub include_mapping: BTreeMap<String, String>,
    pub force_configure: bool,
}

#[derive(Default)]
pub(crate) struct RuntimeWorkflowStaging {
    roots: Mutex<Vec<OwnedRoot>>,
}

struct StagedRoot {
    id: u64,
    path: String,
}

struct OwnedRoot {
    id: u64,
    path: PathBuf,
    file: Option<File>,
    file_identity: Option<FileIdentity>,
    directory: Option<(PathBuf, FileIdentity)>,
    active: bool,
}

struct FileIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(not(unix))]
    created: Option<std::time::SystemTime>,
    directory: bool,
}

impl FileIdentity {
    fn new(metadata: &Metadata) -> Self {
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Self {
            #[cfg(unix)]
            device: metadata.dev(),
            #[cfg(unix)]
            inode: metadata.ino(),
            #[cfg(not(unix))]
            created: metadata.created().ok(),
            directory: metadata.is_dir(),
        }
    }

    fn matches(&self, metadata: &Metadata) -> bool {
        if metadata.file_type().is_symlink() || metadata.is_dir() != self.directory {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            self.device == metadata.dev() && self.inode == metadata.ino()
        }
        #[cfg(not(unix))]
        {
            self.created.is_some() && self.created == metadata.created().ok()
        }
    }
}

fn remove_owned(path: &Path, identity: &FileIdentity) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if identity.matches(&metadata) => {
            let result = if identity.directory {
                fs::remove_dir(path)
            } else {
                fs::remove_file(path)
            };
            result.map_err(|error| {
                format!(
                    "Could not remove runtime staging path '{}': {error}",
                    path.display()
                )
            })
        }
        Ok(_) => Err(format!(
            "Runtime staging path '{}' was replaced; refusing to remove an unowned path.",
            path.display()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not inspect runtime staging path '{}': {error}",
            path.display()
        )),
    }
}

impl OwnedRoot {
    fn cleanup(&mut self) -> Result<(), String> {
        if self.file.is_some() && self.file_identity.is_none() {
            return Err(format!(
                "Could not confirm ownership of runtime staging file '{}'.",
                self.path.display()
            ));
        }
        if let Some(identity) = &self.file_identity {
            remove_owned(&self.path, identity)?;
        }
        self.file.take();
        if let Some((directory, identity)) = &self.directory {
            remove_owned(directory, identity)?;
        }
        self.active = false;
        Ok(())
    }
}

impl Drop for OwnedRoot {
    fn drop(&mut self) {
        if self.active {
            if let Err(error) = self.cleanup() {
                eprintln!("{error}");
            }
        }
    }
}

impl RuntimeWorkflowStaging {
    fn stage(
        &self,
        request: &EditorExportRequestDto,
        current_file_path: Option<&str>,
    ) -> Result<StagedRoot, String> {
        let mut roots = self
            .roots
            .lock()
            .map_err(|_| "Runtime staging lock is poisoned.")?;
        if roots.len() >= MAX_STAGED_ROOTS {
            return Err("The runtime staging limit of 8 pending or unconfirmed loads was reached. After the engine finishes loading, restart the desktop app to clean up retained files before retrying.".to_string());
        }
        let workflow = build_workflow_from_editor(request)?;
        let xml = serialize_scxml(&workflow)?;
        if xml.len() > MAX_SCXML_BYTES {
            return Err("Runtime SCXML exceeds the 8 MiB staging limit.".to_string());
        }
        let relative_source = workflow.states.iter().any(|state| {
            matches!(state.kind, StateKind::Submachine)
                && state.source.as_deref().is_some_and(|source| {
                    let source = source.trim();
                    !source.starts_with("${") && Path::new(source).is_relative()
                })
        });
        let parent = if relative_source {
            let original = current_file_path.map(Path::new).ok_or_else(|| {
                "This unsaved workflow has a relative child source without an original directory. Use a Behavior Library symbolic source such as ${KEY}/child.xml before loading.".to_string()
            })?;
            if !original.is_absolute() || !original.is_file() {
                return Err("Relative child sources require an existing absolute workflow file path. Open the original file or use a Behavior Library symbolic source such as ${KEY}/child.xml.".to_string());
            }
            // Keep the declaring path's parent, including a final file symlink's base.
            fs::canonicalize(original.parent().ok_or("Workflow file has no parent directory.")?)
        } else {
            fs::canonicalize(std::env::temp_dir())
        }
        .map_err(|error| format!("Could not resolve runtime staging directory: {error}"))?;

        for _ in 0..128 {
            let id = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
            let name = format!(".bonsai-runtime-{}-{id}", std::process::id());
            let directory = if relative_source {
                None
            } else {
                let path = parent.join(&name);
                let mut builder = DirBuilder::new();
                #[cfg(unix)]
                {
                    use std::os::unix::fs::DirBuilderExt;
                    builder.mode(0o700);
                }
                match builder.create(&path) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => {
                        return Err(format!(
                            "Could not create private runtime staging directory: {error}"
                        ))
                    }
                }
                let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
                Some((path, FileIdentity::new(&metadata)))
            };
            let path = directory.as_ref().map_or_else(
                || parent.join(format!("{name}.scxml")),
                |(directory, _)| directory.join("workflow.scxml"),
            );
            roots.push(OwnedRoot {
                id,
                path,
                file: None,
                file_identity: None,
                directory,
                active: true,
            });
            let root = roots.last_mut().expect("inserted runtime root");
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = match options.open(&root.path) {
                Ok(file) => file,
                Err(error)
                    if relative_source && error.kind() == std::io::ErrorKind::AlreadyExists =>
                {
                    roots.pop();
                    continue;
                }
                Err(error) => {
                    let message = format!(
                        "Could not create runtime staging file '{}': {error}",
                        root.path.display()
                    );
                    return Err(cleanup_failed_stage(&mut roots, message));
                }
            };
            let written = (|| {
                root.file_identity = Some(FileIdentity::new(
                    &file.metadata().map_err(|error| error.to_string())?,
                ));
                file.write_all(xml.as_bytes())
                    .map_err(|error| error.to_string())?;
                root.path
                    .to_str()
                    .map(str::to_string)
                    .ok_or_else(|| "Runtime staging path is not valid UTF-8.".to_string())
            })();
            // Keeping the original handle prevents inode reuse before ownership checks.
            root.file = Some(file);
            return match written {
                Ok(path) => Ok(StagedRoot { id, path }),
                Err(error) => Err(cleanup_failed_stage(
                    &mut roots,
                    format!("Could not write runtime SCXML: {error}"),
                )),
            };
        }
        Err("Could not create an exclusive runtime staging path after 128 attempts.".to_string())
    }

    fn complete(&self, id: u64) -> Result<(), String> {
        let mut roots = self
            .roots
            .lock()
            .map_err(|_| "Runtime staging lock is poisoned.")?;
        let index = roots
            .iter()
            .position(|root| root.id == id)
            .ok_or("Unknown runtime staging operation.")?;
        roots[index].cleanup()?;
        roots.swap_remove(index);
        Ok(())
    }

    pub(crate) async fn load<T, F: Future<Output = Result<T, String>>>(
        &self,
        request: &EditorExportRequestDto,
        path_to_config: String,
        include_mapping: BTreeMap<String, String>,
        force_configure: bool,
        current_file_path: Option<&str>,
        send: impl FnOnce(RuntimeLoadData) -> F,
    ) -> Result<T, String> {
        if path_to_config.trim().is_empty() {
            return Err("Choose a Bonsai configuration before loading a workflow.".to_string());
        }
        let staged = self.stage(request, current_file_path)?;
        let data = RuntimeLoadData {
            path_to_config,
            path_to_task: staged.path.clone(),
            include_mapping,
            force_configure,
        };
        // UI cancellation cannot shorten the server's file-reading lifetime.
        // Only a fully read response confirms completion; other outcomes retain the root.
        match send(data).await {
            Ok(response) => {
                if let Err(error) = self.complete(staged.id) {
                    eprintln!("{error} Retaining the staging record until application shutdown.");
                }
                Ok(response)
            }
            Err(error) => Err(format!(
                "Runtime load did not confirm a completed response: {error}. A request may have reached the engine. The owned staging file '{}' is retained until the desktop app closes. Paths must be readable by the engine on the same computer.",
                staged.path
            )),
        }
    }
}

fn cleanup_failed_stage(roots: &mut Vec<OwnedRoot>, message: String) -> String {
    match roots.last_mut().expect("failed runtime root").cleanup() {
        Ok(()) => {
            roots.pop();
            message
        }
        Err(error) => format!(
            "{message}; {error}. Retaining the owned staging record until application shutdown."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::document::WorkflowDocumentStore;
    use crate::core::editor_export::types::{EditorExportDataModelEntryDto, EditorExportNodeDto};
    use std::future::{poll_fn, ready};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use std::task::{Context, Poll, Waker};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            loop {
                let path = std::env::temp_dir().join(format!(
                    "bonsai-execution-test-{}-{}",
                    std::process::id(),
                    NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
                ));
                match fs::create_dir(&path) {
                    Ok(()) => return Self(fs::canonicalize(path).unwrap()),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("Could not create runtime fixture: {error}"),
                }
            }
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    fn request(source: Option<&str>) -> EditorExportRequestDto {
        EditorExportRequestDto {
            nodes: vec![EditorExportNodeDto {
                id: "editor-node".into(),
                node_type: if source.is_some() {
                    "submachine"
                } else {
                    "custom"
                }
                .into(),
                label: "Work".into(),
                full_skill_name: "Work#1".into(),
                source: source.unwrap_or_default().into(),
                is_initial: true,
                x: 20.0,
                y: 30.0,
                ..Default::default()
            }],
            data_model: vec![EditorExportDataModelEntryDto {
                id: "#_STATE_PREFIX".into(),
                expression: "'skills.'".into(),
            }],
            ..Default::default()
        }
    }

    fn finish<T>(future: impl Future<Output = T>) -> T {
        let mut future = std::pin::pin!(future);
        match future
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
        {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("Expected the test transport to finish immediately"),
        }
    }

    fn owned_paths(staging: &RuntimeWorkflowStaging) -> Vec<PathBuf> {
        staging
            .roots
            .lock()
            .unwrap()
            .iter()
            .map(|root| root.path.clone())
            .collect()
    }

    #[test]
    fn symbolic_unsaved_snapshot_is_exact_canonical_xml_without_document_mutation() {
        let request = request(Some("${BEH}/child & other.xml"));
        let before_request = serde_json::to_value(&request).unwrap();
        let store = WorkflowDocumentStore::default();
        store
            .replace(build_workflow_from_editor(&EditorExportRequestDto::default()).unwrap())
            .unwrap();
        let before_document = serde_json::to_value(store.snapshot().unwrap()).unwrap();
        let staging = RuntimeWorkflowStaging::default();
        let staged = staging.stage(&request, None).unwrap();
        let path = Path::new(&staged.path);
        assert!(path.is_absolute());
        assert_eq!(path.file_name().unwrap(), "workflow.scxml");
        let expected = serialize_scxml(&build_workflow_from_editor(&request).unwrap()).unwrap();
        let actual = fs::read_to_string(path).unwrap();
        assert_eq!(actual, expected);
        assert!(actual.contains("src=\"${BEH}/child &amp; other.xml\""));
        assert!(actual.contains("editor:position x=\"20\" y=\"30\""));
        assert_eq!(serde_json::to_value(&request).unwrap(), before_request);
        assert_eq!(
            serde_json::to_value(store.snapshot().unwrap()).unwrap(),
            before_document
        );
        let directory = path.parent().unwrap().to_path_buf();
        staging.complete(staged.id).unwrap();
        assert!(!directory.exists());
    }

    #[test]
    fn leaf_unsaved_workflow_uses_private_temp_directory() {
        let staging = RuntimeWorkflowStaging::default();
        let staged = staging.stage(&request(None), None).unwrap();
        let path = Path::new(&staged.path);
        assert_eq!(
            path.parent().unwrap().parent().unwrap(),
            fs::canonicalize(std::env::temp_dir()).unwrap()
        );
        assert!(fs::read_to_string(path)
            .unwrap()
            .contains("<state id=\"Work#1\">"));
        staging.complete(staged.id).unwrap();
    }

    #[test]
    fn literal_relative_child_keeps_original_parent_and_all_user_bytes() {
        let fixture = Fixture::new();
        let original = fixture.path("original.scxml");
        let child = fixture.path("child.scxml");
        fs::write(&original, b"original user bytes").unwrap();
        fs::write(&child, b"unsaved child is not touched").unwrap();
        let staging = RuntimeWorkflowStaging::default();
        let request = request(Some("./child.scxml"));
        let staged = staging.stage(&request, original.to_str()).unwrap();
        assert_eq!(Path::new(&staged.path).parent().unwrap(), fixture.0);
        assert_ne!(Path::new(&staged.path), original);
        assert!(fs::read_to_string(&staged.path)
            .unwrap()
            .contains("src=\"./child.scxml\""));
        staging.complete(staged.id).unwrap();
        assert_eq!(fs::read(original).unwrap(), b"original user bytes");
        assert_eq!(fs::read(child).unwrap(), b"unsaved child is not touched");
    }

    #[test]
    fn unsaved_relative_child_fails_before_transport_without_guessing_cwd() {
        let staging = RuntimeWorkflowStaging::default();
        let error = finish(staging.load(
            &request(Some("child.scxml")),
            "/config.xml".into(),
            BTreeMap::new(),
            false,
            None,
            |_| {
                panic!("No load may be sent without a relative-source base");
                #[allow(unreachable_code)]
                ready(Ok(()))
            },
        ))
        .unwrap_err();
        assert!(error.contains("Behavior Library symbolic source"));
        assert!(error.contains("${KEY}/child.xml"));
        assert!(owned_paths(&staging).is_empty());
    }

    #[test]
    fn relative_sources_reject_nonabsolute_missing_or_directory_original_paths() {
        let fixture = Fixture::new();
        let staging = RuntimeWorkflowStaging::default();
        for path in [
            PathBuf::from("workflow.scxml"),
            fixture.path("missing.scxml"),
            fixture.0.clone(),
        ] {
            let error = staging
                .stage(&request(Some("../child.scxml")), path.to_str())
                .err()
                .unwrap();
            assert!(error.contains("existing absolute workflow file path"));
            assert!(owned_paths(&staging).is_empty());
        }
    }

    #[test]
    fn absolute_child_source_is_preserved_without_reading_or_copying_child() {
        let staging = RuntimeWorkflowStaging::default();
        let source = std::env::temp_dir().join("not-a-real-bonsai-child.scxml");
        let request = request(source.to_str());
        let staged = staging.stage(&request, None).unwrap();
        assert_eq!(
            fs::read_to_string(&staged.path).unwrap(),
            serialize_scxml(&build_workflow_from_editor(&request).unwrap()).unwrap()
        );
        staging.complete(staged.id).unwrap();
    }

    #[test]
    fn load_payload_has_exact_required_keys_and_preserves_configuration_and_mapping() {
        let staging = RuntimeWorkflowStaging::default();
        let mapping = BTreeMap::from([("BEH".into(), "/behaviors".into())]);
        let result = finish(staging.load(
            &request(None),
            "/config with spaces.xml".into(),
            mapping.clone(),
            true,
            None,
            |data| {
                let value = serde_json::to_value(&data).unwrap();
                assert_eq!(
                    value,
                    serde_json::json!({
                        "pathToConfig": "/config with spaces.xml", "pathToTask": data.path_to_task,
                        "includeMapping": mapping, "forceConfigure": true
                    })
                );
                assert!(Path::new(&data.path_to_task).is_absolute());
                assert!(Path::new(&data.path_to_task).is_file());
                ready(Ok(value))
            },
        ))
        .unwrap();
        assert!(!Path::new(result["pathToTask"].as_str().unwrap()).exists());
        assert!(owned_paths(&staging).is_empty());
    }

    #[test]
    fn pending_load_keeps_file_until_fully_completed_response_and_preserves_false_result() {
        let staging = RuntimeWorkflowStaging::default();
        let completed = Arc::new(AtomicBool::new(false));
        let completed_in_transport = completed.clone();
        let request = request(None);
        let response = serde_json::json!({
            "status": 200, "body": "{\"success\":false,\"messages\":[\"diagnostic\"]}",
            "headers": {"content-type": "application/json", "x-test": "unchanged"}
        });
        let expected_response = response.clone();
        let mut load = Box::pin(staging.load(
            &request,
            "/config.xml".into(),
            BTreeMap::new(),
            false,
            None,
            move |_| {
                poll_fn(move |_| {
                    if completed_in_transport.load(Ordering::Relaxed) {
                        Poll::Ready(Ok(response.clone()))
                    } else {
                        Poll::Pending
                    }
                })
            },
        ));
        let mut context = Context::from_waker(Waker::noop());
        assert!(load.as_mut().poll(&mut context).is_pending());
        let path = owned_paths(&staging).pop().unwrap();
        assert!(path.is_file());
        completed.store(true, Ordering::Relaxed);
        assert_eq!(
            load.as_mut().poll(&mut context),
            Poll::Ready(Ok(expected_response))
        );
        assert!(!path.exists());
        assert!(owned_paths(&staging).is_empty());
    }

    #[test]
    fn completed_http_error_is_not_transformed_into_validation_or_transport_error() {
        let staging = RuntimeWorkflowStaging::default();
        let raw = serde_json::json!({"status": 503, "body": "upstream unavailable", "headers": {"retry-after": "10"}});
        assert_eq!(
            finish(staging.load(
                &request(None),
                "/config.xml".into(),
                BTreeMap::new(),
                false,
                None,
                |_| ready(Ok(raw.clone())),
            ))
            .unwrap(),
            raw
        );
        assert!(owned_paths(&staging).is_empty());
    }

    #[test]
    fn ambiguous_failures_are_bounded_and_only_cleaned_up_when_session_ends() {
        let staging = RuntimeWorkflowStaging::default();
        let mut calls = 0;
        for _ in 0..MAX_STAGED_ROOTS {
            let error = finish(staging.load(
                &request(None),
                "/config.xml".into(),
                BTreeMap::new(),
                false,
                None,
                |_| {
                    calls += 1;
                    ready(Err::<(), _>("connection closed after POST".into()))
                },
            ))
            .unwrap_err();
            assert!(error.contains("may have reached the engine"));
        }
        let paths = owned_paths(&staging);
        assert_eq!(paths.len(), MAX_STAGED_ROOTS);
        assert!(paths.iter().all(|path| path.is_file()));
        let error = finish(staging.load(
            &request(None),
            "/config.xml".into(),
            BTreeMap::new(),
            false,
            None,
            |_| {
                calls += 1;
                ready(Ok(()))
            },
        ))
        .unwrap_err();
        assert!(error.contains("limit of 8"));
        assert_eq!(calls, MAX_STAGED_ROOTS);
        assert_eq!(owned_paths(&staging), paths);
        drop(staging);
        assert!(paths
            .iter()
            .all(|path| !path.exists() && !path.parent().unwrap().exists()));
    }

    #[test]
    fn dropped_native_future_retains_root_instead_of_racing_server_parse() {
        let staging = RuntimeWorkflowStaging::default();
        let request = request(None);
        let mut load = Box::pin(staging.load(
            &request,
            "/config.xml".into(),
            BTreeMap::new(),
            false,
            None,
            |_| std::future::pending::<Result<(), String>>(),
        ));
        assert!(load
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
            .is_pending());
        let path = owned_paths(&staging).pop().unwrap();
        drop(load);
        assert!(path.is_file());
        drop(staging);
        assert!(!path.exists());
    }

    #[test]
    fn unique_same_parent_files_never_overwrite_user_file_or_cleanup_unknown_operation() {
        let fixture = Fixture::new();
        let original = fixture.path("original.scxml");
        fs::write(&original, "keep user file").unwrap();
        let staging = RuntimeWorkflowStaging::default();
        let first = staging
            .stage(&request(Some("child.scxml")), original.to_str())
            .unwrap();
        let second = staging
            .stage(&request(Some("child.scxml")), original.to_str())
            .unwrap();
        assert_ne!(first.path, second.path);
        assert!(staging.complete(u64::MAX).unwrap_err().contains("Unknown"));
        assert!(Path::new(&first.path).exists() && Path::new(&second.path).exists());
        staging.complete(first.id).unwrap();
        assert!(Path::new(&second.path).exists());
        drop(staging);
        assert!(!Path::new(&second.path).exists());
        assert_eq!(fs::read_to_string(original).unwrap(), "keep user file");
    }

    #[test]
    fn replaced_file_is_not_owned_and_must_not_be_deleted() {
        let fixture = Fixture::new();
        let staging = RuntimeWorkflowStaging::default();
        let staged = staging.stage(&request(None), None).unwrap();
        let moved = fixture.path("moved-owned.scxml");
        fs::rename(&staged.path, &moved).unwrap();
        fs::write(&staged.path, "external replacement").unwrap();
        assert!(staging.complete(staged.id).unwrap_err().contains("unowned"));
        assert_eq!(
            fs::read_to_string(&staged.path).unwrap(),
            "external replacement"
        );
        assert_eq!(owned_paths(&staging).len(), 1);
        fs::remove_file(&staged.path).unwrap();
        fs::rename(moved, &staged.path).unwrap();
        staging.complete(staged.id).unwrap();
    }

    #[test]
    fn cleanup_never_recursively_removes_unowned_files_in_private_directory() {
        let staging = RuntimeWorkflowStaging::default();
        let staged = staging.stage(&request(None), None).unwrap();
        let extra = Path::new(&staged.path)
            .parent()
            .unwrap()
            .join("unowned.txt");
        fs::write(&extra, "keep unrelated file").unwrap();
        assert!(staging.complete(staged.id).is_err());
        assert_eq!(fs::read_to_string(&extra).unwrap(), "keep unrelated file");
        assert_eq!(owned_paths(&staging).len(), 1);
        fs::remove_file(extra).unwrap();
        staging.complete(staged.id).unwrap();
    }

    #[test]
    fn oversized_or_unserializable_snapshots_never_stage_recovery_xml() {
        let staging = RuntimeWorkflowStaging::default();
        let mut oversized = request(None);
        oversized.data_model[0].expression = "x".repeat(MAX_SCXML_BYTES);
        assert!(staging
            .stage(&oversized, None)
            .err()
            .unwrap()
            .contains("8 MiB"));
        let mut duplicate = request(None);
        duplicate.nodes.push(duplicate.nodes[0].clone());
        assert!(staging.stage(&duplicate, None).is_err());
        assert!(owned_paths(&staging).is_empty());
    }

    #[test]
    fn missing_configuration_never_stages_or_posts() {
        let staging = RuntimeWorkflowStaging::default();
        assert!(finish(staging.load(
            &request(None),
            "  ".into(),
            BTreeMap::new(),
            false,
            None,
            |_| {
                panic!("No transport without a configuration");
                #[allow(unreachable_code)]
                ready(Ok(()))
            },
        ))
        .unwrap_err()
        .contains("Choose a Bonsai configuration"));
        assert!(owned_paths(&staging).is_empty());
    }

    #[test]
    fn concurrent_preparations_are_unique_and_completed_capacity_can_be_reused() {
        let staging = RuntimeWorkflowStaging::default();
        let request = request(None);
        let stages = std::thread::scope(|scope| {
            let handles = (0..MAX_STAGED_ROOTS)
                .map(|_| scope.spawn(|| staging.stage(&request, None).unwrap()))
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect::<Vec<_>>()
        });
        let mut paths = stages
            .iter()
            .map(|stage| stage.path.clone())
            .collect::<Vec<_>>();
        paths.sort();
        paths.dedup();
        assert_eq!(paths.len(), MAX_STAGED_ROOTS);
        assert!(paths.iter().all(|path| Path::new(path).is_file()));
        assert!(staging.stage(&request, None).is_err());
        staging.complete(stages[0].id).unwrap();
        let next = staging.stage(&request, None).unwrap();
        assert!(!paths.contains(&next.path));
        assert_eq!(owned_paths(&staging).len(), MAX_STAGED_ROOTS);
    }

    #[cfg(unix)]
    #[test]
    fn private_directory_and_file_have_private_modes() {
        use std::os::unix::fs::PermissionsExt;
        let staging = RuntimeWorkflowStaging::default();
        let staged = staging.stage(&request(None), None).unwrap();
        let path = Path::new(&staged.path);
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        staging.complete(staged.id).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn final_user_file_symlink_does_not_rebase_relative_child_sources_to_target_directory() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let target_directory = fixture.path("target");
        fs::create_dir(&target_directory).unwrap();
        let target = target_directory.join("target.scxml");
        fs::write(&target, "target bytes").unwrap();
        let alias = fixture.path("alias.scxml");
        symlink(&target, &alias).unwrap();
        let staging = RuntimeWorkflowStaging::default();
        let staged = staging
            .stage(&request(Some("./child.scxml")), alias.to_str())
            .unwrap();
        assert_eq!(Path::new(&staged.path).parent().unwrap(), fixture.0);
        staging.complete(staged.id).unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), "target bytes");
        assert!(fs::symlink_metadata(alias)
            .unwrap()
            .file_type()
            .is_symlink());
    }
}
