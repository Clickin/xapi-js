import { Dataset, decodeRoot, decodeXapiWire, encodeRoot, encodeXapiWire, xapi, XapiRoot } from "../src";
import { describe, expect, it } from "vitest";

describe("XapiRoot wire bridge", () => {
  it("round-trips typed operation values through JSON and zlib transport", () => {
    const operation = xapi.operation({
      codec: { profile: "nexacro-json-1.0", options: { zlib: true } },
      request: xapi.root({
        datasets: { input: xapi.dataset({ id: xapi.int(), amount: xapi.bigdecimal() }) },
      }),
      response: xapi.root({
        datasets: { output: xapi.dataset({ id: xapi.int(), amount: xapi.bigdecimal() }) },
      }),
    });
    const source = encodeRoot(operation.request, {
      parameters: {},
      datasets: { input: [{ id: 7, amount: 12.5, $rowType: "update", $orgRow: { id: 7, amount: 10 } }] },
    });

    const bytes = encodeXapiWire(source, operation.codec);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xad);
    const decoded = decodeRoot(operation.request, decodeXapiWire(bytes, operation.codec));

    expect(decoded.datasets.input).toEqual([{
      id: 7,
      amount: 12.5,
      $rowType: "update",
      $orgRow: { id: 7, amount: 10 },
    }]);
  });

  it("keeps raw XapiRoot handlers compatible with non-XML codecs", () => {
    const dataset = new Dataset("users");
    dataset.addColumn({ id: "id", type: "INT", size: 10 });
    const row = dataset.newRow();
    dataset.setColumn(row, "id", 3);
    const root = new XapiRoot([dataset]);

    const decoded = decodeXapiWire(encodeXapiWire(root, "nexacro-ssv"), "nexacro-ssv");
    expect(decoded.getDataset("users")?.getColumn(0, "id")).toBe(3);
  });
});
