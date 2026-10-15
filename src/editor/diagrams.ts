import DOMPurify from "dompurify";
let loader: Promise<typeof import("mermaid")> | undefined;
let queue = Promise.resolve();
export async function renderDiagrams(container: HTMLElement) {
  const targets = [
    ...container.querySelectorAll<HTMLElement>(".mermaid-block"),
  ].filter((element) => !element.dataset.ready);
  if (!targets.length) return;
  loader ??= import("mermaid");
  const { default: mermaid } = await loader;
  const render = async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      theme:
        document.documentElement.dataset.appearance === "dark" ? "dark" : "neutral",
      flowchart: { htmlLabels: false },
    });
    for (const element of targets) {
      if (!element.isConnected) continue;
      element.dataset.mermaid ??= element.textContent || "";
      try {
        const { svg } = await mermaid.render(
          `diagram-${crypto.randomUUID()}`,
          element.dataset.mermaid,
        );
        if (element.isConnected) {
          element.innerHTML = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
          });
          element.dataset.ready = "true";
        }
      } catch {
        element.textContent = element.dataset.mermaid!;
        element.classList.add("diagram-error");
      }
    }
  };
  const task = queue.catch(() => {}).then(render);
  queue = task;
  await task;
}
