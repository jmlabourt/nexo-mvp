import { describe, expect, it } from "vitest";
import { initialCalcState } from "@/components/budget/calculator-state";
import { clearQuoteDraft, peekQuoteDraft, setQuoteDraft } from "@/components/budget/quote-draft";

describe("cotización en curso", () => {
  it("se guarda, se lee sin consumirla y se limpia", () => {
    expect(peekQuoteDraft()).toBeNull();
    setQuoteDraft({ state: initialCalcState(), projectType: "Local comercial", startDate: "2026-10-07", dueDate: "2026-11-06", salesPrice: 1000 });
    expect(peekQuoteDraft()?.salesPrice).toBe(1000);
    expect(peekQuoteDraft()?.salesPrice).toBe(1000);
    clearQuoteDraft();
    expect(peekQuoteDraft()).toBeNull();
  });
});
