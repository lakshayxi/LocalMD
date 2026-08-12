use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File, Metadata},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};
#[cfg(target_os = "macos")]
use std::{os::fd::AsRawFd, os::unix::fs::MetadataExt, ptr};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};
use tempfile::NamedTempFile;
use uuid::Uuid;

const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mdx", "txt"];
// The renderer switches to its large-document path above 2 MiB. This native
// ceiling is deliberately higher, while still bounding an untrusted file's
// allocation and the bytes copied through the Tauri IPC boundary.
const MAX_NATIVE_FILE_BYTES: u64 = 32 * 1024 * 1024;
const FILE_TOO_LARGE_ERROR: &str = "LocalMD opens and saves files up to 32 MiB.";

#[derive(Clone)]
struct Fingerprint {
    last_modified: u64,
    size: u64,
    digest: [u8; 32],
}

struct OpenDocument {
    path: PathBuf,
    baseline: Option<Fingerprint>,
}

#[derive(Default)]
struct DocumentRegistry(Mutex<HashMap<String, OpenDocument>>);

const CLOSE_CHECK_EVENT: &str = "lifecycle-close-check";
const CLOSE_SAVE_EVENT: &str = "lifecycle-close-save";
const CLOSE_DISCARD_EVENT: &str = "lifecycle-close-discard";
const CLOSE_SAVE_LABEL: &str = "Save";
const CLOSE_DONT_SAVE_LABEL: &str = "Don't Save";
const CLOSE_CANCEL_LABEL: &str = "Cancel";

// Owns the single lifecycle protocol every native close/quit path shares: the
// red window-close button, Cmd+W (the default menu's Close Window item),
// Cmd+Q, and the Dock/menu-bar Quit item. macOS delivers those as two
// independent Tauri signals (WindowEvent::CloseRequested and
// RunEvent::ExitRequested), so both funnel through request_close.
//
// The document's dirty bit lives in the frontend store, not here, so Rust
// cannot decide the outcome on its own. It asks the frontend, shows the
// native alert only if the answer is dirty, and the frontend performs the
// save or discard itself through the same store methods every other save
// path uses. This flag is the only state Rust keeps: it makes a second close
// signal arriving mid-flow (a double Cmd+W, or Cmd+Q while the alert is
// still up) a no-op instead of a second dialog or a second save.
#[derive(Default)]
struct CloseCoordinator(Mutex<bool>);

impl CloseCoordinator {
    // Returns true if this call started the flow. False means one is
    // already running and the caller must not start another.
    fn begin(&self) -> bool {
        let mut in_progress = self.0.lock().unwrap();
        if *in_progress {
            return false;
        }
        *in_progress = true;
        true
    }

    fn end(&self) {
        *self.0.lock().unwrap() = false;
    }
}

fn request_close(app: &AppHandle, coordinator: &CloseCoordinator) {
    if !coordinator.begin() {
        return;
    }
    let _ = app.emit(CLOSE_CHECK_EVENT, ());
}

fn finish_close(app: &AppHandle, coordinator: &CloseCoordinator) {
    coordinator.end();
    app.exit(0);
}

