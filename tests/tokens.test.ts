import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE_DISPLAY, SENTENCE_ROLES } from "@/lib/design/roles";

const css = readFileSync(path.join(__dirname, "../app/tokens.css"), "utf8");

function block(selector: string): Record<string, string> {
  const match = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing ${selector} block`);
  const vars: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("sentence role tokens", () => {
  it("gives every role a unique letter symbol and label", () => {
    expect(new Set(SENTENCE_ROLES).size).toBe(5);
    for (const role of SENTENCE_ROLES) {
      expect(ROLE_DISPLAY[role].label).not.toBe("");
    }
  });

  for (const selector of [":root", ".dark"]) {
    const vars = block(selector);

    it(`defines base, soft, and ink colors for every role in ${selector}`, () => {
      for (const role of SENTENCE_ROLES) {
        const token = ROLE_DISPLAY[role].token;
        for (const suffix of ["", "-soft", "-ink"]) {
          expect(vars[`${token}${suffix}`], `${token}${suffix}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    });

    it(`keeps role ink text readable on its soft tint in ${selector}`, () => {
      for (const role of SENTENCE_ROLES) {
        const token = ROLE_DISPLAY[role].token;
        expect(
          contrast(vars[`${token}-ink`], vars[`${token}-soft`]),
          token,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
