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
}
export interface FileEntry {
  token: string;
  name: string;
  relative: string;
  path: string;
}
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
  document?: DocumentRecord;
}
export interface Host {
  native: boolean;
  restore(): Promise<Recovery | null>;
  registerDraft(record: DocumentRecord): Promise<unknown>;
  open(): Promise<DocumentRecord | null>;
  openFolder(): Promise<FolderResult | null>;
  scan(): Promise<FolderResult>;
  openToken(token: string): Promise<DocumentRecord>;
  save(
    id: string,
    text: string,
    saveAs?: boolean,
    force?: boolean,
  ): Promise<DocumentRecord | null>;
  persist(session: SessionSnapshot): Promise<unknown>;
  check(id: string): Promise<DiskChange | null>;
  reload(id: string): Promise<DocumentRecord>;
  acceptDisk(
    id: string,
    content: string,
    hash: string,
  ): Promise<DocumentRecord>;
  importImage(id: string, bytes: Uint8Array, name: string): Promise<string>;
  exportPdf(html?: string): Promise<string | null>;
  openLink(url: string): Promise<unknown>;
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