fn cancel_close(coordinator: &CloseCoordinator) {
    coordinator.end();
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDocument {
    id: String,
    name: String,
    size: u64,
    last_modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRead {
    document: NativeDocument,
    text: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum NativeSaveOutcome {
    Saved { document: NativeDocument },
    Conflict { last_modified: u64 },
    Cancelled,
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            MARKDOWN_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
}

fn modified_millis(metadata: &Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis() as u64)
}

fn metadata_for(path: &Path) -> Result<Metadata, String> {
    fs::metadata(path).map_err(|_| "The file could not be inspected.".to_string())
}

fn ensure_supported_size(size: u64) -> Result<(), String> {
    if size > MAX_NATIVE_FILE_BYTES {
        Err(FILE_TOO_LARGE_ERROR.to_string())
    } else {
        Ok(())
    }
}

fn read_file_bytes(path: &Path) -> Result<(Vec<u8>, Metadata), String> {
    let metadata = metadata_for(path)?;
    ensure_supported_size(metadata.len())?;

    // Read at most one byte beyond the ceiling so a file that grows between
    // metadata inspection and the read cannot force an unbounded allocation.
    let file = File::open(path).map_err(|_| "The file could not be read.".to_string())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_NATIVE_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "The file could not be read.".to_string())?;
    ensure_supported_size(bytes.len() as u64)?;

    let metadata = metadata_for(path)?;
    ensure_supported_size(metadata.len())?;
    Ok((bytes, metadata))
}

fn descriptor(id: String, path: &Path, metadata: &Metadata) -> NativeDocument {
    NativeDocument {
        id,
        name: path.file_name().map_or_else(
            || "Untitled.md".to_string(),
            |name| name.to_string_lossy().into_owned(),
        ),
        size: metadata.len(),
        last_modified: modified_millis(metadata),
    }
}

fn fingerprint(path: &Path) -> Result<Fingerprint, String> {
    let (bytes, metadata) = read_file_bytes(path)?;
    Ok(Fingerprint {
        last_modified: modified_millis(&metadata),
        size: metadata.len(),
        digest: Sha256::digest(&bytes).into(),
    })
}

fn fingerprints_match(left: &Fingerprint, right: &Fingerprint) -> bool {
    left.last_modified == right.last_modified
        && left.size == right.size
        && left.digest == right.digest
}

fn register_path(
    registry: &DocumentRegistry,
    path: PathBuf,
    baseline: Option<Fingerprint>,
) -> Result<NativeDocument, String> {
    let canonical =
        fs::canonicalize(&path).map_err(|_| "The file could not be opened.".to_string())?;
    let metadata = metadata_for(&canonical)?;
    if !metadata.is_file() || !is_markdown(&canonical) {
        return Err("LocalMD opens Markdown and text files.".to_string());
    }
    ensure_supported_size(metadata.len())?;

    let id = Uuid::new_v4().to_string();
    let document = descriptor(id.clone(), &canonical, &metadata);
    registry
        .0
        .lock()
        .map_err(|_| "The document registry is unavailable.".to_string())?
        .insert(
            id,
            OpenDocument {
                path: canonical,
                baseline,
            },
        );
    Ok(document)
}

fn path_for(registry: &DocumentRegistry, document_id: &str) -> Result<PathBuf, String> {
    registry
        .0
        .lock()
        .map_err(|_| "The document registry is unavailable.".to_string())?
        .get(document_id)
        .map(|document| document.path.clone())
        .ok_or_else(|| "This document is no longer open.".to_string())
}

fn revoke_document(registry: &DocumentRegistry, document_id: &str) -> Result<bool, String> {
    Ok(registry
        .0
        .lock()
        .map_err(|_| "The document registry is unavailable.".to_string())?
        .remove(document_id)
        .is_some())
}

#[cfg(target_os = "macos")]
fn preserve_metadata(source: &File, destination: &File, metadata: &Metadata) -> Result<(), String> {
    // copyfile is the macOS metadata primitive. Copy only ACLs and extended
    // attributes so the content write still produces a truthful modification
    // time. Preserve mode bits explicitly. Ownership is best effort because a
    // user may edit a writable document owned by another account and macOS will
    // correctly refuse the chown without elevated privileges.
    destination
        .set_permissions(metadata.permissions())
        .map_err(|_| "The file permissions could not be preserved.".to_string())?;
    let copied = unsafe {
        libc::fcopyfile(
            source.as_raw_fd(),
            destination.as_raw_fd(),
            ptr::null_mut(),
            libc::COPYFILE_ACL | libc::COPYFILE_XATTR,
        )
    };
    if copied != 0 {
        return Err("The macOS file metadata could not be preserved.".to_string());
    }

    unsafe { libc::fchown(destination.as_raw_fd(), metadata.uid(), metadata.gid()) };
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn preserve_metadata(
    _source: &File,
    destination: &File,
    metadata: &Metadata,
) -> Result<(), String> {
    destination
        .set_permissions(metadata.permissions())
        .map_err(|_| "The file permissions could not be preserved.".to_string())
}

fn atomic_replace(
    path: &Path,
    bytes: &[u8],
    baseline: Option<&Fingerprint>,
    overwrite: bool,
) -> Result<Option<Fingerprint>, String> {
    ensure_supported_size(bytes.len() as u64)?;
    let parent = path
        .parent()
        .ok_or_else(|| "The save destination is unavailable.".to_string())?;
    let existing = match File::open(path) {
        Ok(file) => Some(file),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err("The original file metadata could not be preserved.".to_string()),
    };
    let mut temporary = NamedTempFile::new_in(parent)
        .map_err(|_| "A temporary save file could not be created.".to_string())?;

    if let Some(existing) = &existing {
        let metadata = existing
            .metadata()
            .map_err(|_| "The file metadata could not be inspected.".to_string())?;
        preserve_metadata(existing, temporary.as_file(), &metadata)?;
    }

    temporary
        .as_file_mut()
        .write_all(bytes)
        .map_err(|_| "The document could not be written.".to_string())?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|_| "The document could not be flushed to disk.".to_string())?;

    if !overwrite {
        let expected = baseline
            .ok_or_else(|| "The document must be read before it can be saved.".to_string())?;
        let current = fingerprint(path).map_err(|_| {
            "The original file changed or became unavailable. No changes were saved.".to_string()
        })?;
        if !fingerprints_match(expected, &current) {
            return Ok(Some(current));
        }
    }

    temporary.persist(path).map_err(|_| {
        "The original file was left unchanged because the save could not finish.".to_string()
    })?;

    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }

    Ok(None)
}

