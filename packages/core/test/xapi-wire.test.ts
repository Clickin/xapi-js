import { Dataset, decodeRoot, decodeWire, decodeXapiWire, encodeRoot, encodeWire, encodeXapiWire, WireCodecError, xapi, XapiRoot } from "../src";
import type { CanonicalValue } from "../src";
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

  it("encodes empty Nexacro cells as blank and missing cells as ETX", () => {
    const value: CanonicalValue = {
      parameters: [],
      datasets: [{
        id: "d",
        columns: [{ id: "a", type: "STRING", index: 0 }, { id: "b", type: "STRING", index: 1 }],
        constColumns: [],
        rows: [{ type: "N", values: { a: { state: "empty" }, b: { state: "missing" } } }],
      }],
    };
    expect(Buffer.from(encodeWire(value, "nexacro-ssv")).toString("base64")).toBe("U1NWOlVURi04HkRhdGFzZXQ6ZB5fUm93VHlwZV8fYTpzdHJpbmcoMzIpH2I6c3RyaW5nKDMyKR5OHx8DHh4=");
  });

  it("returns an empty canonical value when custom SSV separators are requested", () => {
    const bytes = new TextEncoder().encode("SSV:UTF-8~Dataset:d~_RowType_|a:STRING~N|x~~");
    expect(decodeWire(bytes, "nexacro-ssv", { ssvUnitSeparator: "|", ssvRecordSeparator: "~" })).toEqual({ parameters: [], datasets: [], saveType: undefined, wire: undefined });
  });

  it("rejects duplicate JSON properties as malformed input", () => {
    try {
      decodeWire(new TextEncoder().encode('{"Parameters":[],"Parameters":[],"Datasets":[]}'), "nexacro-json-1.0");
      throw new Error("expected duplicate JSON properties to fail");
    } catch (error) {
      expect(error).toMatchObject({ class: "malformed-input" });
    }
  });


  it("omits XML original rows when preservation is disabled", () => {
    const xml = '<Root xmlns="http://www.nexacroplatform.com/platform/dataset" version="4000"><Dataset id="d"><ColumnInfo><Column id="a" type="STRING"/></ColumnInfo><Rows><Row type="update"><Col id="a">new</Col><OrgRow><Col id="a">old</Col></OrgRow></Row><Row type="delete"><Col id="a">deleted</Col></Row></Rows></Dataset></Root>';
    const decoded = decodeWire(new TextEncoder().encode(xml), "nexacro-xml-4000", { strict: false, preserveRowState: false });
    expect(decoded.datasets[0].rows).toEqual([
      { type: "U", orgRow: null, values: { a: { state: "value", lexical: "new" } } },
      { type: "D", orgRow: null, values: { a: { state: "value", lexical: "deleted" } } },
    ]);
  });
  it("rejects undeclared columns in preserved XML original rows", () => {
    const xml = '<Root xmlns="http://www.nexacroplatform.com/platform/dataset" version="4000"><Dataset id="d"><ColumnInfo><Column id="a" type="STRING"/></ColumnInfo><Rows><Row type="update"><Col id="a">new</Col><OrgRow><Col id="missing">old</Col></OrgRow></Row></Rows></Dataset></Root>';
    expect(() => decodeWire(new TextEncoder().encode(xml), "nexacro-xml-4000", { strict: false })).toThrow(WireCodecError);
  });
  it("preserves XML UPDATE original rows for Nexacro and XPlatform profiles", () => {
    const row = '<Dataset id="d"><ColumnInfo><Column id="a" type="STRING"/></ColumnInfo><Rows><Row type="insert"><Col id="a">inserted</Col></Row><Row type="update"><Col id="a">new</Col><OrgRow><Col id="a">old</Col></OrgRow></Row><Row type="delete"><Col id="a">deleted</Col></Row></Rows></Dataset>';
    const inputs: Array<["nexacro-xml-4000" | "xplatform-xml-4000", string]> = [
      ["nexacro-xml-4000", `<Root xmlns="http://www.nexacroplatform.com/platform/dataset" version="4000">${row}</Root>`],
      ["xplatform-xml-4000", `<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">${row}</Root>`],
    ];
    for (const [profile, xml] of inputs) {
      const decoded = decodeWire(new TextEncoder().encode(xml), profile);
      expect(decoded.datasets[0].rows.map(row => row.type)).toEqual(["I", "U", "D"]);
      expect(decoded.datasets[0].rows[1].orgRow).toEqual({ type: "O", orgRow: null, values: { a: { state: "value", lexical: "old" } } });
    }
  });

  it("does not expose SSV original records when preservation is disabled", () => {
    const source = "SSV:UTF-8\x1ep:INT=1\x1eDataset:d\x1e_Const_\x1fc:STRING(5)=fixed\x1e_RowType_\x1fa:STRING(10)\x1fb:INT\x1eU\x1fnew\x1f1\x1eO\x1fold\x1f1\x1eN\x1f\x03\x1f\x03\x1e\x1e";
    const decoded = decodeWire(new TextEncoder().encode(source), "nexacro-ssv", { preserveRowState: false });
    expect(decoded.datasets[0].rows.map(row => [row.type, row.orgRow])).toEqual([["U", null], ["N", null]]);
  });
  it("preserves JSON original rows by default and honors explicit opt-out", () => {
    const source = '{"Datasets":[{"id":"d","ColumnInfo":{"Column":[{"id":"a","type":"string"}]},"Rows":[{"_RowType_":"U","a":"new"},{"_RowType_":"O","a":"old"}]}]}';
    const bytes = new TextEncoder().encode(source);
    expect(decodeWire(bytes, "nexacro-json-1.0").datasets[0].rows[0].orgRow).toEqual({ type: "O", orgRow: null, values: { a: { state: "value", lexical: "old" } } });
    expect(decodeWire(bytes, "nexacro-json-1.0", { preserveRowState: false }).datasets[0].rows[0].orgRow).toBeNull();
  });
  it("preserves SSV original rows by default", () => {
    const source = "SSV:UTF-8\x1eDataset:d\x1e_RowType_\x1fa:STRING\x1eU\x1fnew\x1eO\x1fold\x1e";
    expect(decodeWire(new TextEncoder().encode(source), "nexacro-ssv").datasets[0].rows[0].orgRow).toEqual({ type: "O", orgRow: null, values: { a: { state: "value", lexical: "old" } } });
  });

  it("preserves explicit JSON column sizes and defaults missing sizes", () => {
    const value: CanonicalValue = {
      parameters: [],
      datasets: [{ id: "d", columns: [{ id: "a", type: "INT", index: 0, size: "10" }, { id: "b", type: "INT", index: 1 }], constColumns: [], rows: [] }],
    };
    expect(encodeWire(value, "nexacro-json-1.0")).toEqual(new TextEncoder().encode('{"Datasets":[{"ColumnInfo":{"Column":[{"size":"10","id":"a","type":"int"},{"size":"4","id":"b","type":"int"}]},"id":"d"}],"version":"1.0"}'));
  });

  it("rejects encoding binary internal parameter types as invalid values", () => {
    const value: CanonicalValue = {
      parameters: [
        { id: "u", type: "UNDEFINED", state: "empty", lexical: "" },
        { id: "n", type: "NULL", state: "empty", lexical: "", index: 1 },
        { id: "d", type: "DATASET", state: "empty", lexical: "", index: 2 },
        { id: "i", type: "INVALID", state: "empty", lexical: "", index: 3 },
      ],
      datasets: [],
    };
    try {
      encodeWire(value, "nexacro-binary-5000");
      throw new Error("expected binary internal types to fail");
    } catch (error) {
      expect(error).toMatchObject({ class: "invalid-value", path: "" });
    }
  });
  it("encodes XPlatform XML with the documented root", () => {
    const value: CanonicalValue = { parameters: [], datasets: [] };
    expect(new TextDecoder().decode(encodeWire(value, "xplatform-xml-4000"))).toContain('<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">');
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

  describe("XML reader document rules", () => {
    const decodeXml = (xml: string) => decodeWire(new TextEncoder().encode(xml), "nexacro-xml-4000");
    const parameter = (body: string) => `<Root><Parameters><Parameter id="a">${body}</Parameter></Parameters></Root>`;
    const lexical = (body: string) => decodeXml(parameter(body)).parameters[0].lexical;

    it("keeps text around markup nested in a Col", () => {
      const decoded = decodeXml('<Root><Dataset id="d"><ColumnInfo><Column id="c" type="STRING"/></ColumnInfo><Rows><Row><Col id="c">a<b>c</b>d</Col></Row></Rows></Dataset></Root>');
      expect(decoded.datasets[0].rows[0].values.c.lexical).toBe("acd");
    });

    it("rejects a character reference to a character XML does not allow", () => {
      expect(() => decodeXml(parameter("&#1;"))).toThrow(WireCodecError);
      expect(lexical("&#9;")).toBe("\t");
    });

    it("rejects whitespace before the XML declaration", () => {
      expect(() => decodeXml(' <?xml version="1.0"?><Root/>')).toThrow(WireCodecError);
    });

    it("normalizes raw line endings but keeps a CR character reference", () => {
      expect(lexical("a\r\nb\rc&#13;d")).toBe("a\nb\nc\rd");
    });

    it("rejects undeclared prefixes and accepts declared ones", () => {
      expect(() => decodeXml("<Root><p:Parameters/></Root>")).toThrow(WireCodecError);
      expect(() => decodeXml('<Root p:x="1"/>')).toThrow(WireCodecError);
      expect(() => decodeXml('<Root xmlns:p="urn:p" p:x="1"><p:Parameters/></Root>')).not.toThrow();
      expect(() => decodeXml('<Root xml:lang="ko"/>')).not.toThrow();
    });

    it("does not decode entities twice", () => {
      expect(lexical("&amp;#32;")).toBe("&#32;");
    });
  });
});
