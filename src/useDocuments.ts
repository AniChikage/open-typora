import { useEffect, useRef, useState } from "react";
import { host } from "./host";
import type { DocumentRecord, FileEntry, FolderResult, PathChange, RecentEntry, FileOperation } from "./types";
export function useDocuments(canPrepare: () => boolean = () => true) {
  const prepareEditor = useRef(canPrepare); prepareEditor.current = canPrepare;
  const [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [activeId, setActiveId] = useState("");
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
  const current = useRef({ documents, activeId });
  current.current = { documents, activeId };
  const inFlight = useRef(new Map<string, Promise<unknown>>());
  const closing = useRef(false);
  const closed = useRef<{ id: string; name: string }[]>([]);
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
        setDocuments(records);
        setActiveId(
          records.some((record) => record.id === session?.activeId)
            ? session!.activeId!
            : records[0]?.id || "",
        );
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
      void host.persist({ documents, activeId }).catch(notify);
    }, 500);
    void host.setDirty(
      documents.some((record) => record.content !== record.savedContent),
    );
    return () => clearTimeout(timer);
  }, [documents, activeId, ready]);
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
  async function add(record: DocumentRecord | null) {
    if (!record) return;
    const existing = current.current.documents.find(
      (item) =>
        item.id === record.id || (record.path && item.path === record.path),
    );
    if (existing) {
      setActiveId(existing.id);
      return existing;
    }
    setDocuments((records) => [...records, record]);
    setActiveId(record.id);
    return record;
  }
  async function create() {
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
      await add(record);
    } catch (error) {
      notify(error);
    }
  }
  async function open() {
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
      current.current = { documents: records, activeId: id }; setDocuments(records); setActiveId(id);
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
    const nextId = current.current.activeId === id ? remaining[0]?.id || "" : current.current.activeId;
    await host.persist({
      documents: remaining,
      activeId: nextId,
    });
    setDocuments(remaining); setActiveId(nextId);
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
    activeId,
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