#[tauri::command]
async fn open_document(
    app: AppHandle,
    registry: State<'_, Arc<DocumentRegistry>>,
) -> Result<Option<NativeDocument>, String> {
    let registry = Arc::clone(registry.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Open Markdown")
            .add_filter("Markdown", MARKDOWN_EXTENSIONS)
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|_| "The selected file is unavailable.".to_string())?;
        register_path(&registry, path, None).map(Some)
    })
    .await
    .map_err(|_| "The file dialog did not finish.".to_string())?
}

#[tauri::command]
async fn read_document(
    document_id: String,
    registry: State<'_, Arc<DocumentRegistry>>,
) -> Result<NativeRead, String> {
    let registry = Arc::clone(registry.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let path = path_for(&registry, &document_id)?;
        let (bytes, metadata) = read_file_bytes(&path)?;
        let baseline = Fingerprint {
            last_modified: modified_millis(&metadata),
            size: metadata.len(),
            digest: Sha256::digest(&bytes).into(),
        };
        let text = String::from_utf8(bytes)
            .map_err(|_| "LocalMD currently opens UTF-8 Markdown files.".to_string())?;
        let document = descriptor(document_id.clone(), &path, &metadata);
        let mut documents = registry
            .0
            .lock()
            .map_err(|_| "The document registry is unavailable.".to_string())?;
        let entry = documents
            .get_mut(&document_id)
            .ok_or_else(|| "This document is no longer open.".to_string())?;
        entry.baseline = Some(baseline);
        Ok(NativeRead { document, text })
    })
    .await
    .map_err(|_| "The read operation did not finish.".to_string())?
}

#[tauri::command]
async fn close_document(
    document_id: String,
    registry: State<'_, Arc<DocumentRegistry>>,
) -> Result<(), String> {
    revoke_document(&registry, &document_id)?;
    Ok(())
}

