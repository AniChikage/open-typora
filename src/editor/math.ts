import DOMPurify from "dompurify";
let loader: Promise<typeof import("./mathEngine")> | undefined;
let queue = Promise.resolve();
const generations = new WeakMap<HTMLElement, number>();
const signatures = new WeakMap<HTMLElement, string>();
export async function renderMath(container: HTMLElement) {
  const targets = [...container.querySelectorAll<HTMLElement>(".mathjax-node")];
  const signature = JSON.stringify(
    targets.map((node) => [node.dataset.tex, node.dataset.display]),
  );
  if (
    signature === signatures.get(container) &&
    targets.every((node) => node.dataset.ready)
  )
    return;
  signatures.set(container, signature);
  if (!targets.length) return;
  const generation = (generations.get(container) || 0) + 1;
  generations.set(container, generation);
  loader ??= import("./mathEngine");
  const engine = await loader;
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (generations.get(container) !== generation) return;
      // Re-evaluate the whole document in order: TeX macros are document-scoped.
      const document = engine.createMathDocument();
      for (const target of targets) {
        if (!target.isConnected || generations.get(container) !== generation)
          continue;
        try {
          const rendered = await document.convertPromise(
            target.dataset.tex || "",
            { display: target.dataset.display === "true" },
          );
          if (target.isConnected) {
            target.innerHTML = DOMPurify.sanitize(rendered.outerHTML, {
              USE_PROFILES: { svg: true, svgFilters: true, html: true },
            });
            target.dataset.ready = "true";
          }
        } catch {
          target.textContent = target.dataset.tex || "";
          target.classList.add("math-error");
        }
      }
    });
  queue = task;
  await task;
}
