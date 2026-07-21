import { describe, expect, it } from "vitest";

import {
  displayDomainFromUrl,
  extractFirstUrl,
  extractUrls,
  normalizeLinkUrl,
  parseOpenGraphHtml,
  splitTextWithUrls,
} from "./link-preview-core";
import { isBlockedIpAddress } from "./link-preview";

describe("link-preview-core", () => {
  it("extracts the first http(s) URL from free text", () => {
    expect(extractFirstUrl("see https://example.com/path?x=1 and more")).toBe(
      "https://example.com/path?x=1",
    );
    expect(extractFirstUrl("no links here")).toBeNull();
  });

  it("strips trailing punctuation from extracted URLs", () => {
    expect(extractUrls("Visit https://example.com.")).toEqual(["https://example.com"]);
  });

  it("normalizes http to https for cache keys", () => {
    expect(normalizeLinkUrl("http://Example.COM/a")).toBe("https://example.com/a");
    expect(normalizeLinkUrl("ftp://example.com")).toBeNull();
  });

  it("parses Open Graph meta tags", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Hello &amp; World" />
        <meta property="og:description" content="A desc" />
        <meta property="og:image" content="/img.png" />
        <meta property="og:site_name" content="Example" />
        <title>Fallback</title>
      </head></html>
    `;
    const meta = parseOpenGraphHtml(html, "https://example.com/page");
    expect(meta.title).toBe("Hello & World");
    expect(meta.description).toBe("A desc");
    expect(meta.imageUrl).toBe("https://example.com/img.png");
    expect(meta.siteName).toBe("Example");
  });

  it("splits text with URL segments for linkify", () => {
    const parts = splitTextWithUrls("hi https://a.test ok");
    expect(parts).toEqual([
      { type: "text", value: "hi " },
      { type: "url", value: "https://a.test" },
      { type: "text", value: " ok" },
    ]);
  });

  it("formats display domains", () => {
    expect(displayDomainFromUrl("https://www.example.com/x")).toBe("example.com");
  });
});

describe("isBlockedIpAddress", () => {
  it("blocks private and loopback ranges", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
  });
});
