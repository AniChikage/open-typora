export const MAX_FILE_BYTES = 1024 * 1024;

export function decodeMarkdown(bytes: Uint8Array, name: string): string {
  if (!/\.(?:md|markdown|mdown|txt)$/i.test(name))
    throw new Error("Choose a Markdown or .txt file.");
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw new Error("This demo accepts files up to 1 MB. Use the desktop app for larger files.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("This file isn't UTF-8. Convert it to UTF-8, or open it in the desktop app to choose an encoding."); }
  if (text.includes("\0")) throw new Error("This looks like a binary or UTF-16 file. Choose a UTF-8 text file.");
  return text.replace(/\r\n?/g, "\n");
}

export function downloadName(name: string): string {
  const basename = name.split(/[\\/]/).at(-1) || "untitled.md";
  return basename.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\.(?:markdown|mdown|txt)$/i, ".md").replace(/(?:\.md)?$/i, ".md");
}
