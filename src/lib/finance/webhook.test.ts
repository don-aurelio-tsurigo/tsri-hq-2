import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWebhookDeal } from "./webhook";

const deal = {
  id: "2497",
  title: "First Hand Films",
  value: "637.5",
  organisation: "Bindella",
  org_id: "1081",
  start_month: "2026-04-23",
  months: 12,
  category: "",
};

describe("parseWebhookDeal", () => {
  it("reads a plain JSON body", () => {
    const r = parseWebhookDeal(deal);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.deal.externalId, "2497");
    assert.equal(r.deal.totalAmount, 637.5);
    assert.equal(r.deal.organisationId, "1081");
    assert.equal(r.deal.startMonth, "2026-04");
    assert.equal(r.deal.categoryName, null);
  });

  it("unwraps JSON pasted into Zapier's Data field", () => {
    for (const body of [
      { data: JSON.stringify(deal) },
      { [JSON.stringify(deal)]: "" },
      { data: deal },
      { "": JSON.stringify(deal) },
    ]) {
      const r = parseWebhookDeal(body);
      assert.ok(r.ok, JSON.stringify(body).slice(0, 40));
      if (r.ok) assert.equal(r.deal.externalId, "2497");
    }
  });

  it("still reports missing fields", () => {
    const r = parseWebhookDeal({ title: "x" });
    assert.equal(r.ok, false);
  });
});
