import { describe, expect, it } from "vitest";
import { langCode, langLabel, nativeLanguage } from "./languages";

describe("languages", () => {
  it("picks the first non-English language", () => {
    expect(nativeLanguage(["Spanish", "English"])).toBe("Spanish");
    expect(nativeLanguage(["English", "Yiddish"])).toBe("Yiddish");
    expect(nativeLanguage(["English"])).toBeNull();
    expect(nativeLanguage([])).toBeNull();
  });
  it("maps names to endonyms and BCP 47 codes", () => {
    expect(langLabel("spanish")).toBe("Español");
    expect(langCode("Spanish")).toBe("es");
    expect(langLabel("Klingon")).toBe("Klingon");
    expect(langCode("Klingon")).toBeUndefined();
  });
});
