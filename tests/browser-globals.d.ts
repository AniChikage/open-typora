interface Window { packageProbe: { ticks: number; cached: boolean; marker: string } }
interface Window {
 imeProbe: {loads:number;edits:number;attempts:number};
 imeEvents: {type:string;data?: string | null;inputType?:string;target?:string;source:boolean}[];
 chrome?: {webview: {addEventListener(name: string, listener:(event:{data:unknown})=>void):void;postMessage(value:unknown):void}};
 previewReady: unknown;
 deliverPreview(value:unknown):void;
}
declare var __menuClipboard: Electron.ClipboardItem[];
declare var __menuReveals: string[][];
declare var __menuConfirmCalls: string[];
declare var packageDialogProperties: Electron.OpenDialogOptions['properties'];

declare var __sheetClipboard: Electron.ClipboardItem[];
declare var __sheetReleaseClipboard: (()=>void) | undefined;
declare var __sheetClipboardOwnership: { plain:string; html:string; image:boolean; png:string } | undefined;
