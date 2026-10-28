export interface AIConfig { protocol: "openai" | "ollama"; baseUrl: string; model: string }
export interface AISettings extends AIConfig { hasKey: boolean; keyStorage: "system" | "session" | "none"; secureStorage: boolean }
export interface AISettingsUpdate extends AIConfig { apiKey?: string; clearKey?: boolean; rememberKey: boolean }
export interface AIRewriteRequest { id: string; instruction: string; text: string }
export interface WorkspaceLayout { primaryId: string; secondaryId: string; direction: "columns" | "rows"; ratio: number }
export interface BackgroundAsset { name: string; dataUrl: string }
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
  skipped?: number;
}
export interface Recovery {
  workspace?: WorkspaceLayout | null;
  documents: DocumentRecord[];
  activeId?: string;
  folder?: string | null;
  restoreError?: string;
}
export interface DiskChange {
  bom?: boolean;
  encoding?: string;
  content?: string;
  diskHash?: string;
  error?: string;
  missing?: boolean;
}
export interface SessionSnapshot {
  workspace?: WorkspaceLayout | null;
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
  aiSettings(update?: AISettingsUpdate): Promise<AISettings>;
  aiRewrite(request: AIRewriteRequest): Promise<{ text: string; model: string }>;
  aiCancel(id: string): Promise<unknown>;
  cancelClose(): Promise<unknown>;
  windowAction(action: string): Promise<unknown>;
  imageAction(id: string, sources: string[], action: string, options?: Record<string, unknown>): Promise<Record<string, string> | null>;
  themes(): Promise<{ id: string; name: string; css: string }[]>;
  installTheme(): Promise<string | null>;
  background(): Promise<BackgroundAsset | null>;
  chooseBackground(): Promise<BackgroundAsset | null>;
  clearBackground(): Promise<unknown>;
  plugins(): Promise<{ id: string; name: string; url: string }[]>;
  installPlugin(folder?: boolean): Promise<{ id: string; name: string; url: string } | null>;
  removePlugin(id: string): Promise<unknown>;
  conversionSettings(choose?: boolean): Promise<{ pandoc: string; word: boolean; libreOffice?: string }>;
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
  reveal(path: string, openFolder?: boolean): Promise<unknown>;
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
  exportTheme(name: string, css: string): Promise<string | null>;
  previewSettings(enable?: boolean): Promise<{ supported: boolean; available: boolean; enabled: boolean }>;
  writeClipboard(text: string): Promise<unknown>;
  readClipboard(): Promise<string>;
  readClipboardFormats(): Promise<{ text: string; html: string }>;
  clipboardAction(action: "cut" | "copy" | "paste"): Promise<unknown>;
  openLink(url: string): Promise<unknown>;
  openDocumentLink(id: string, url: string): Promise<unknown>;
  confirmDiscard(name: string): Promise<boolean>;
  confirmClose(name: string): Promise<"save" | "discard" | "cancel">;
  setDirty(dirty: boolean): Promise<unknown>;
  closeWindow(): Promise<unknown>;
  onCommand(callback: (command: Command) => void): () => void;
}

export type BridgeResponse<T> = { ok: true; value: T; error?: never; code?: never } | { ok: false; error: string; code?: string; value?: never };
type AsyncMethod = (...args: never[]) => Promise<unknown>;
type RequestKeys = { [K in keyof Host]: Host[K] extends AsyncMethod ? K : never }[keyof Host];
export type DesktopRequests = Omit<Pick<Host, RequestKeys>, "windowAction" | "closeWindow"> & {
  ready(): Promise<unknown>;
  windowAction(action: string): Promise<unknown>;
  historyState(undo: boolean, redo: boolean, rendered: boolean, context: string): Promise<void>;
  viewState(focus: boolean, typewriter: boolean, sidebar: boolean): Promise<void>;
  readResource(address: string): Promise<{ base64: string; mime: string }>;
};
export type BridgeMethod<K extends keyof DesktopRequests> = (...args: Parameters<DesktopRequests[K]>) => Promise<BridgeResponse<Awaited<ReturnType<DesktopRequests[K]>>>>;
export type DesktopBridge = { [K in Exclude<keyof DesktopRequests, "windowAction" | "historyState" | "viewState">]: BridgeMethod<K> } & {
  windowAction?: BridgeMethod<"windowAction">;
  historyState?: BridgeMethod<"historyState">;
  viewState?: BridgeMethod<"viewState">;
  closeWindow(): Promise<unknown>;
  onCommand(callback: (command: Command) => void): () => void;
  onFileOperation(callback: (phase: string, change: PathChange) => Promise<boolean>): () => void;
};
declare global {
  interface Window {
    desktop?: DesktopBridge;
    webkit: { messageHandlers: Record<string, { postMessage(message: unknown): void }> };
    __openTypora: {
      receive(message: { id: string; result: BridgeResponse<unknown> }): void;
      command(command: Command): void;
      fileOperation(phase: string, change: PathChange): Promise<boolean>;
    };
  }
}

type AliasedRequest = "registerDraft" | "openFolder" | "openToken" | "importImage" | "exportHtml" | "exportPdf" | "openLink" | "openDocumentLink" | "confirmDiscard" | "setDirty" | "windowAction" | "historyState" | "viewState";
export type IpcRequests = Omit<DesktopRequests, AliasedRequest> & {
  draft: Host["registerDraft"]; folder: Host["openFolder"]; token: Host["openToken"];
  image: Host["importImage"]; html: Host["exportHtml"]; pdf: Host["exportPdf"];
  link: Host["openLink"]; documentLink: Host["openDocumentLink"];
  discard: Host["confirmDiscard"]; dirty: Host["setDirty"];
};
