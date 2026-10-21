import { useEffect, useRef, useState } from "react";
import { host } from "./host";
import { normalizeWorkspace, activateWorkspace, reorderDocuments } from "./workspace";
import type { WorkspaceLayout } from "./workspace";
import type { DocumentRecord, FileEntry, FolderResult, PathChange, RecentEntry, FileOperation } from "./types";
export function useDocuments(canPrepare: () => boolean = () => true) {
  const prepareEditor = useRef(canPrepare); prepareEditor.current = canPrepare;
  const [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [activeId, setActiveIdState] = useState("");
  const [workspace, setWorkspaceState] = useState<WorkspaceLayout | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]),
    [folder, setFolder] = useState<string | null>(null);
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const [autosave, setAutosave] = useState(
    () => localStorage.getItem("open-typora-autosave") !== "false",
  );
  const [fileOperationBusy, setFileOperationBusy] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const current = useRef({ documents, activeId, workspace });
  current.current = { documents, activeId, workspace };
  const inFlight = useRef(new Map<string, Promise<unknown>>());
  const closing = useRef(false);
  const closed = useRef<{ id: string; name: string }[]>([]);
  const activated = useRef<string[]>([]);
  const update = (id: string, patch: Partial<DocumentRecord>) =>
    setDocuments((records) => {
      const next = records.map(record => record.id === id ? { ...record, ...patch } : record);
      current.current = { ...current.current, documents: next }; return next;
    });
  const notify = (error: unknown) =>
    setMessage(error instanceof Error ? error.message : String(error));
  function reportFolderScan(result: FolderResult) {
    const notices = [];
    if (result.truncated) notices.push("目录显示前 1000 项，或最多 8 层子目录。");
    if (result.skipped) notices.push(`已跳过 ${result.skipped} 个暂时无法读取的文件或子目录。`);
    if (notices.length) setMessage(notices.join(" "));
  }
  useEffect(() => {
    let disposed = false;
    void host
      .restore()
      .then(async (session) => {
        if (disposed) return;
        const records = session?.documents || [];
        const id = records.some(record => record.id === session?.activeId) ? session!.activeId! : records[0]?.id || "";
        const layout = normalizeWorkspace(session?.workspace, records.map(record => record.id), id);
        current.current = { documents: records, activeId: id, workspace: layout };
        activated.current = id ? [id] : [];
        setDocuments(records); setActiveIdState(id); setWorkspaceState(layout);
        setFolder(session?.folder || null);
        if (session?.folder) {
          const scanned = await host.scan();
          if (!disposed) { setFiles(scanned.files); reportFolderScan(scanned); }
        }
        if (session?.restoreError) setMessage(session.restoreError);
        setRecent(await host.recent());
        setReady(true);
      })
      .catch((error) => {
        if (!disposed) {
          notify(error);
          setReady(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (closing.current) return;
      void host.persist({ documents, activeId, workspace }).catch(notify);
    }, 500);
    void host.setDirty(
      documents.some((record) => record.content !== record.savedContent),
    );
    return () => clearTimeout(timer);
  }, [documents, activeId, workspace, ready]);
  useEffect(() => {
    localStorage.setItem("open-typora-autosave", String(autosave));
  }, [autosave]);
  async function save(
    saveAs = false,
    id = current.current.activeId,
    force = false,
    automatic = false,
  ) {
    let record = current.current.documents.find((record) => record.id === id);
    if (!record) return;
    if (!prepareEditor.current()) { if (!automatic) setMessage("请先完成当前输入法组合输入，再保存。"); return; }
    if (record.conflict && !force && !saveAs) { if (!automatic) setMessage("磁盘文件已改变，请选择重新载入、另存副本或确认覆盖。"); return; }
    if (
      automatic &&
      (!record.path || record.conflict || inFlight.current.has(id))
    )
      return;
    if (inFlight.current.has(id)) await inFlight.current.get(id);
    record = current.current.documents.find(item => item.id === id);
    if (!record) return;
    const snapshot = record;
    setSaving(true);
    const promise = host
      .save(id, snapshot.content, saveAs, force)
      .then((result) => {
        if (result)
          update(id, {
            path: result.path,
            name: result.name,
            diskHash: result.diskHash,
            savedContent: snapshot.content,
            bom: result.bom, encoding: result.encoding,
            conflict: false,
          });
      })
      .catch((error) => {
        if ((error as { code?: string }).code === "EXTERNAL_CHANGE")
          update(id, { conflict: true });
        else notify(error);
      })
      .finally(() => {
        inFlight.current.delete(id);
        setSaving(inFlight.current.size > 0);
      });
    inFlight.current.set(id, promise);
    await promise;
  }
  useEffect(() => {
    if (!ready || !autosave || !host.native) return;
    const timer = setTimeout(() => {
      if (closing.current) return;
      for (const record of documents)
        if (
          record.path &&
          record.content !== record.savedContent &&
          !record.conflict
        )
          void save(false, record.id, false, true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [documents, autosave, ready]);
  useEffect(() => {
    if (!ready || !host.native) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running || closing.current || !prepareEditor.current()) return;
      running = true;
      try {
        for (const record of current.current.documents) {
          if (!record.path || inFlight.current.has(record.id)) continue;
          const change = await host.check(record.id);
          if (!change || !prepareEditor.current()) continue;
          const latest = current.current.documents.find(
            (item) => item.id === record.id,
          );
          if (!latest) continue;
          if (latest.content !== latest.savedContent || change.error) {
            if (!latest.conflict) update(record.id, { conflict: true });
          } else if (change.content !== undefined && change.diskHash) {
            const accepted = await host.acceptDisk(
              record.id,
              change.content,
              change.diskHash,
            );
            if (!prepareEditor.current()) { update(record.id, { conflict: true }); continue; }
            setDocuments((records) =>
              records.map((latestRecord) =>
                latestRecord.id !== record.id
                  ? latestRecord
                  : latestRecord.content === record.content &&
                      latestRecord.savedContent === record.savedContent
                    ? {
                        ...latestRecord,
                        content: accepted.content,
                        savedContent: accepted.content,
                        diskHash: accepted.diskHash,
                        lineEnding: accepted.lineEnding,
                        bom: accepted.bom,
                        encoding: accepted.encoding,
                        conflict: false,
                      }
                    : { ...latestRecord, conflict: true },
              ),
            );
          }
        }
      } catch (error) {
        notify(error);
      } finally {
        running = false;
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [ready]);
  function canSwitch() {
    if (closing.current) return false;
    if (prepareEditor.current()) return true;
    setMessage("请先完成当前输入法组合输入，再切换文档或窗格。");
    return false;
  }
  function setActiveId(id: string) {
    if (!current.current.documents.some(record => record.id === id)) return false;
    if (id !== current.current.activeId && !canSwitch()) return false;
    activated.current = [...activated.current.filter(item => item !== id), id].slice(-100);
    const layout = activateWorkspace(current.current.workspace, current.current.activeId, id);
    current.current = { ...current.current, activeId: id, workspace: layout };
    setActiveIdState(id); setWorkspaceState(layout);
    return true;
  }
  function setWorkspace(layout: WorkspaceLayout | null) {
    const value = normalizeWorkspace(layout, current.current.documents.map(record => record.id), current.current.activeId);
    current.current = { ...current.current, workspace: value }; setWorkspaceState(value);
  }
  async function split(direction: "columns" | "rows") {
    if (!canSwitch() || !current.current.activeId) return;
    if (current.current.workspace) { setWorkspace({ ...current.current.workspace, direction }); return; }
    const primaryId = current.current.activeId;
    let other = current.current.documents.find(record => record.id !== primaryId);
    if (!other) other = await create();
    if (other) setWorkspace({primaryId, secondaryId: other.id, direction, ratio:.5});
  }
  function closePane(id: string) {
    if (!canSwitch() || !current.current.workspace) return;
    const layout = current.current.workspace;
    setActiveId(id === layout.primaryId ? layout.secondaryId : layout.primaryId);
    setWorkspace(null);
  }
  function resizeWorkspace(ratio: number) {
    if (current.current.workspace && Number.isFinite(ratio)) setWorkspace({ ...current.current.workspace, ratio });
  }
  function swapPanes() {
    if (!canSwitch() || !current.current.workspace) return;
    const layout = current.current.workspace;
    setWorkspace({ ...layout, primaryId: layout.secondaryId, secondaryId: layout.primaryId, ratio: 1-layout.ratio });
  }
  function nextTab(back = false) {
    const records = current.current.documents, index = records.findIndex(record => record.id === current.current.activeId);
    if (records.length) setActiveId(records[(index + (back ? records.length-1 : 1)) % records.length].id);
  }
  function otherPane() {
    const layout = current.current.workspace;
    if (layout) setActiveId(current.current.activeId === layout.primaryId ? layout.secondaryId : layout.primaryId);
  }
  function reorder(source: string, target: string) {
    if (!canSwitch()) return;
    const records = reorderDocuments(current.current.documents,source,target);
    current.current = { ...current.current, documents: records }; setDocuments(records);
  }
  async function add(record: DocumentRecord | null) {
    if (!record || !canSwitch()) return;
    const existing = current.current.documents.find(
      (item) =>
        item.id === record.id || (record.path && item.path === record.path),
    );
    if (existing) {
      setActiveId(existing.id);
      return existing;
    }
    const records = [...current.current.documents, record];
    current.current = { ...current.current, documents: records };
    setDocuments(records); setActiveId(record.id);
    return record;
  }
  async function create() {
    if (!canSwitch()) return;
    const id = crypto.randomUUID();
    const name = `未命名${current.current.documents.filter((record) => !record.path).length ? ` ${current.current.documents.filter((record) => !record.path).length + 1}` : ""}.md`;
    const record: DocumentRecord = {
      id,
      path: null,
      name,
      content: "",
      savedContent: "",
      diskHash: null,
      lineEnding: "\n",
    };
    try {
      await host.registerDraft(record);
      return await add(record);
    } catch (error) {
      notify(error);
    }
  }
  async function open() {
    if (!canSwitch()) return;
    try {
      await add(await host.open());
      await refresh();
      setRecent(await host.recent());
    } catch (error) {
      notify(error);
    }
  }
  async function openFolder() {
    try {
      const result = await host.openFolder();
      if (result) {
        setFiles(result.files);
        setFolder(result.folder);
        setRecent(await host.recent());
        reportFolderScan(result);
      }
    } catch (error) {
      notify(error);
    }
  }
  async function openToken(token: string) {
    try {
      const added = await add(await host.openToken(token));
      setRecent(await host.recent());
      return added;
    } catch (error) {
      notify(error);
    }
  }
  async function refresh() {
    try {
      const result = await host.scan();
      setFiles(result.files);
      setFolder(result.folder);
    } catch (error) {
      notify(error);
    }
  }
  const fileOperationHandler = useRef<(phase: string, change: PathChange) => Promise<boolean>>(async () => false);
  fileOperationHandler.current = async (phase, change) => {
    if (phase === "release") { closing.current = false; setFileOperationBusy(false); return true; }
    if (phase === "prepare") {
      if (closing.current || !prepareEditor.current()) return false;
      closing.current = true; setFileOperationBusy(true);
      await Promise.allSettled([...inFlight.current.values()]);
      for (const record of current.current.documents) {
        if (!change.removedPath || !record.path || !(record.path === change.removedPath || record.path.startsWith(change.removedPath + "/")) || record.content === record.savedContent) continue;
        const answer = await host.confirmClose(record.name);
        if (answer === "cancel") return false;
        if (answer === "save") {
          const saved = await host.save(record.id, record.content); if (!saved) return false;
          current.current.documents = current.current.documents.map(item => item.id === saved.id ? saved : item);
          setDocuments(current.current.documents);
        }
      }
      await host.persist(current.current); return true;
    }
    if (phase === "commit") {
      const records = current.current.documents.filter(record => !change.removedPath || !record.path || !(record.path === change.removedPath || record.path.startsWith(change.removedPath + "/"))).map(record => {
        if (change.fromPath && change.toPath && record.path && (record.path === change.fromPath || record.path.startsWith(change.fromPath + "/"))) {
          const path = change.toPath + record.path.slice(change.fromPath.length); return { ...record, path, name: path.split("/").at(-1)! };
        }
        return record;
      });
      const id = records.some(record => record.id === current.current.activeId) ? current.current.activeId : records[0]?.id || "";
      const layout = normalizeWorkspace(current.current.workspace, records.map(record => record.id), id);
      current.current = { documents: records, activeId: id, workspace: layout }; setDocuments(records); setActiveIdState(id); setWorkspaceState(layout);
      await host.persist(current.current); await refresh(); setRecent(await host.recent()); return true;
    }
    return false;
  };
  useEffect(() => host.onFileOperation((phase, change) => fileOperationHandler.current(phase, change)), []);
  useEffect(() => {
    if (!ready || !host.native) return;
    const timer = setInterval(() => { if (!closing.current && document.visibilityState === "visible") void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [ready]);
  async function fileOperation(operation: FileOperation) {
    const result = await host.fileOperation(operation);
    if (!result) return;
    await refresh();
    if (result.newPath && /\.(md|markdown|mdown)$/i.test(result.newPath)) {
      const scanned = await host.scan(), entry = scanned.files.find(file => file.path === result.newPath);
      if (entry) await add(await host.openToken(entry.token));
    }
  }
  async function recentAction(action: string, path?: string) {
    const result = await host.recentAction(action, path);
    if (result && !Array.isArray(result)) {
      if ("files" in result) { setFiles(result.files); setFolder(result.folder); reportFolderScan(result); }
      else await add(result);
    }
    setRecent(await host.recent());
  }
  async function close(id = current.current.activeId) {
    if (!prepareEditor.current()) { setMessage("请先完成当前输入法组合输入，再关闭文档。"); return; }
    if (closing.current) return;
    closing.current = true;
    try {
    await inFlight.current.get(id);
    const record = current.current.documents.find((item) => item.id === id);
    if (!record) return;
    if (record.content !== record.savedContent) {
      const answer = await host.confirmClose(record.name);
      if (answer === "cancel") return;
      if (answer === "save") { const saved = await host.save(id, record.content); if (!saved) return; update(id, saved); }
      else if (record.path) await host.reload(id);
    }
    const remaining = current.current.documents.filter(
      (item) => item.id !== id,
    );
    const recent = activated.current.findLast(previous => previous !== id && remaining.some(record => record.id === previous));
    const nextId = current.current.activeId === id ? recent || remaining[Math.min(current.current.documents.findIndex(record => record.id === id), remaining.length-1)]?.id || "" : current.current.activeId;
    const layout = normalizeWorkspace(current.current.workspace, remaining.map(record => record.id), nextId);
    await host.persist({
      documents: remaining,
      activeId: nextId, workspace: layout,
    });
    activated.current = [...activated.current.filter(item => item !== id && item !== nextId), ...(nextId ? [nextId] : [])];
    current.current = { documents: remaining, activeId: nextId, workspace: layout };
    setDocuments(remaining); setActiveIdState(nextId); setWorkspaceState(layout);
    closed.current = [...closed.current.filter(item => item.id !== id), { id, name: record.name }].slice(-20);
    } catch (error) { notify(error); }
    finally { closing.current = false; setDocuments(records => [...records]); }
  }
  async function reopen() {
    const item = closed.current.at(-1);
    if (!item) { setMessage("没有最近关闭的文档。"); return; }
    try { await add(await host.reopen(item.id)); closed.current.pop(); } catch (error) { notify(error); }
  }
  async function reload() {
    if (!prepareEditor.current()) { setMessage("请先完成当前输入法组合输入，再重新打开。"); return; }
    const record = current.current.documents.find(
      (item) => item.id === current.current.activeId,
    );
    if (!record) return;
    if (
      record.content !== record.savedContent &&
      !(await host.confirmDiscard(record.name))
    )
      return;
    try {
      update(record.id, { ...(await host.reload(record.id)), conflict: false });
    } catch (error) {
      notify(error);
    }
  }
  async function changeEncoding(mode: "reopen" | "convert", encoding: string, bom: boolean) {
    if (closing.current || !prepareEditor.current()) throw new Error("请先完成输入法组合输入。");
    closing.current = true;
    try {
      const id = current.current.activeId;
      await inFlight.current.get(id);
      const record = current.current.documents.find(item => item.id === id);
      if (!record) return false;
      if (mode === "reopen" && record.content !== record.savedContent && !await host.confirmDiscard(record.name)) return false;
      const result = mode === "reopen" ? await host.reload(id, encoding) : await host.save(id, record.content, false, false, { encoding, bom });
      if (!result) return false;
      update(id, result);
      await host.persist(current.current);
      return true;
    } finally { closing.current = false; }
  }
  async function quit() {
    if (!prepareEditor.current()) { setMessage("请先完成当前输入法组合输入，再退出。"); await host.cancelClose(); return; }
    try {
      await Promise.allSettled([...inFlight.current.values()]);
      await host.persist(current.current);
      await host.setDirty(false);
      await host.closeWindow();
    } catch (error) {
      notify(error);
      if (window.desktop?.cancelClose) void window.desktop.cancelClose();
    }
  }
  async function closeWindow() {
    if (!prepareEditor.current()) { setMessage("请先完成当前输入法组合输入，再关闭窗口。"); await host.cancelClose(); return; }
    if (closing.current) return;
    closing.current = true;
    try {
      await Promise.allSettled([...inFlight.current.values()]);
      const remaining = [...current.current.documents];
      for (const record of [...remaining]) {
        if (record.content === record.savedContent) continue;
        const decision = await host.confirmClose(record.name);
        if (decision === "cancel") {
          closing.current = false;
          setDocuments((records) => [...records]);
          return;
        }
        if (decision === "save") {
          const saved = await host.save(record.id, record.content);
          if (!saved) {
            closing.current = false;
            setDocuments((records) => [...records]);
            return;
          }
          remaining[remaining.findIndex((item) => item.id === record.id)] =
            saved;
          update(record.id, saved);
        } else if (record.path)
          remaining[remaining.findIndex((item) => item.id === record.id)] =
            await host.reload(record.id);
        else
          remaining.splice(
            remaining.findIndex((item) => item.id === record.id),
            1,
          );
      }
      await host.persist({
        documents: remaining,
        activeId: remaining.some((item) => item.id === current.current.activeId)
          ? current.current.activeId
          : remaining[0]?.id || "",
        workspace: current.current.workspace,
      });
      await host.setDirty(false);
      await host.closeWindow();
    } catch (error) {
      closing.current = false;
      setDocuments((records) => [...records]);
      notify(error);
    }
  }
  return {
    documents,
    activeId, workspace, split, closePane, resizeWorkspace, swapPanes, nextTab, otherPane, reorder,
    canReopen: closed.current.length > 0,
    fileOperationBusy, fileOperation, recent, recentAction,
    setActiveId,
    active: documents.find((record) => record.id === activeId),
    files,
    folder,
    ready,
    message,
    setMessage,
    saving,
    autosave,
    setAutosave,
    update,
    save,
    add,
    create,
    open,
    openFolder,
    openToken,
    refresh,
    close,
    reopen,
    reload,
    changeEncoding,
    quit,
    closeWindow,
  };
}
