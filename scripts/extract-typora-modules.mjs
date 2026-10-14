// Inert source extraction for REA. Never evaluates the vendor's JavaScript.
import { parse } from "@babel/parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const [input, destination] = process.argv.slice(2);
if (!input || !destination)
  throw new Error(
    "Usage: node scripts/extract-typora-modules.mjs <main.js> <directory outside this checkout>",
  );
const output = path.resolve(destination),
  relative = path.relative(process.cwd(), output);
if (!relative.startsWith("..") && !path.isAbsolute(relative))
  throw new Error("Keep third-party source outside this checkout.");
const source = await readFile(input, "utf8"),
  ast = parse(source, { sourceType: "unambiguous" }),
  modules = [],
  pending = [ast];
const digest = (text) => createHash("sha256").update(text).digest("hex");
while (pending.length) {
  const node = pending.pop();
  if (!node || typeof node !== "object") continue;
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.name === "registerDynamic" &&
    node.arguments.length <= 4 &&
    node.arguments[0]?.type === "StringLiteral" &&
    node.arguments[1]?.type === "ArrayExpression" &&
    node.arguments.at(-1)?.type === "FunctionExpression"
  ) {
    const name = node.arguments[0].value;
    if (!/^[\da-z]+$/i.test(name))
      throw new Error("Unexpected module identifier");
    const end = node.end;
    const exact = source.slice(node.start, end),
      fragment = exact + ";",
      folder = path.join(output, "modules", name);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "module.js"), fragment);
    modules.push({
      name,
      start: node.start,
      end,
      callEnd: node.end,
      size: exact.length,
      appendedTerminator: true,
      sourceSpanSHA256: digest(exact),
      deps: node.arguments[1].elements.map((item) => item?.value),
      sha256: digest(fragment),
      file: path.join(folder, "module.js"),
    });
  }
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value))
      pending.push(...value.filter((item) => item && typeof item === "object"));
    else if (value && typeof value === "object") pending.push(value);
  }
}
modules.sort((a, b) => a.start - b.start);
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "modules.json"),
  JSON.stringify(
    {
      origin: path.resolve(input),
      sha256: digest(source),
      offsetUnits: "UTF-16",
      modules,
    },
    null,
    2,
  ),
);
console.log(
  `Extracted ${modules.length} exact module spans, source SHA-256 ${digest(source)}`,
);
