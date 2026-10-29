import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { unavailable } from "./errors";

export class CredentialCipher {
  private readonly key: Buffer;
  constructor(key: Buffer) {
    if (key.length !== 32) unavailable();
    this.key = Buffer.from(key);
  }
  seal(value: string, purpose: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(`waggle:school:v1:${purpose}`));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }
  open(value: string, purpose: string): string {
    try {
      const [version, nonce, tag, data, extra] = value.split(".");
      if (version !== "v1" || extra !== undefined || !nonce || !tag || !data) return unavailable();
      const parts = [nonce, tag, data].map((part) => {
        if (!/^[A-Za-z0-9_-]+$/.test(part)) return unavailable();
        const bytes = Buffer.from(part, "base64url");
        if (bytes.toString("base64url") !== part) return unavailable();
        return bytes;
      });
      if (parts[0].length !== 12 || parts[1].length !== 16) return unavailable();
      const cipher = createDecipheriv("aes-256-gcm", this.key, parts[0], { authTagLength: 16 });
      cipher.setAAD(Buffer.from(`waggle:school:v1:${purpose}`));
      cipher.setAuthTag(parts[1]);
      return Buffer.concat([cipher.update(parts[2]), cipher.final()]).toString("utf8");
    } catch {
      return unavailable();
    }
  }
}
