export const maxBackgroundBytes = 8 * 1024 * 1024;
export function backgroundMime(bytes) {
  if (!bytes.length || bytes.length > maxBackgroundBytes) throw new Error("背景图片须小于 8 MB。");
  const starts = values => values.every((value, index) => bytes[index] === value);
  if (starts([137,80,78,71,13,10,26,10])) return "image/png";
  if (starts([255,216,255])) return "image/jpeg";
  if (starts([82,73,70,70]) && [87,69,66,80].every((value,index) => bytes[index+8] === value)) return "image/webp";
  throw new Error("请选择有效的 PNG、JPEG 或 WebP 背景图片。");
}
export function checkedBackground(value) {
  if (value === null) return null;
  if (!value || typeof value.name !== "string" || value.name.length > 160 || typeof value.dataUrl !== "string" || value.dataUrl.length > Math.ceil(maxBackgroundBytes / 3) * 4 + 40 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)) throw new Error("背景图片数据已损坏，请重新选择。");
  return { name: value.name, dataUrl: value.dataUrl };
}
