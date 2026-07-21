import { describe, expect, it } from "vitest";
import { Dataset, decodeRoot, nexacroJsonCodec, parseJson, writeJsonString, xapi, XapiRoot } from "../src";

describe("Nexacro JSON codec", () => {
  it("round-trips row status and original rows using Nexacro's wire format", () => {
    const dataset = new Dataset("users");
    dataset.addColumn({ id: "id", type: "INT", size: 10 });
    const row = dataset.newRow();
    dataset.rows[row].type = "update";
    dataset.setColumn(row, "id", 2);
    dataset.rows[row].orgRow = [{ id: "id", value: 1 }];
    const root = new XapiRoot([dataset]);

    const encoded = nexacroJsonCodec.serialize(root);
    expect(encoded.Datasets?.[0].Rows).toEqual([
      { _RowType_: "U", id: 2 },
      { _RowType_: "O", id: 1 },
    ]);
    expect(nexacroJsonCodec.deserialize(encoded).getDataset("users")?.rows[0]).toMatchObject({
      type: "update",
      orgRow: [{ id: "id", value: 1 }],
    });
    expect(JSON.parse(writeJsonString(root)).version).toBe("1.0");
    expect(parseJson(writeJsonString(root)).datasetSize()).toBe(1);
  });

  it("deserializes JSON and lets the schema choose the result type", () => {
    const schema = xapi.root({ datasets: { values: xapi.dataset({ amount: xapi.string() }) } });
    const root = nexacroJsonCodec.deserialize({
      version: "1.0",
      Datasets: [{
        id: "values",
        ColumnInfo: { Column: [{ id: "amount", type: "DOUBLE", size: 20 }] },
        Rows: [{ _RowType_: "N", amount: "67.00" }],
      }],
    });

    expect(decodeRoot(schema, root).datasets.values[0].amount).toBe("67.00");
  });
});
