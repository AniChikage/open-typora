import { useEffect, useRef, useState } from "react";
import { host } from "./host";
import type { DocumentRecord, FileEntry } from "./types";
export function useDocuments() {
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
  const current = useRef({ documents, activeId });
  current.current = { documents, activeId };
  const inFlight = useRef(new Map<string, Promise<unknown>>());
  const closing = useRef(false);
  const update = (id: string, patch: Partial<DocumentRecord>) =>
    setDocuments((records) =>
      records.map((record) =>
        record.id === id ? { ...record, ...patch } : record,
      ),
    );
  const notify = (error: unknown) =>
    setMessage(error instanceof Error ? error.message : String(error));
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
          if (!disposed) setFiles(scanned.files);
        }
        if (session?.restoreError) setMessage(session.restoreError);
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
    const record = current.current.documents.find((record) => record.id === id);
    if (!record) return;
    if (
      automatic &&
      (!record.path || record.conflict || inFlight.current.has(id))
    )
      return;
    if (inFlight.current.has(id)) await inFlight.current.get(id);
    setSaving(true);
    const promise = host
      .save(id, record.content, saveAs, force)
      .then((result) => {
        if (result)
          update(id, {
            path: result.path,
            name: result.name,
            diskHash: result.diskHash,
            savedContent: record.content,
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
      if (running || closing.current) return;
      running = true;
      try {
        for (const record of current.current.documents) {
          if (!record.path || inFlight.current.has(record.id)) continue;
          const change = await host.check(record.id);
          if (!change) continue;
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
      return;
    }
    setDocuments((records) => [...records, record]);
    setActiveId(record.id);
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
        if (result.truncated)
          setMessage("目录显示前 1000 个文件，或最多 8 层子目录。");
      }
    } catch (error) {
      notify(error);
    }
  }
  async function openToken(token: string) {
    try {
      await add(await host.openToken(token));
    } catch (error) {
      notify(error);
    }
  }
  async function refresh() {
    try {
      const result = await host.scan();
      setFiles(result.files);
    } catch (error) {
      notify(error);
    }
  }
  async function close(id = current.current.activeId) {
    const record = current.current.documents.find((item) => item.id === id);
    if (!record) return;
    if (
      record.content !== record.savedContent &&
      !(await host.confirmDiscard(record.name))
    )
      return;
    const remaining = current.current.documents.filter(
      (item) => item.id !== id,
    );
    setDocuments(remaining);
    if (current.current.activeId === id) setActiveId(remaining[0]?.id || "");
    await host.persist({
      documents: remaining,
      activeId: remaining[0]?.id || "",
    });
  }
  async function reload() {
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
  async function quit() {
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
    reload,
    quit,
    closeWindow,
  };
}
