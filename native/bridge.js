(() => {
  const pending = new Map(),
    listeners = new Set();
  let sequence = 0;
  const request = (name, args) =>
    new Promise((resolve, reject) => {
      const id = `request-${++sequence}`;
      pending.set(id, { resolve, reject });
      try {
        window.webkit.messageHandlers.opentypora.postMessage({
          id,
          name,
          args,
        });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  const methods = [
    "restore",
    "registerDraft",
    "open",
    "openFolder",
    "scan",
    "openToken",
    "save",
    "persist",
    "check",
    "reload",
    "acceptDisk",
    "exportPdf",
    "openLink",
    "confirmDiscard",
    "confirmClose",
    "setDirty",
    "cancelClose",
    "historyState",
  ];
  const desktop = Object.fromEntries(
    methods.map((name) => [name, (...args) => request(name, args)]),
  );
  desktop.importImage = (id, bytes, name) => {
    let text = "";
    for (let i = 0; i < bytes.length; i += 16384)
      text += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return request("importImage", [id, btoa(text), name]);
  };
  desktop.closeWindow = () => request("closeWindow", []);
  desktop.onCommand = (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  };
  Object.defineProperty(window, "desktop", { value: Object.freeze(desktop) });
  Object.defineProperty(window, "__openTypora", {
    value: Object.freeze({
      receive({ id, result }) {
        const item = pending.get(id);
        if (item) {
          pending.delete(id);
          item.resolve(result);
        }
      },
      command(command) {
        for (const callback of listeners) callback(command);
      },
    }),
  });
  if (!crypto.randomUUID)
    crypto.randomUUID = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const text = [...bytes]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
    };
})();
