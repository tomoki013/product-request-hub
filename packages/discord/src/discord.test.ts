import { describe, expect, it } from "vitest";
import { parseCustomId, CustomId } from "./custom-ids";
import { readModalValues, requestMessage } from "./builders";
import { verifyDiscordRequest } from "./verify";

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

describe("verifyDiscordRequest", () => {
  it("accepts a valid signature and rejects tampering", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const publicKey = toHex(await crypto.subtle.exportKey("raw", pair.publicKey));
    const body = JSON.stringify({ type: 1 });
    const ts = "1700000000";
    const sig = toHex(
      await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(ts + body)),
    );
    expect(await verifyDiscordRequest(body, sig, ts, publicKey)).toBe(true);
    expect(await verifyDiscordRequest(body + " ", sig, ts, publicKey)).toBe(false);
    expect(await verifyDiscordRequest(body, null, ts, publicKey)).toBe(false);
    expect(await verifyDiscordRequest(body, "zz", ts, publicKey)).toBe(false);
  });
});

describe("custom ids", () => {
  it("round-trips", () => {
    expect(parseCustomId(CustomId.requestModal)).toEqual({ kind: "request_modal" });
    expect(parseCustomId(CustomId.requestModalFromMessage("123"))).toEqual({
      kind: "request_modal",
      sourceMessageId: "123",
    });
    expect(parseCustomId(CustomId.sameRequestButton("abc"))).toEqual({
      kind: "same_request",
      requestId: "abc",
    });
    expect(parseCustomId("other:x")).toEqual({ kind: "unknown" });
  });
});

describe("readModalValues", () => {
  it("reads label-wrapped and action-row components", () => {
    const values = readModalValues([
      { type: 18, component: { type: 4, custom_id: "title", value: "T" } },
      { type: 18, component: { type: 3, custom_id: "source", values: ["customer"] } },
      { type: 1, components: [{ type: 4, custom_id: "description", value: "D" }] },
    ]);
    expect(values).toEqual({ title: ["T"], source: ["customer"], description: ["D"] });
  });
});

describe("requestMessage", () => {
  it("renders key, status and buttons", () => {
    const msg = requestMessage({
      requestId: "r1",
      key: "REQ-0023",
      title: "店舗をお気に入り保存したい",
      status: "new",
      projectName: "Zakkary",
      requesterDiscordId: "42",
      requesterName: "Tanaka",
      requestCount: 1,
      detailUrl: "https://example.com/requests/REQ-0023",
    });
    expect(msg.embeds[0]?.title).toBe("🎫 REQ-0023");
    expect(msg.embeds[0]?.fields.find((f) => f.name === "Requested by")?.value).toBe("<@42>");
    expect(msg.components[0]?.components).toHaveLength(2);
  });
});
