import { describe, expect, it } from "vitest";
import { isAllowedAudioLicence, isAllowedLicence } from "./licence";

describe("content licence policy", () => {
  it("accepts public domain, CC0 and CC BY", () => {
    expect(isAllowedLicence("Public domain")).toBe(true);
    expect(isAllowedLicence("Public domain (traditional melody)")).toBe(true);
    expect(isAllowedLicence("CC0 1.0")).toBe(true);
    expect(isAllowedLicence("CC BY 4.0")).toBe(true);
    expect(isAllowedLicence("CC-BY 4.0")).toBe(true);
  });

  it("rejects unclear, NC, ND and SA licences", () => {
    expect(isAllowedLicence("All rights reserved")).toBe(false);
    expect(isAllowedLicence("")).toBe(false);
    expect(isAllowedLicence("CC BY-NC 4.0")).toBe(false);
    expect(isAllowedLicence("CC BY-ND 4.0")).toBe(false);
    expect(isAllowedLicence("CC BY-SA 4.0")).toBe(false);
    expect(isAllowedLicence("CC BY NoDerivs")).toBe(false);
    expect(isAllowedLicence("CC BY-NoDerivs")).toBe(false);
    expect(isAllowedLicence("CC BY ShareAlike")).toBe(false);
    expect(isAllowedLicence("CC BY NonCommercial")).toBe(false);
  });

  it("requires rendered audio to be public domain or CC0", () => {
    expect(isAllowedAudioLicence("CC0 1.0")).toBe(true);
    expect(isAllowedAudioLicence("Public domain")).toBe(true);
    expect(isAllowedAudioLicence("CC BY 4.0")).toBe(false);
  });
});
