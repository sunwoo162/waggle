import { createHash } from "node:crypto";
import sharp from "sharp";
import { invalid } from "./errors";

export type CharacterArt = { hash: string; bytes: Buffer };
export async function prepareCharacterArt(input: unknown): Promise<CharacterArt> {
  const fail = (): never => invalid("image", "PNG·JPEG·WebP 한 장을 2MB·2048px 이내로 올려주세요.");
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !["mime", "base64"].includes(key)) ||
    typeof value.base64 !== "string" ||
    value.base64.length > 2_796_204
  )
    return fail();
  const bytes = Buffer.from(value.base64, "base64");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || bytes.toString("base64") !== value.base64)
    return fail();
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (!mime || value.mime !== mime) return fail();
  try {
    const pipeline = sharp(bytes, { limitInputPixels: 4 * 1024 * 1024, failOn: "warning" });
    const meta = await pipeline.metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width > 2048 ||
      meta.height > 2048 ||
      (meta.pages || 1) !== 1
    )
      return fail();
    const output = await pipeline
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    if (output.length > 1024 * 1024) return fail();
    return { hash: createHash("sha256").update(output).digest("hex"), bytes: output };
  } catch {
    return fail();
  }
}
