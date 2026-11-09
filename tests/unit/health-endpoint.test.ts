import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { query: mocks.query },
}));

import { GET } from "@/app/api/health/route";

const TOKEN = "health-probe-token-value-32b-or-more";
const DB_FAILURE = new Error(
  "connect ECONNREFUSED postgres://mms:super-secret-password@10.1.2.3:5432/mms_prod\n    at Pool.query (src/lib/db.ts:16:11)",
);

const originalToken = process.env.HEALTH_CHECK_TOKEN;

function call(headers?: HeadersInit, url = "http://127.0.0.1:3000/api/health"): Promise<Response> {
  return GET(new Request(url, { headers }));
}

describe("health endpoint", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    process.env.HEALTH_CHECK_TOKEN = TOKEN;
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.HEALTH_CHECK_TOKEN;
    else process.env.HEALTH_CHECK_TOKEN = originalToken;
  });

  it("returns a generic process check to unauthenticated callers", async () => {
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(body).toEqual({ status: "ok" });
    expect(body).not.toHaveProperty("ok");
    expect(body).not.toHaveProperty("db");
    expect(body).not.toHaveProperty("ms");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not reveal database failure or exception text on the public response", async () => {
    mocks.query.mockRejectedValue(DB_FAILURE);
    const response = await call();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ status: "ok" });
    expect(text).not.toContain("super-secret-password");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("mms_prod");
    expect(text).not.toContain("db.ts");
    expect(text).not.toContain("false");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps cookies, query tokens, and wrong or short secrets on the public response", async () => {
    const denied = [
      call({ cookie: "mms_session=signed-in" }),
      call(undefined, `http://127.0.0.1:3000/api/health?token=${TOKEN}`),
      call({ authorization: `Bearer ${"b".repeat(TOKEN.length)}` }),
      call({ authorization: `Basic ${TOKEN}` }),
      call({ "x-health-token": TOKEN }),
    ];
    process.env.HEALTH_CHECK_TOKEN = "a".repeat(31);
    denied.push(call({ authorization: `Bearer ${"a".repeat(31)}` }));
    delete process.env.HEALTH_CHECK_TOKEN;
    denied.push(call({ authorization: `Bearer ${TOKEN}` }));

    const responses = await Promise.all(denied);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns database diagnostics to an authorized probe", async () => {
    const response = await call({ authorization: `Bearer ${TOKEN}` });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: true, db: true, ms: expect.any(Number) });
    expect(body.ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("reports a database failure without exception or connection details", async () => {
    mocks.query.mockRejectedValue(DB_FAILURE);
    const response = await call({ authorization: `Bearer ${TOKEN}` });
    const text = await response.text();
    const body = JSON.parse(text) as { ok: boolean; db: boolean; ms: number };

    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["db", "ms", "ok"]);
    expect(body).toEqual({ ok: false, db: false, ms: expect.any(Number) });
    expect(text).not.toContain("super-secret-password");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("10.1.2.3");
    expect(text).not.toContain("5432");
    expect(text).not.toContain("mms_prod");
    expect(text).not.toContain("db.ts");
    expect(text).not.toContain("Pool.query");
    expect(text).not.toContain(TOKEN);
  });

  it("still answers HTTP 200 without a probe secret so process checks keep working", async () => {
    delete process.env.HEALTH_CHECK_TOKEN;
    mocks.query.mockRejectedValue(DB_FAILURE);
    const response = await call();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
