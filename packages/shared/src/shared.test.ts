import { describe, expect, it } from "vitest";
import {
  canTransition,
  createRequestSchema,
  formatRequestNumber,
  hasPermission,
  parseRequestNumber,
  statusPermission,
} from "./index";

describe("request number", () => {
  it("formats with 4 digit padding", () => {
    expect(formatRequestNumber(1)).toBe("REQ-0001");
    expect(formatRequestNumber(23)).toBe("REQ-0023");
    expect(formatRequestNumber(12345)).toBe("REQ-12345");
  });

  it("parses keys and plain numbers", () => {
    expect(parseRequestNumber("REQ-0023")).toBe(23);
    expect(parseRequestNumber("req-7")).toBe(7);
    expect(parseRequestNumber("42")).toBe(42);
    expect(parseRequestNumber("REQ-0")).toBeNull();
    expect(parseRequestNumber("abc")).toBeNull();
  });
});

describe("status transitions", () => {
  it("follows the documented flow", () => {
    expect(canTransition("new", "reviewing")).toBe(true);
    expect(canTransition("reviewing", "planned")).toBe(true);
    expect(canTransition("planned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "released")).toBe(true);
  });

  it("rejects skipping development", () => {
    expect(canTransition("reviewing", "released")).toBe(false);
    expect(canTransition("backlog", "in_progress")).toBe(false);
  });
});

describe("permissions", () => {
  it("does not let requesters set priority", () => {
    expect(hasPermission("requester", "request:create")).toBe(true);
    expect(hasPermission("requester", "request:set_priority")).toBe(false);
  });

  it("reserves Planned / Not Planned for product managers", () => {
    expect(statusPermission("planned")).toBe("request:decide");
    expect(statusPermission("in_progress")).toBe("request:update_status");
    expect(hasPermission("developer", "request:decide")).toBe(false);
    expect(hasPermission("product_manager", "request:decide")).toBe(true);
  });
});

describe("createRequestSchema", () => {
  it("does not accept a project id from Discord", () => {
    const parsed = createRequestSchema.parse({
      title: "店舗をお気に入り保存したい",
      description: "顧客から要望",
      origin: { provider: "discord", guildId: "1", channelId: "2", projectId: "x" },
    });
    expect("projectId" in parsed.origin).toBe(false);
  });
});
