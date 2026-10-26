import type { Preferences } from "./preferences";
import type { BackgroundAsset } from "../shared/contracts.js";
export type { BackgroundAsset } from "../shared/contracts.js";
export const backgroundRevisionKey = "open-typora-background-revision";
export const backgroundDefaults = { backgroundOpacity: 18, backgroundBlur: 0, backgroundPosition: "center", backgroundSize: "cover" } as const;
export function backgroundStyle(asset: BackgroundAsset, value: Preferences) {
  return {
    backgroundImage: `url("${asset.dataUrl}")`,
    backgroundSize: value.backgroundSize === "repeat" ? "auto" : value.backgroundSize,
    backgroundRepeat: value.backgroundSize === "repeat" ? "repeat" : "no-repeat",
    backgroundPosition: value.backgroundPosition,
    opacity: value.backgroundOpacity / 100,
    filter: `blur(${value.backgroundBlur}px)`,
  };
}
