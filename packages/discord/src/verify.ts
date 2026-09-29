function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new Error("invalid hex");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(publicKeyHex: string): Promise<CryptoKey> {
  let key = keyCache.get(publicKeyHex);
  if (!key) {
    key = crypto.subtle.importKey("raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, [
      "verify",
    ]);
    keyCache.set(publicKeyHex, key);
  }
  return key;
}

/**
 * Verifies the Ed25519 signature Discord attaches to every interaction.
 * Must be done on the raw body before parsing.
 */
export async function verifyDiscordRequest(
  rawBody: string,
  signatureHex: string | null | undefined,
  timestamp: string | null | undefined,
  publicKeyHex: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;
  try {
    const key = await importKey(publicKeyHex);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + rawBody),
    );
  } catch {
    return false;
  }
}
