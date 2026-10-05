use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

/// Stage in the resolved destination's directory, sync, then atomically rename.
/// Errors before rename leave the destination untouched. A directory-sync error
/// occurs after commit and cannot roll back the replacement. Concurrent saves
/// are last-rename-wins; this is not a lock against external path/metadata edits.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    write_atomic_with(path, |file| file.write_all(bytes))
}

fn write_atomic_with(
    path: &Path,
    write: impl FnOnce(&mut File) -> io::Result<()>,
) -> io::Result<()> {
    let save = || -> io::Result<()> {
        let destination = resolve_destination(path)?;
        let parent = destination.parent().expect("resolved absolute file path");
        let permissions = match fs::metadata(&destination) {
            Ok(metadata) => {
                if !metadata.is_file() {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "destination is not a regular file",
                    ));
                }
                if metadata.permissions().readonly() {
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "destination is read-only",
                    ));
                }
                // Rename alone can bypass a file's write permissions. Check
                // access without truncating, and close before Windows rename.
                let existing = OpenOptions::new()
                    .write(true)
                    .open(&destination)
                    .map_err(|error| context("check destination write access", error))?;
                Some(
                    existing
                        .metadata()
                        .map_err(|error| context("read destination permissions", error))?
                        .permissions(),
                )
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(context("inspect destination", error)),
        };

        // std cannot portably open/sync directories on Windows. On Unix, open
        // before staging so an open failure cannot follow a committed rename.
        #[cfg(unix)]
        let directory = File::open(parent)
            .map_err(|error| context("open parent directory for syncing", error))?;

        let mut temporary = TemporaryFile::create(parent)?;
        let stage = (|| -> io::Result<()> {
            let file = temporary.file.as_mut().expect("open temporary file");
            // No content is written before restoring an existing private mode.
            // New files keep create_new's ordinary umask/default permissions.
            if let Some(permissions) = permissions {
                file.set_permissions(permissions)
                    .map_err(|error| context("preserve destination permissions", error))?;
            }
            write(file).map_err(|error| context("write temporary file", error))?;
            file.sync_all()
                .map_err(|error| context("sync temporary file", error))
        })();
        drop(temporary.file.take());

        // std::fs::rename replaces atomically on supported Unix/Windows
        // filesystems. Never delete the destination or fall back to copying.
        let commit = stage.and_then(|()| {
            fs::rename(&temporary.path, &destination)
                .map_err(|error| context("atomically replace destination", error))
        });
        if let Err(error) = commit {
            return match temporary.cleanup() {
                Ok(()) => Err(error),
                Err(cleanup) => Err(context(
                    &format!(
                        "{error}; also could not remove temporary file '{}'",
                        temporary.path.display()
                    ),
                    cleanup,
                )),
            };
        }
        temporary.active = false;

        #[cfg(unix)]
        directory.sync_all().map_err(|error| {
            context(
                "replacement already committed, but syncing the parent directory failed; \
                 new bytes are saved, crash durability is unconfirmed",
                error,
            )
        })?;
        Ok(())
    };
    save().map_err(|error| context(&format!("could not save '{}'", path.display()), error))
}

fn resolve_destination(path: &Path) -> io::Result<PathBuf> {
    let mut destination = path.to_path_buf();
    // Canonicalizing the parent supports relative paths and directory symlinks.
    // Follow the final link separately, including links to not-yet-created files.
    for _ in 0..=40 {
        // Path components normalize trailing separators and '/.'. Check the
        // raw path (including symlink targets) before losing directory intent.
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStrExt;
            let bytes = destination.as_os_str().as_bytes();
            if bytes.ends_with(b"/") || bytes.ends_with(b"/.") {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "file path ends with a directory component",
                ));
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let characters: Vec<_> = destination.as_os_str().encode_wide().collect();
            if matches!(characters.last(), Some(47 | 92))
                || matches!(characters.as_slice(), [.., 47 | 92, 46])
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "file path ends with a directory component",
                ));
            }
            if destination
                .file_name()
                .is_some_and(|name| name.encode_wide().any(|character| character == 58))
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "atomic saving to Windows alternate data streams is not supported",
                ));
            }
        }
        let name = destination.file_name().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "file path has no file name")
        })?;
        let parent = destination
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let parent = fs::canonicalize(parent)
            .map_err(|error| context("resolve destination parent directory", error))?;
        let resolved = parent.join(name);
        match fs::symlink_metadata(&resolved) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                let link = fs::read_link(&resolved)
                    .map_err(|error| context("resolve destination symlink", error))?;
                destination = parent.join(link);
            }
            Ok(_) => return Ok(resolved),
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(resolved),
            Err(error) => return Err(context("inspect destination path", error)),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        "too many destination symlinks (possible symlink loop)",
    ))
}

