declare module "markdown-it-task-lists" {
  const plugin: any;
  export default plugin;
}
declare module "*.css";
declare module "markdown-it-mark" { const plugin: import("markdown-it").PluginSimple; export default plugin; }
declare module "markdown-it-sub" { const plugin: import("markdown-it").PluginSimple; export default plugin; }
declare module "markdown-it-sup" { const plugin: import("markdown-it").PluginSimple; export default plugin; }
declare module "markdown-it-emoji" { export const full: import("markdown-it").PluginWithOptions<{ shortcuts?: Record<string, string[]> }>; }
declare module "turndown" {
  export default class TurndownService {
    constructor(options?: Record<string, string>);
    use(plugin: (service: TurndownService) => void): this;
    addRule(name: string, rule: { filter: string; replacement: (content: string) => string }): this;
    turndown(html: string): string;
  }
}
declare module "turndown-plugin-gfm" { export const gfm: (service: import("turndown").default) => void; }

declare module "markdown-it-emoji/lib/data/full.mjs" { const names: Record<string, string>; export default names; }
