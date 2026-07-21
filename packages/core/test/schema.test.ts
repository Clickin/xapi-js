import { describe, expect, expectTypeOf, it } from "vitest";
import { XapiRoot, decodeRoot, encodeRoot, InferRoot, parse, write, xapi } from "../src";

const schema = xapi.root({
  parameters: {
    ErrorCode: xapi.int(),
    ErrorMsg: xapi.string(),
  },
  datasets: {
    users: xapi.dataset({
      id: xapi.int(),
      balance: xapi.bigdecimal(),
      score: xapi.float(),
      ratio: xapi.decimal(),
      name: xapi.string({ size: 100 }),
      createdAt: xapi.datetime(),
      photo: xapi.blob({ optional: true }),
    }),
  },
});

describe("XAPI schema", () => {
  it("infers plain object types and preserves XAPI column metadata", () => {
    type Data = InferRoot<typeof schema>;
    expectTypeOf<Data["datasets"]["users"][number]["id"]>().toEqualTypeOf<number>();
    expectTypeOf<Data["datasets"]["users"][number]["photo"]>().toEqualTypeOf<Uint8Array | undefined>();

    const data: Data = {
      parameters: { ErrorCode: 0, ErrorMsg: "success" },
      datasets: {
        users: [{
          id: 1,
          balance: 123.45,
          score: 4.5,
          ratio: 0.25,
          name: "Kim",
          createdAt: new Date(2025, 0, 2, 3, 4, 5),
        }],
      },
    };

    const xml = write(encodeRoot(schema, data));
    expect(xml).toContain('id="id" size="10" type="INT"');
    expect(xml).toContain('id="balance" size="30" type="BIGDECIMAL"');
    expect(xml).toContain('id="score" size="20" type="FLOAT"');
    expect(xml).toContain('id="ratio" size="20" type="DECIMAL"');
    expect(xml).toContain('id="name" size="100" type="STRING"');

    const decoded = decodeRoot(schema, parse(xml));
    expect(decoded.parameters).toEqual({ ErrorCode: 0, ErrorMsg: "success" });
    expect(decoded.datasets.users[0]).toMatchObject({ id: 1, name: "Kim", balance: 123.45 });
    expect(decoded.datasets.users[0].createdAt).toBeInstanceOf(Date);
  });

  it("writes column info and decodes an empty dataset", () => {
    const data: InferRoot<typeof schema> = {
      parameters: { ErrorCode: 0, ErrorMsg: "success" },
      datasets: { users: [] },
    };
    const root = encodeRoot(schema, data);
    expect(root.getDataset("users")?.columnSize()).toBe(7);
    expect(decodeRoot(schema, root).datasets.users).toEqual([]);
  });

  it("covers optional values, schema builders, constants, and missing datasets", () => {
    const optionalSchema = xapi.root({
      parameters: { optional: xapi.string({ optional: true }) },
      datasets: { dates: xapi.dataset({ date: xapi.date(), time: xapi.time() }) },
    });
    expect(xapi.root({ datasets: {} }).parameters).toEqual({});
    expect(xapi.operation({ request: optionalSchema, response: optionalSchema }).kind).toBe("xapi-operation");

    const root = encodeRoot(optionalSchema, {
      parameters: { optional: undefined },
      datasets: { dates: [{ date: new Date(2025, 0, 1), time: new Date(1970, 0, 1, 1, 2, 3) }] },
    });
    root.getDataset("dates")!.addConstColumn({ id: "constant", type: "STRING", size: 1, value: "x" });
    root.getDataset("dates")!.rows[0]!.cols.push({ id: "unknown", value: "ignored" });
    expect(decodeRoot(optionalSchema, root).datasets.dates[0]).toMatchObject({ constant: "x" });
    expect(decodeRoot(optionalSchema, new XapiRoot()).datasets.dates).toEqual([]);
  });

  it("preserves row status and original values across schema operations", () => {
    const data: InferRoot<typeof schema> = {
      parameters: { ErrorCode: 0, ErrorMsg: "success" },
      datasets: {
        users: [{
          id: 2,
          balance: 10,
          score: 1,
          ratio: 1,
          name: "new",
          createdAt: new Date(2025, 0, 2),
          $rowType: "update",
          $orgRow: { id: 1, name: "old" },
        }],
      },
    };

    const root = encodeRoot(schema, data);
    expect(root.getDataset("users")?.rows[0]).toMatchObject({
      type: "update",
      orgRow: [{ id: "id", value: 1 }, { id: "name", value: "old" }],
    });
    expect(decodeRoot(schema, root).datasets.users[0]).toMatchObject({
      $rowType: "update",
      $orgRow: { id: 1, name: "old" },
    });
  });

  it("uses the schema type over the server column type and keeps the wire string", () => {
    const stringSchema = xapi.root({
      datasets: { values: xapi.dataset({ amount: xapi.string() }) },
    });
    const root = parse(`<?xml version="1.0"?><Root><Dataset id="values"><ColumnInfo><Column id="amount" type="DOUBLE" size="20"/></ColumnInfo><Rows><Row><Col id="amount">67.00</Col></Row></Rows></Dataset></Root>`);

    expect(root.getDataset("values")?.rows[0].cols[0]).toMatchObject({ value: 67, rawValue: "67.00" });
    expect(decodeRoot(stringSchema, root).datasets.values[0].amount).toBe("67.00");
  });
});
