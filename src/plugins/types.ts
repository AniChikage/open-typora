export interface PluginDefinition { id: string; name: string; description: string; config: Record<string, any>; builtin?: boolean; factory?: (context: any) => any; url?: string }
export interface PluginState { enabled: boolean; status: "disabled" | "loading" | "ready" | "error"; error?: string }
export interface PluginPreference { enabled: boolean; config?: Record<string, any> }
export type PluginPreferences = Record<string, PluginPreference>;
export interface PluginAction { value: string; name: string; disabled: boolean; checked?: boolean }