// The frontend's answer to CLOSE_CHECK_EVENT: is the document dirty?
//
// A clean document closes immediately. A dirty one gets the native
// Save / Don't Save / Cancel alert. The alert runs off this command's own
// async task (show_with_result's callback fires on its own thread), so this
// command returns right away - the alert's outcome comes back later through
// CLOSE_SAVE_EVENT / CLOSE_DISCARD_EVENT or, for Cancel, by ending the
// coordinator directly.
#[tauri::command]
async fn report_close_readiness(
    app: AppHandle,
    dirty: bool,
    coordinator: State<'_, Arc<CloseCoordinator>>,
) -> Result<(), String> {
    if !dirty {
        finish_close(&app, &coordinator);
        return Ok(());
    }

    let coordinator = Arc::clone(coordinator.inner());
    let mut dialog = app
        .dialog()
        .message(
            "This document has unsaved changes. Your changes will be lost if you don't save them.",
        )
        .title("Do you want to save the changes you made?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            CLOSE_SAVE_LABEL.to_string(),
            CLOSE_DONT_SAVE_LABEL.to_string(),
            CLOSE_CANCEL_LABEL.to_string(),
        ));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }

    dialog.show_with_result(move |result| {
        let label = match result {
            MessageDialogResult::Custom(label) => label,
            _ => String::new(),
        };
        if label == CLOSE_SAVE_LABEL {
            let _ = app.emit(CLOSE_SAVE_EVENT, ());
        } else if label == CLOSE_DONT_SAVE_LABEL {
            let _ = app.emit(CLOSE_DISCARD_EVENT, ());
        } else {
            // Cancel, the dialog dismissed with Escape, or the window closed
            // some other way. Every one of those means stay open.
            cancel_close(&coordinator);
        }
    });
    Ok(())
}

// The frontend's answer once it has actually tried to save or discard.
//
// should_close is decided entirely by the frontend: a save that hit a
// conflict, failed, was cancelled, or raced against a newer edit leaves the
// document dirty, and the frontend reports that back rather than this
// command re-deriving it. Discard always reports true, because "Don't Save"
// is a decision, not a failure to save.
#[tauri::command]
async fn complete_close_flow(
    app: AppHandle,
    should_close: bool,
    coordinator: State<'_, Arc<CloseCoordinator>>,
) -> Result<(), String> {
    if should_close {
        finish_close(&app, &coordinator);
    } else {
        cancel_close(&coordinator);
    }
    Ok(())
}

#[tauri::command]
async fn stat_document(
    document_id: String,
    registry: State<'_, Arc<DocumentRegistry>>,
) -> Result<Option<NativeDocument>, String> {
    let registry = Arc::clone(registry.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let path = path_for(&registry, &document_id)?;
        match fs::metadata(&path) {
            Ok(metadata) if metadata.is_file() => {
                Ok(Some(descriptor(document_id, &path, &metadata)))
            }
            Ok(_) | Err(_) => Ok(None),
        }
    })
    .await
    .map_err(|_| "The file inspection did not finish.".to_string())?
}

#[tauri::command]
async fn save_document(
    document_id: String,
    encoded_text: String,
    overwrite: bool,
    registry: State<'_, Arc<DocumentRegistry>>,
) -> Result<NativeSaveOutcome, String> {
    let registry = Arc::clone(registry.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let (path, baseline) = {
            let documents = registry
                .0
                .lock()
                .map_err(|_| "The document registry is unavailable.".to_string())?;
            let entry = documents
                .get(&document_id)
                .ok_or_else(|| "This document is no longer open.".to_string())?;
            (entry.path.clone(), entry.baseline.clone())
        };

        if let Some(current) =
            atomic_replace(&path, encoded_text.as_bytes(), baseline.as_ref(), overwrite)?
        {
            return Ok(NativeSaveOutcome::Conflict {
                last_modified: current.last_modified,
            });
        }

        let next = fingerprint(&path)?;
        let metadata = metadata_for(&path)?;
        registry
            .0
            .lock()
            .map_err(|_| "The document registry is unavailable.".to_string())?
            .get_mut(&document_id)
            .ok_or_else(|| "This document is no longer open.".to_string())?
            .baseline = Some(next);
        Ok(NativeSaveOutcome::Saved {
            document: descriptor(document_id, &path, &metadata),
        })
    })
    .await
    .map_err(|_| "The save operation did not finish.".to_string())?
}