fn context(operation: &str, error: io::Error) -> io::Error {
    io::Error::new(error.kind(), format!("{operation}: {error}"))
}

struct TemporaryFile {
    path: PathBuf,
    file: Option<File>,
    active: bool,
}

impl TemporaryFile {
    fn create(parent: &Path) -> io::Result<Self> {
        for _ in 0..128 {
            // A bounded ASCII name avoids extending a long/Unicode destination
            // name beyond the filesystem's per-component limit.
            let path = parent.join(format!(
                ".bonsai-save-{}-{}.tmp",
                std::process::id(),
                NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
            ));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => {
                    return Ok(Self {
                        path,
                        file: Some(file),
                        active: true,
                    });
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(context("create same-directory temporary file", error)),
            }
        }
        Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "could not create an exclusive temporary file after 128 attempts",
        ))
    }

    fn cleanup(&mut self) -> io::Result<()> {
        drop(self.file.take());
        match fs::remove_file(&self.path) {
            Ok(()) => self.active = false,
            Err(error) if error.kind() == io::ErrorKind::NotFound => self.active = false,
            Err(error) => return Err(error),
        }
        Ok(())
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        if self.active {
            // Also covers unwinding; normal errors report a failed cleanup.
            let _ = self.cleanup();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            Self::in_directory(&std::env::temp_dir())
        }

        fn in_directory(parent: &Path) -> Self {
            loop {
                let path = parent.join(format!(
                    "bonsai-atomic-test-{}-{}",
                    std::process::id(),
                    NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
                ));
                match fs::create_dir(&path) {
                    Ok(()) => return Self(fs::canonicalize(path).unwrap()),
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("could not create test fixture: {error}"),
                }
            }
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }

        fn entries(&self) -> Vec<PathBuf> {
            let mut paths: Vec<_> = fs::read_dir(&self.0)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .collect();
            paths.sort();
            paths
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn replaces_existing_new_and_empty_files_with_exact_bytes() {
        let fixture = Fixture::new();
        let cases: [(Option<&[u8]>, &[u8]); 5] = [
            (Some(b"original"), b"replacement"),
            (None, b"new"),
            (Some(b""), b"nonempty"),
            (Some(b"original"), b""),
            (None, b""),
        ];
        for (index, (before, after)) in cases.into_iter().enumerate() {
            let path = fixture.path(&format!("case-{index}.xml"));
            if let Some(before) = before {
                fs::write(&path, before).unwrap();
            }
            write_atomic(&path, after).unwrap();
            assert_eq!(fs::read(&path).unwrap(), after);
        }
        let path = fixture.path("binary.xml");
        let bytes: Vec<u8> = (0..256 * 1024).map(|value| value as u8).collect();
        write_atomic(&path, &bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fixture.entries().len(), 6);
    }

    #[test]
    fn stages_exclusively_beside_destination_without_touching_original() {
        let fixture = Fixture::new();
        let path = fixture.path("workflow.xml");
        fs::write(&path, b"original").unwrap();
        write_atomic_with(&path, |file| {
            file.write_all(b"first half")?;
            assert_eq!(fs::read(&path).unwrap(), b"original");
            let temporary = fixture
                .entries()
                .into_iter()
                .find(|entry| entry != &path)
                .unwrap();
            assert_eq!(temporary.parent(), path.parent());
            assert!(temporary
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with(".bonsai-save-"));
            let error = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(temporary)
                .unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
            file.write_all(b" second half")
        })
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"first half second half");
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[test]
    fn partial_write_failure_preserves_original_and_cleans_temporary() {
        let fixture = Fixture::new();
        for (index, before) in [Some(b"original".as_slice()), None].into_iter().enumerate() {
            let path = fixture.path(&format!("failure-{index}.xml"));
            if let Some(bytes) = before {
                fs::write(&path, bytes).unwrap();
            }
            let entries = fixture.entries();
            let error = write_atomic_with(&path, |file| {
                file.write_all(b"partial bytes")?;
                Err(io::Error::new(
                    io::ErrorKind::Other,
                    "injected disk failure",
                ))
            })
            .unwrap_err();
            assert!(error.to_string().contains("write temporary file"));
            assert!(error.to_string().contains("injected disk failure"));
            assert!(error.to_string().contains(&path.display().to_string()));
            assert_eq!(fixture.entries(), entries);
            match before {
                Some(bytes) => assert_eq!(fs::read(&path).unwrap(), bytes),
                None => assert!(!path.exists()),
            }
        }
    }

    #[test]
    fn rename_failure_leaves_destination_directory_and_cleans_temporary() {
        let fixture = Fixture::new();
        let path = fixture.path("blocked.xml");
        let error = write_atomic_with(&path, |file| {
            file.write_all(b"replacement")?;
            // A competing creator blocks the commit with a nonempty directory.
            fs::create_dir(&path)?;
            fs::write(path.join("sentinel"), b"untouched")
        })
        .unwrap_err();
        assert!(error.to_string().contains("atomically replace destination"));
        assert_eq!(fs::read(path.join("sentinel")).unwrap(), b"untouched");
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[test]
    fn disappeared_temporary_causes_rename_error_without_losing_original() {
        let fixture = Fixture::new();
        let path = fixture.path("workflow.xml");
        fs::write(&path, b"original").unwrap();
        let error = write_atomic_with(&path, |file| {
            file.write_all(b"replacement")?;
            let temporary = fixture
                .entries()
                .into_iter()
                .find(|entry| entry != &path)
                .unwrap();
            // Close the staged handle before unlinking, including on Windows.
            *file = OpenOptions::new().write(true).open(&path)?;
            fs::remove_file(temporary)
        })
        .unwrap_err();
        assert!(error.to_string().contains("atomically replace destination"));
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[test]
    fn unwinding_also_cleans_temporary_and_preserves_original() {
        let fixture = Fixture::new();
        let path = fixture.path("workflow.xml");
        fs::write(&path, b"original").unwrap();
        let panic = std::panic::catch_unwind(|| {
            let _ = write_atomic_with(&path, |file| {
                file.write_all(b"partial")?;
                panic!("injected writer panic");
            });
        });
        assert!(panic.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[test]
    fn relative_unicode_and_long_file_names_work() {
        let cwd = fs::canonicalize(std::env::current_dir().unwrap()).unwrap();
        let fixture = Fixture::in_directory(&cwd);
        let relative = fixture
            .path("relative.xml")
            .strip_prefix(&cwd)
            .unwrap()
            .to_path_buf();
        write_atomic(&relative, b"relative").unwrap();
        assert_eq!(fs::read(fixture.path("relative.xml")).unwrap(), b"relative");
        for name in [
            "workflow-\u{00e9}-\u{65e5}\u{672c}.xml".to_string(),
            format!("{}.xml", "x".repeat(236)),
        ] {
            let path = fixture.path(&name);
            write_atomic(&path, b"unicode and long").unwrap();
            assert_eq!(fs::read(path).unwrap(), b"unicode and long");
        }
        assert_eq!(fixture.entries().len(), 3);
    }

    #[test]
    fn missing_parent_and_invalid_destinations_fail_without_creating_files() {
        let fixture = Fixture::new();
        let path = fixture.path("missing/child.xml");
        let error = write_atomic(&path, b"bytes").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert!(error
            .to_string()
            .contains("resolve destination parent directory"));
        assert!(fixture.entries().is_empty());
        for invalid in [
            Path::new(""),
            Path::new("."),
            Path::new(".."),
            fixture.0.as_path(),
        ] {
            assert!(write_atomic(invalid, b"bytes").is_err());
        }
        assert!(fixture.entries().is_empty());
    }

    #[test]
    fn read_only_destination_is_not_bypassed_by_directory_write_access() {
        let fixture = Fixture::new();
        let path = fixture.path("readonly.xml");
        fs::write(&path, b"original").unwrap();
        let original_permissions = fs::metadata(&path).unwrap().permissions();
        let mut permissions = original_permissions.clone();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        let error = write_atomic(&path, b"replacement").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert!(error.to_string().contains("read-only"));
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fixture.entries(), vec![path.clone()]);
        fs::set_permissions(path, original_permissions).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn unix_permissions_and_new_file_umask_are_preserved() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = Fixture::new();
        let path = fixture.path("private.xml");
        fs::write(&path, b"original").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        write_atomic_with(&path, |file| {
            assert_eq!(file.metadata()?.permissions().mode() & 0o777, 0o640);
            file.write_all(b"replacement")
        })
        .unwrap();
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        let ordinary = fixture.path("ordinary.xml");
        let atomic = fixture.path("atomic.xml");
        fs::write(&ordinary, b"ordinary").unwrap();
        write_atomic(&atomic, b"atomic").unwrap();
        assert_eq!(
            fs::metadata(ordinary).unwrap().permissions().mode() & 0o777,
            fs::metadata(atomic).unwrap().permissions().mode() & 0o777
        );
    }

    #[cfg(unix)]
    #[test]
    fn follows_symlink_chain_and_directory_links_without_replacing_links() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let target_dir = fixture.path("real");
        fs::create_dir(&target_dir).unwrap();
        let target = target_dir.join("workflow.xml");
        fs::write(&target, b"original").unwrap();
        let directory_link = fixture.path("directory-link");
        symlink("real", &directory_link).unwrap();
        let intermediate = fixture.path("intermediate.xml");
        symlink("directory-link/workflow.xml", &intermediate).unwrap();
        let link = fixture.path("workflow-link.xml");
        symlink("intermediate.xml", &link).unwrap();
        write_atomic_with(&link, |file| {
            assert_eq!(fs::read(&target).unwrap(), b"original");
            assert_eq!(fs::read_dir(&target_dir)?.count(), 2);
            assert_eq!(fixture.entries().len(), 4);
            file.write_all(b"replacement")
        })
        .unwrap();
        assert_eq!(fs::read(&link).unwrap(), b"replacement");
        assert_eq!(fs::read(&target).unwrap(), b"replacement");
        assert_eq!(fs::read_link(&link).unwrap(), Path::new("intermediate.xml"));
        assert_eq!(
            fs::read_link(intermediate).unwrap(),
            Path::new("directory-link/workflow.xml")
        );
        assert_eq!(fs::read_link(directory_link).unwrap(), Path::new("real"));
        assert_eq!(fs::read_dir(target_dir).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn follows_dangling_symlink_and_rejects_loops_or_read_only_targets() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let fixture = Fixture::new();
        let target = fixture.path("new.xml");
        let link = fixture.path("link.xml");
        symlink("new.xml", &link).unwrap();
        write_atomic(&link, b"created target").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"created target");
        assert_eq!(fs::read_link(&link).unwrap(), Path::new("new.xml"));
        fs::set_permissions(&target, fs::Permissions::from_mode(0o444)).unwrap();
        assert_eq!(
            write_atomic(&link, b"denied").unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
        assert_eq!(fs::read(&target).unwrap(), b"created target");
        let first = fixture.path("loop-a");
        let second = fixture.path("loop-b");
        symlink("loop-b", &first).unwrap();
        symlink("loop-a", &second).unwrap();
        assert!(write_atomic(&first, b"denied")
            .unwrap_err()
            .to_string()
            .contains("symlink loop"));
        assert_eq!(fixture.entries().len(), 4);
    }

    #[cfg(unix)]
    #[test]
    fn trailing_separator_does_not_silently_write_to_a_file() {
        use std::os::unix::{ffi::OsStringExt, fs::symlink};
        let fixture = Fixture::new();
        let path = fixture.path("workflow.xml");
        fs::write(&path, b"original").unwrap();
        for ending in [b"/".as_slice(), b"/."] {
            let mut bytes = path.clone().into_os_string().into_vec();
            bytes.extend_from_slice(ending);
            assert!(
                write_atomic(Path::new(&std::ffi::OsString::from_vec(bytes)), b"denied").is_err()
            );
        }
        let link = fixture.path("link.xml");
        symlink("workflow.xml/.", &link).unwrap();
        assert!(write_atomic(&link, b"denied").is_err());
        assert_eq!(fs::read_link(link).unwrap(), Path::new("workflow.xml/."));
        assert_eq!(fs::read(fixture.path("workflow.xml")).unwrap(), b"original");
    }

    #[test]
    fn cleanup_failure_keeps_original_and_reports_temporary_path() {
        let fixture = Fixture::new();
        let path = fixture.path("workflow.xml");
        fs::write(&path, b"original").unwrap();
        let mut blocked_temporary = None;
        let error = write_atomic_with(&path, |file| {
            file.write_all(b"partial")?;
            let temporary = fixture
                .entries()
                .into_iter()
                .find(|entry| entry != &path)
                .unwrap();
            *file = File::open(&path)?;
            fs::remove_file(&temporary)?;
            fs::create_dir(&temporary)?;
            blocked_temporary = Some(temporary);
            Err(io::Error::new(
                io::ErrorKind::Other,
                "injected writer failure",
            ))
        })
        .unwrap_err();
        let temporary = blocked_temporary.unwrap();
        assert!(error.to_string().contains("injected writer failure"));
        assert!(error
            .to_string()
            .contains("could not remove temporary file"));
        assert!(error.to_string().contains(&temporary.display().to_string()));
        assert_eq!(fs::read(&path).unwrap(), b"original");
        // Cleanup cannot delete a path externally changed into a directory.
        fs::remove_dir(temporary).unwrap();
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[cfg(unix)]
    #[test]
    fn file_sync_failure_is_precommit_and_cleans_temporary() {
        let fixture = Fixture::new();
        let path = fixture.path("workflow.xml");
        fs::write(&path, b"original").unwrap();
        let error = write_atomic_with(&path, |file| {
            file.write_all(b"replacement")?;
            // fsync on the Unix null device fails, unlike a regular file.
            *file = File::open("/dev/null")?;
            Ok(())
        })
        .unwrap_err();
        assert!(error.to_string().contains("sync temporary file"));
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[test]
    fn directory_sync_source_contract_reports_failure_after_commit() {
        let source = include_str!("atomic_file.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        let rename = source.find("fs::rename(").unwrap();
        let disarm = source.find("temporary.active = false;").unwrap();
        let sync = source.find("directory.sync_all()").unwrap();
        assert!(rename < disarm && disarm < sync);
        assert!(source.contains("replacement already committed"));
        assert!(source.contains("crash durability is unconfirmed"));
        assert!(source.contains("#[cfg(unix)]\n        directory.sync_all()"));
    }

    #[test]
    fn concurrent_saves_publish_only_complete_versions_and_leave_no_temporaries() {
        use std::sync::atomic::AtomicUsize;
        let fixture = Fixture::new();
        let path = fixture.path("concurrent.xml");
        let original = vec![0; 64 * 1024];
        fs::write(&path, &original).unwrap();
        let payloads: Vec<Vec<u8>> = (1..=8).map(|value| vec![value; original.len()]).collect();
        let staged = Arc::new(Barrier::new(payloads.len() + 1));
        let release = Arc::new(Barrier::new(payloads.len() + 1));
        let remaining = Arc::new(AtomicUsize::new(payloads.len()));
        let writers: Vec<_> = payloads
            .iter()
            .map(|payload| {
                let path = path.clone();
                let payload = payload.clone();
                let staged = staged.clone();
                let release = release.clone();
                let remaining = remaining.clone();
                std::thread::spawn(move || {
                    let result = write_atomic_with(&path, |file| {
                        file.write_all(&payload[..payload.len() / 2])?;
                        staged.wait();
                        release.wait();
                        file.write_all(&payload[payload.len() / 2..])
                    });
                    remaining.fetch_sub(1, Ordering::Release);
                    result.unwrap();
                })
            })
            .collect();
        staged.wait();
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(fixture.entries().len(), payloads.len() + 1);
        release.wait();
        while remaining.load(Ordering::Acquire) > 0 {
            let observed = fs::read(&path).unwrap();
            assert!(observed == original || payloads.contains(&observed));
            std::thread::yield_now();
        }
        for writer in writers {
            writer.join().unwrap();
        }
        assert!(payloads.contains(&fs::read(&path).unwrap()));
        assert_eq!(fixture.entries(), vec![path]);
    }

    #[test]
    fn command_source_preserves_success_and_only_dialog_none_cancels() {
        // Commands are desktop-only; check the IPC contract without importing
        // Tauri/GTK into these headless, std-only filesystem tests.
        let source = include_str!("commands/files.rs");
        let save = source
            .split("pub(crate) async fn save_file(")
            .nth(1)
            .unwrap()
            .split("#[tauri::command]")
            .next()
            .unwrap();
        let compact: String = save.split_whitespace().collect();
        assert!(!save.contains("std::fs::write"));
        assert_eq!(save.matches("write_atomic(").count(), 2);
        assert_eq!(
            compact
                .matches(".map_err(|error|error.to_string())?;")
                .count(),
            2
        );
        assert!(compact.contains("returnOk(save_result(true,save_path));"));
        assert!(compact.contains("Ok(save_result(true,save_path.to_string_lossy().to_string()))"));
        assert!(compact.contains("Some(file)=>{"));
        assert!(compact.contains(".as_path().ok_or_else("));
        assert!(save.contains("does not have a local filesystem path"));
        assert!(compact.contains(
            "None=>Ok(SaveResult{success:false,path:String::new(),file_name:String::new(),})"
        ));
        assert!(!save.contains("and_then"));
        assert!(!save.contains("unwrap_or_default"));
        assert!(source.contains("file_name: String"));
        assert!(source.contains("success: bool"));
        assert!(source.contains("path: String"));
    }
}
