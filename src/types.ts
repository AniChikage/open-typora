export interface DocumentRecord {
  id: string;
  path: string | null;
  name: string;
  content: string;
  savedContent: string;
  diskHash: string | null;
  lineEnding: string;
  conflict?: boolean;
  bom?: boolean;
  encoding?: string;
}
export interface FileEntry {
  token: string;
  name: string;
  relative: string;
  path: string;
  isDirectory?: string;
  modified?: string;
  created?: string;
}
export interface RecentEntry { path: string; name: string; folder: boolean; pinned: boolean }
export interface FileOperation { action: "new-file" | "new-folder" | "duplicate" | "rename" | "move" | "trash" | "undo"; path?: string; name?: string; target?: string }
export interface PathChange { fromPath?: string; toPath?: string; removedPath?: string; newPath?: string }
export interface SearchMatch { token: string; path: string; name: string; line: number; column: number; length: number; preview: string }
export interface SearchResult { matches: SearchMatch[]; truncated: boolean; skipped: number }
export interface FolderResult {
  folder: string | null;
  files: FileEntry[];
  truncated: boolean;
}
export interface Recovery {
  documents: DocumentRecord[];
  activeId?: string;
  folder?: string | null;
  restoreError?: string;
}
export interface DiskChange {
  content?: string;
  diskHash?: string;
  error?: string;
  missing?: boolean;
}
export interface SessionSnapshot {
  documents: DocumentRecord[];
  activeId: string;
}
export interface Command {
  action: string;
  message?: string;
  document?: DocumentRecord;
  anchor?: string;
  line?: number;
}
export interface Host {
  native: boolean;
  cancelClose(): Promise<unknown>;
  windowAction(action: string): Promise<unknown>;
  imageAction(id: string, sources: string[], action: string, options?: Record<string, unknown>): Promise<Record<string, string> | null>;
  themes(): Promise<{ id: string; name: string; css: string }[]>;
  installTheme(): Promise<string | null>;
  plugins(): Promise<{ id: string; name: string; url: string }[]>;
  installPlugin(): Promise<{ id: string; name: string; url: string } | null>;
  removePlugin(id: string): Promise<unknown>;
  conversionSettings(choose?: boolean): Promise<{ pandoc: string; word: boolean }>;
  importDocument(): Promise<{ html?: string; markdown?: string; name: string } | null>;
  exportConverted(id: string, format: string, source: string, html: string): Promise<string | null>;
  restore(): Promise<Recovery | null>;
  registerDraft(record: DocumentRecord): Promise<unknown>;
  open(): Promise<DocumentRecord | null>;
  openFolder(): Promise<FolderResult | null>;
  scan(): Promise<FolderResult>;
  fileOperation(operation: FileOperation): Promise<PathChange | null>;
  onFileOperation(callback: (phase: string, change: PathChange) => Promise<boolean>): () => void;
  recent(): Promise<RecentEntry[]>;
  recentAction(action: string, path?: string): Promise<FolderResult | DocumentRecord | RecentEntry[] | null>;
  searchFiles(query: string, options: { regex: boolean; caseSensitive: boolean }): Promise<SearchResult>;
  reveal(path: string): Promise<unknown>;
  openToken(token: string): Promise<DocumentRecord>;
  reopen(id: string): Promise<DocumentRecord>;
  chooseImage(id: string, options?: Record<string, unknown>): Promise<{ path: string; alt: string } | null>;
  save(
    id: string,
    text: string,
    saveAs?: boolean,
    force?: boolean,
    options?: { encoding: string; bom: boolean },
  ): Promise<DocumentRecord | null>;
  persist(session: SessionSnapshot): Promise<unknown>;
  check(id: string): Promise<DiskChange | null>;
  reload(id: string, encoding?: string): Promise<DocumentRecord>;
  acceptDisk(
    id: string,
    content: string,
    hash: string,
  ): Promise<DocumentRecord>;
  importImage(id: string, bytes: Uint8Array, name: string, options?: Record<string, unknown>): Promise<string>;
  exportPdf(html?: string, options?: Record<string, unknown>): Promise<string | null>;
  exportHtml(name: string, html: string): Promise<string | null>;
  writeClipboard(text: string): Promise<unknown>;
  readClipboard(): Promise<string>;
  openLink(url: string): Promise<unknown>;
  openDocumentLink(id: string, url: string): Promise<unknown>;
  confirmDiscard(name: string): Promise<boolean>;
  confirmClose(name: string): Promise<"save" | "discard" | "cancel">;
  setDirty(dirty: boolean): Promise<unknown>;
  closeWindow(): Promise<unknown>;
  onCommand(callback: (command: Command) => void): () => void;
}
declare global {
  interface Window {
    desktop?: Record<string, (...args: any[]) => any>;
  }
}
