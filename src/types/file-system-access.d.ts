/**
 * File System Access API declarations.
 *
 * TypeScript's DOM lib does not yet cover the permission methods or
 * `showOpenFilePicker`, because the spec is not on a standards track that all
 * engines have adopted — which is the same reason the app treats it as a
 * progressive enhancement rather than a baseline.
 *
 * Declared narrowly: only the members actually used, so this file does not
 * quietly become an unmaintained fork of the spec. When the DOM lib ships these,
 * delete the file and the compiler will point at anything that mattered.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
  /** Chromium remembers a directory per id, so the picker reopens where you left off. */
  id?: string;
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads';
}

interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
