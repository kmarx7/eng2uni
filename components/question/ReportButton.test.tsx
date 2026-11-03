import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PracticeQuestion } from "./PracticeQuestion";

const question = { id: "Q-1", type: "true_false" as const, prompt: "맞으면 T", options: [{ id: "T", text: "맞다" }, { id: "F", text: "틀리다" }], hintLevels: [] as (1 | 2 | 3)[], skills: ["s"] };
const render = (reportsEnabled: boolean) =>
  renderToStaticMarkup(
    <PracticeQuestion question={question} onAnswered={() => {}} onNext={() => {}} nextLabel={() => "다음"} reportsEnabled={reportsEnabled} />,
  );

describe("report button", () => {
  it("shows only where reports can be stored", () => {
    expect(render(true)).toContain("문제 오류 신고");
    expect(render(false)).not.toContain("문제 오류 신고");
  });
});
