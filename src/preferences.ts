import { backgroundDefaults } from "./background.ts";
export interface Preferences {
  language: "zh-CN" | "en";
  imageUploader: string; imageAutoUpload: boolean;
  remoteImages: boolean; imageFolder: string; imagePrefix: boolean; imageEscape: boolean;
  pdfPaper: "a4" | "letter"; pdfMargin: number; pdfHeader: string; pdfFooter: string;
  pdfHeadingLevel: 0 | 1 | 2; pdfKeepTogether: boolean; pdfRepeatTableHeaders: boolean; pdfWidows: number;
  readingSpeed: number;
  fontSize: number; tabSize: number; spellcheck: boolean; autoPair: boolean;
  backgroundOpacity: number; backgroundBlur: number;
  backgroundPosition: "center" | "top" | "bottom" | "left" | "right";
  backgroundSize: "cover" | "contain" | "repeat";
  highlight: boolean; subscript: boolean; superscript: boolean; emoji: boolean; inlineMath: boolean;
}
export const defaultPreferences: Preferences = { language: "zh-CN", ...backgroundDefaults, imageUploader: "http://127.0.0.1:36677/upload", imageAutoUpload: false, remoteImages: true, imageFolder: ".assets", imagePrefix: false, imageEscape: true, pdfHeadingLevel: 0, pdfKeepTogether: true, pdfRepeatTableHeaders: true, pdfWidows: 2, pdfPaper: "a4", pdfMargin: 36, pdfHeader: "", pdfFooter: "", readingSpeed: 200, fontSize: 16, tabSize: 2, spellcheck: true, autoPair: true, highlight: true, subscript: true, superscript: true, emoji: true, inlineMath: true };
export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem("open-typora-preferences") || "{}");
    const next = { ...defaultPreferences };
    if (saved.language === "en") next.language = "en";
    if (Number.isFinite(saved.backgroundOpacity)) next.backgroundOpacity = Math.max(0,Math.min(100,saved.backgroundOpacity));
    if (Number.isFinite(saved.backgroundBlur)) next.backgroundBlur = Math.max(0,Math.min(30,saved.backgroundBlur));
    if (["center","top","bottom","left","right"].includes(saved.backgroundPosition)) next.backgroundPosition = saved.backgroundPosition;
    if (["cover","contain","repeat"].includes(saved.backgroundSize)) next.backgroundSize = saved.backgroundSize;
    for (const key of ["imageAutoUpload", "remoteImages", "imagePrefix", "imageEscape", "spellcheck", "autoPair", "highlight", "subscript", "superscript", "emoji", "inlineMath"] as const) if (typeof saved[key] === "boolean") next[key] = saved[key];
    for (const key of ["imageUploader", "imageFolder", "pdfHeader", "pdfFooter"] as const) if (typeof saved[key] === "string" && saved[key].length <= 500) next[key] = saved[key];
    if ([0,1,2].includes(saved.pdfHeadingLevel)) next.pdfHeadingLevel = saved.pdfHeadingLevel;
    if (typeof saved.pdfKeepTogether === "boolean") next.pdfKeepTogether = saved.pdfKeepTogether;
    if (typeof saved.pdfRepeatTableHeaders === "boolean") next.pdfRepeatTableHeaders = saved.pdfRepeatTableHeaders;
    if ([2,3,4,5].includes(saved.pdfWidows)) next.pdfWidows = saved.pdfWidows;
    if (saved.pdfPaper === "letter") next.pdfPaper = "letter";
    if (Number.isFinite(saved.pdfMargin)) next.pdfMargin = Math.max(18, Math.min(100, saved.pdfMargin));
    if (Number.isFinite(saved.readingSpeed)) next.readingSpeed = Math.max(50, Math.min(1000, saved.readingSpeed));
    if (Number.isFinite(saved.fontSize)) next.fontSize = Math.max(12, Math.min(28, saved.fontSize));
    if ([2, 4].includes(saved.tabSize)) next.tabSize = saved.tabSize;
    return next;
  } catch { return { ...defaultPreferences }; }
}
