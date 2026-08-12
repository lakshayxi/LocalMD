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
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(DocumentRegistry::default()))
        .invoke_handler(tauri::generate_handler![
            open_document,
            read_document,
            stat_document,
            save_document,
            save_document_as,
            close_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

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
