import { describe, expect, it } from "vitest";
import { isStoredFileImageRef, listingAvatarSrc } from "@/components/records/user-listing-avatar";

const stored = "/api/files/e58ba46d0662f565b8d6c8af593edfd7";

describe("users listing stored avatar", () => {
  it("recognizes an extensionless stored file reference", () => {
    expect(isStoredFileImageRef(`  ${stored}  `)).toBe(true);
  });

  it("leaves extension-based avatars and other text alone", () => {
    expect(isStoredFileImageRef("users/default.png")).toBe(false);
    expect(isStoredFileImageRef("candidates/July2025/photo.jpg")).toBe(false);
    expect(isStoredFileImageRef("")).toBe(false);
    expect(isStoredFileImageRef("/api/files/not-a-file")).toBe(false);
  });

  it("uses the stored reference until the image fails, then the default avatar", () => {
    expect(listingAvatarSrc(stored, false)).toBe(stored);
    expect(listingAvatarSrc(stored, true)).toBe("/api/media?path=users%2Fdefault.png");
  });
});
