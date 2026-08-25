import { describe, expect, it } from "vitest";

import {
  COMPOSE_NLP_MAX,
  COMPOSE_TITLE_MAX,
  buildComposePath,
  parseComposeQuery,
  sanitizeComposeText,
  stripComposeSearch,
} from "./compose-query";

describe("parseComposeQuery (PC-454)", () => {
  it("opens a manual event composer with a sanitized title", () => {
    const params = new URLSearchParams("compose=event&title=  Brunch%20club  ");
    expect(parseComposeQuery(params)).toEqual({ compose: "event", title: "Brunch club" });
  });

  it("opens an NLP composer from q or description", () => {
    expect(parseComposeQuery(new URLSearchParams("compose=nlp&q=Dinner Friday"))).toEqual({
      compose: "nlp",
      nlpText: "Dinner Friday",
    });
    expect(
      parseComposeQuery(new URLSearchParams("compose=nlp&description=Leia sleeps tonight")),
    ).toEqual({
      compose: "nlp",
      nlpText: "Leia sleeps tonight",
    });
  });

  it("still returns an intent when the line is empty so the matching composer can open", () => {
    expect(parseComposeQuery(new URLSearchParams("compose=event"))).toEqual({
      compose: "event",
      title: "",
    });
    expect(parseComposeQuery(new URLSearchParams("compose=nlp"))).toEqual({
      compose: "nlp",
      nlpText: "",
    });
  });

  it("ignores unknown compose values and missing compose", () => {
    expect(parseComposeQuery(new URLSearchParams("compose=sleeping&title=Nope"))).toBeNull();
    expect(parseComposeQuery(new URLSearchParams("title=Nope"))).toBeNull();
  });

  it("caps title and nlp text and strips control characters", () => {
    const title = `A${"b".repeat(COMPOSE_TITLE_MAX)}`;
    const parsedTitle = parseComposeQuery(
      new URLSearchParams({ compose: "event", title: `${title}\u0007` }),
    );
    expect(parsedTitle?.compose).toBe("event");
    if (parsedTitle?.compose === "event") {
      expect(parsedTitle.title.length).toBe(COMPOSE_TITLE_MAX);
      expect(parsedTitle.title.includes("\u0007")).toBe(false);
    }

    const nlp = `Z${"z".repeat(COMPOSE_NLP_MAX)}`;
    const parsedNlp = parseComposeQuery(new URLSearchParams({ compose: "nlp", q: nlp }));
    expect(parsedNlp?.compose).toBe("nlp");
    if (parsedNlp?.compose === "nlp") {
      expect(parsedNlp.nlpText.length).toBe(COMPOSE_NLP_MAX);
    }
  });
});

describe("stripComposeSearch (PC-454)", () => {
  it("removes compose keys and keeps unrelated params", () => {
    const params = new URLSearchParams(
      "compose=event&title=Hi&tab=mine&q=ignored&description=also",
    );
    expect(stripComposeSearch(params)).toBe("tab=mine");
  });
});

describe("buildComposePath (PC-454)", () => {
  it("encodes prefill values for widget and shortcut URLs", () => {
    expect(buildComposePath({ compose: "event", title: "A & B" })).toBe(
      "/feed?compose=event&title=A+%26+B",
    );
    expect(buildComposePath({ compose: "nlp", nlpText: "Dinner Friday" })).toBe(
      "/feed?compose=nlp&q=Dinner+Friday",
    );
    expect(buildComposePath({ compose: "event", title: "" })).toBe("/feed?compose=event");
  });
});

describe("sanitizeComposeText (PC-454)", () => {
  it("returns empty string for nullish input", () => {
    expect(sanitizeComposeText(null, 10)).toBe("");
    expect(sanitizeComposeText(undefined, 10)).toBe("");
  });
});
