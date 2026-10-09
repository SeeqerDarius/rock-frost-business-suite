import { afterEach, describe, expect, it, vi } from "vitest";
import { checkVies, isViesCountry, validateVatNumber, viesEnabled, VIES_ENDPOINT } from "@/modules/tax/providers";

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  delete process.env.VIES_ENABLED;
});

describe("VIES registry adapter", () => {
  it("confirms a registered number with name, address, and consultation number", async () => {
    const fetchImpl = respond(200, { countryCode: "DE", vatNumber: "123456789", valid: true, name: "Muster GmbH", address: "Hauptstrasse 1, Berlin", requestIdentifier: "WAPIAAAAX1", userError: "VALID" });
    const check = await checkVies("DE", "DE 123 456 789", { fetchImpl, requester: { countryCode: "FR", vatNumber: "FR12345678901" } });
    expect(check).toMatchObject({ level: "REGISTRY", valid: true, status: "VALID", provider: "vies", registeredName: "Muster GmbH", consultationNumber: "WAPIAAAAX1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(VIES_ENDPOINT);
    expect(JSON.parse(String(init.body))).toEqual({ countryCode: "DE", vatNumber: "123456789", requesterMemberStateCode: "FR", requesterNumber: "12345678901" });
  });

  it("uses EL for Greece and hides placeholder names", async () => {
    const fetchImpl = respond(200, { valid: true, name: "---", address: "---" });
    const check = await checkVies("GR", "EL123456789", { fetchImpl });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).countryCode).toBe("EL");
    expect(check).toMatchObject({ valid: true, registeredName: null, registeredAddress: null, consultationNumber: null });
  });

  it("reports a number VIES does not recognise as invalid", async () => {
    const check = await checkVies("NL", "NL123456789B01", { fetchImpl: respond(200, { valid: false, userError: "INVALID" }) });
    expect(check).toMatchObject({ level: "REGISTRY", valid: false, status: "INVALID" });
  });

  it("never reports an outage as invalid: unavailable member states, rate limits, errors, and timeouts fall back to the format check", async () => {
    expect(await checkVies("IT", "IT12345678901", { fetchImpl: respond(200, { valid: false, userError: "MS_UNAVAILABLE" }) })).toMatchObject({ status: "UNAVAILABLE", level: "FORMAT", valid: true });
    expect(await checkVies("IT", "IT12345678901", { fetchImpl: respond(500, { actionSucceed: false, errorWrappers: [{ error: "MS_MAX_CONCURRENT_REQ" }] }) })).toMatchObject({ status: "UNAVAILABLE" });
    expect(await checkVies("IT", "IT12345678901", { fetchImpl: vi.fn(async () => { throw new Error("socket hang up"); }) })).toMatchObject({ status: "UNAVAILABLE" });
    expect(await checkVies("IT", "IT12345678901", { fetchImpl: vi.fn(async () => new Response("<html>gateway</html>", { status: 502 })) })).toMatchObject({ status: "UNAVAILABLE" });
    expect(await checkVies("IT", "IT12345678901", { fetchImpl: respond(400, { actionSucceed: false, errorWrappers: [{ error: "INVALID_INPUT" }] }) })).toMatchObject({ status: "INVALID", level: "REGISTRY" });
  });

  it("covers EU member states and Northern Ireland only", () => {
    expect(isViesCountry("DE")).toBe(true);
    expect(isViesCountry("GR")).toBe(true);
    expect(isViesCountry("XI")).toBe(true);
    expect(isViesCountry("GB")).toBe(false);
    expect(isViesCountry("CH")).toBe(false);
    expect(isViesCountry("GH")).toBe(false);
  });

  it("is off in tests unless enabled, and rejects malformed numbers before calling the registry", async () => {
    expect(viesEnabled()).toBe(false);
    process.env.VIES_ENABLED = "true";
    expect(viesEnabled()).toBe(true);
    const fetchImpl = respond(200, { valid: true });
    expect(await validateVatNumber("DE", "DE12345", { fetchImpl })).toMatchObject({ valid: false, status: "INVALID", level: "FORMAT" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await validateVatNumber("DE", "DE123456789", { fetchImpl })).toMatchObject({ level: "REGISTRY", status: "VALID" });
    // Non-VIES countries stay format-only.
    expect(await validateVatNumber("GB", "GB123456789", { fetchImpl })).toMatchObject({ level: "FORMAT", status: "VALID" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