#[tauri::command]
async fn save_document_as(
    app: AppHandle,
    encoded_text: String,
    suggested_name: String,
    registry: State<'_, Arc<DocumentRegistry>>,
) -> Result<NativeSaveOutcome, String> {
    let registry = Arc::clone(registry.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Save Markdown")
            .set_file_name(suggested_name)
            .add_filter("Markdown", MARKDOWN_EXTENSIONS)
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(NativeSaveOutcome::Cancelled);
        };
        let path = selected
            .into_path()
            .map_err(|_| "The save destination is unavailable.".to_string())?;
        if !is_markdown(&path) {
            return Err("Save the document with a Markdown or text extension.".to_string());
        }

        atomic_replace(&path, encoded_text.as_bytes(), None, true)?;
        let baseline = fingerprint(&path)?;
        let document = register_path(&registry, path, Some(baseline))?;
        Ok(NativeSaveOutcome::Saved { document })
    })
    .await
    .map_err(|_| "The save dialog did not finish.".to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(DocumentRegistry::default()))
        .manage(Arc::new(CloseCoordinator::default()))
        .invoke_handler(tauri::generate_handler![
            open_document,
            read_document,
            stat_document,
            save_document,
            save_document_as,
            close_document,
            report_close_readiness,
            complete_close_flow
        ])
        // Covers the red close button and Cmd+W (the default menu's Close
        // Window item routes here too). Always prevented up front: closing
        // for real happens only from finish_close, once the frontend has
        // confirmed there is nothing left to protect.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                let coordinator = app.state::<Arc<CloseCoordinator>>();
                request_close(app, &coordinator);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        // Covers Cmd+Q and the Dock/menu-bar Quit item. On macOS this fires
        // independently of WindowEvent::CloseRequested, so it needs the same
        // guard rather than assuming the window-close path already ran.
        //
        // `code` is None only for an exit requested by user interaction.
        // finish_close's own `app.exit(0)` raises this same event with
        // `code: Some(0)` as it works its way through the runtime - without
        // this check that request would hit prevent_exit and loop back into
        // request_close forever, since the coordinator it just released would
        // happily start a second round.
        if let RunEvent::ExitRequested { api, code, .. } = event {
            if code.is_none() {
                api.prevent_exit();
                let coordinator = app_handle.state::<Arc<CloseCoordinator>>();
                request_close(app_handle, &coordinator);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_coordinator_refuses_a_second_flow_until_the_first_ends() {
        let coordinator = CloseCoordinator::default();

        assert!(
            coordinator.begin(),
            "the first close attempt should start the flow"
        );
        assert!(
            !coordinator.begin(),
            "a second close signal must not start a second flow while one is in progress"
        );

        coordinator.end();

        assert!(
            coordinator.begin(),
            "ending the flow must let a later close attempt start a fresh one"
        );
    }

    #[test]
    fn close_coordinator_starts_idle() {
        // begin() must succeed on a brand new app launch, with no prior
        // close attempt to have left it stuck.
        let coordinator = CloseCoordinator::default();
        assert!(coordinator.begin());
    }

    #[test]
    fn conflict_preflight_leaves_the_external_version_untouched() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "original\n").expect("write original");
        let baseline = fingerprint(&path).expect("baseline");
        fs::write(&path, "external change\n").expect("write external change");

        let conflict = atomic_replace(&path, b"mine\n", Some(&baseline), false)
            .expect("save preflight should finish");

        assert!(conflict.is_some());
        assert_eq!(
            fs::read_to_string(path).expect("read result"),
            "external change\n"
        );
    }

    #[test]
    fn explicit_overwrite_replaces_a_conflicting_version() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "original\n").expect("write original");
        let baseline = fingerprint(&path).expect("baseline");
        fs::write(&path, "external change\n").expect("write external change");

        let conflict = atomic_replace(&path, b"mine\n", Some(&baseline), true)
            .expect("overwrite should finish");

        assert!(conflict.is_none());
        assert_eq!(fs::read_to_string(path).expect("read result"), "mine\n");
    }

    #[test]
    fn missing_target_is_not_recreated_without_overwrite() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "original\n").expect("write original");
        let baseline = fingerprint(&path).expect("baseline");
        fs::remove_file(&path).expect("remove original");

        let result = atomic_replace(&path, b"mine\n", Some(&baseline), false);

        assert!(result.is_err());
        assert!(!path.exists());
    }

    #[test]
    fn oversized_save_is_rejected_without_touching_the_original() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "original\n").expect("write original");
        let bytes = vec![b'a'; (MAX_NATIVE_FILE_BYTES + 1) as usize];

        let result = atomic_replace(&path, &bytes, None, true);

        assert_eq!(result.err().as_deref(), Some(FILE_TOO_LARGE_ERROR));
        assert_eq!(
            fs::read_to_string(path).expect("read original"),
            "original\n"
        );
    }

    #[test]
    fn opaque_registration_keeps_the_path_inside_the_registry() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "local\n").expect("write document");
        let registry = DocumentRegistry::default();

        let document = register_path(&registry, path.clone(), None).expect("register document");

        assert_ne!(document.id, path.to_string_lossy());
        assert_eq!(document.name, "document.md");
        assert_eq!(
            path_for(&registry, &document.id).expect("registered path"),
            fs::canonicalize(path).expect("canonical path")
        );
    }

    #[test]
    fn oversized_files_are_rejected_before_registration_or_reading() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("large.md");
        let file = File::create(&path).expect("create sparse document");
        file.set_len(MAX_NATIVE_FILE_BYTES + 1)
            .expect("size sparse document");
        let registry = DocumentRegistry::default();

        let registration = register_path(&registry, path.clone(), None);
        let read = read_file_bytes(&path);

        assert_eq!(registration.err().as_deref(), Some(FILE_TOO_LARGE_ERROR));
        assert_eq!(read.err().as_deref(), Some(FILE_TOO_LARGE_ERROR));
        assert!(registry.0.lock().expect("registry").is_empty());
    }

    #[test]
    fn removing_a_document_revokes_its_opaque_token() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "local\n").expect("write document");
        let registry = DocumentRegistry::default();
        let document = register_path(&registry, path, None).expect("register document");

        assert!(revoke_document(&registry, &document.id).expect("revoke token"));
        assert!(!revoke_document(&registry, &document.id).expect("repeat token revocation"));
        assert_eq!(
            path_for(&registry, &document.id).err().as_deref(),
            Some("This document is no longer open.")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn atomic_replace_preserves_macos_extended_attributes() {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        use std::os::unix::fs::{MetadataExt, PermissionsExt};

        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("document.md");
        fs::write(&path, "original\n").expect("write original");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).expect("set original mode");
        let original_metadata = fs::metadata(&path).expect("original metadata");
        let c_path = CString::new(path.as_os_str().as_bytes()).expect("C path");
        let name = CString::new("com.localmd.metadata-test").expect("attribute name");
        let value = b"preserved";
        let set_result = unsafe {
            libc::setxattr(
                c_path.as_ptr(),
                name.as_ptr(),
                value.as_ptr().cast(),
                value.len(),
                0,
                0,
            )
        };
        assert_eq!(set_result, 0, "set test extended attribute");

        atomic_replace(&path, b"updated\n", None, true).expect("replace document");

        let mut buffer = [0_u8; 32];
        let read = unsafe {
            libc::getxattr(
                c_path.as_ptr(),
                name.as_ptr(),
                buffer.as_mut_ptr().cast(),
                buffer.len(),
                0,
                0,
            )
        };
        assert_eq!(read, value.len() as isize);
        assert_eq!(&buffer[..value.len()], value);
        let replaced_metadata = fs::metadata(&path).expect("replaced metadata");
        assert_eq!(replaced_metadata.uid(), original_metadata.uid());
        assert_eq!(replaced_metadata.gid(), original_metadata.gid());
        assert_eq!(replaced_metadata.mode() & 0o777, 0o640);
    }
}
