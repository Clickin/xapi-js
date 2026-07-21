import { Dataset, XapiRoot } from "./xapi-data";
import { Col, ColumnType, RowType, XapiValueType } from "./types";
import { convertToColumnType, dateToString, normalizeColumnType, uint8ArrayToBase64 } from "./utils";

/** The wire representation used by Nexacro's Dataset JSON format. */
export interface NexacroJsonParameter {
  id: string;
  type?: ColumnType;
  value?: string | number | boolean;
}

export interface NexacroJsonColumn {
  id: string;
  type?: ColumnType;
  size?: number | string;
  value?: string | number | boolean;
}

export interface NexacroJsonRow {
  _RowType_?: "N" | "I" | "U" | "D" | "O";
  [columnId: string]: unknown;
}

export interface NexacroJsonDataset {
  id: string;
  ColumnInfo: {
    ConstColumn?: NexacroJsonColumn[];
    Column: NexacroJsonColumn[];
  };
  Rows: NexacroJsonRow[];
}

export interface NexacroJsonRoot {
  version: "1.0";
  Parameters?: NexacroJsonParameter[];
  Datasets?: NexacroJsonDataset[];
}

/** A serializer boundary around the X-API internal model. */
export interface XapiCodec<Serialized> {
  serialize(root: XapiRoot): Serialized;
  deserialize(value: Serialized): XapiRoot;
}

const rowTypes: Record<NonNullable<NexacroJsonRow["_RowType_"]>, RowType | undefined> = {
  N: undefined,
  I: "insert",
  U: "update",
  D: "delete",
  O: undefined,
};

function sizeOf(size: number | string | undefined, type: ColumnType): number {
  if (size !== undefined) return Number(size);
  return type === "STRING" ? 255 : 0;
}

function jsonValue(value: unknown, type: ColumnType | undefined): XapiValueType {
  if (value === null || value === undefined) return undefined;
  if (type === "DATE" || type === "DATETIME" || type === "TIME") {
    return typeof value === "string" ? convertToColumnType(value, type) : value as XapiValueType;
  }
  if (type === "BLOB" && typeof value === "string") return convertToColumnType(value, type);
  return value as XapiValueType;
}

function jsonWireValue(value: XapiValueType, type: ColumnType): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) return dateToString(value, type as Extract<ColumnType, "DATE" | "DATETIME" | "TIME">);
  if (value instanceof Uint8Array) return uint8ArrayToBase64(value);
  return value as string | number | boolean;
}

function columnsToObject(columns: Col[]): Record<string, unknown> {
  return Object.fromEntries(columns.map(column => [column.id, column.value]));
}

function readRow(dataset: Dataset, row: NexacroJsonRow): void {
  const rowType = rowTypes[row._RowType_ ?? "N"];
  if (row._RowType_ === "O") {
    const previous = dataset.rows[dataset.rows.length - 1];
    if (previous?.type !== "update") return;
    previous.orgRow = dataset.getColumns()
      .filter(column => Object.prototype.hasOwnProperty.call(row, column.id))
      .map(column => ({ id: column.id, value: jsonValue(row[column.id], column.type) }));
    return;
  }

  const index = dataset.newRow();
  dataset.rows[index].type = rowType;
  for (const column of dataset.getColumns()) {
    if (Object.prototype.hasOwnProperty.call(row, column.id)) {
      dataset.rows[index].cols.push({ id: column.id, value: jsonValue(row[column.id], column.type) });
    }
  }
}

function readJson(value: NexacroJsonRoot): XapiRoot {
  const root = new XapiRoot();
  for (const parameter of value.Parameters ?? []) {
    const type = normalizeColumnType(parameter.type);
    root.addParameter({ id: parameter.id, type, value: jsonValue(parameter.value, type) });
  }
  for (const source of value.Datasets ?? []) {
    const dataset = new Dataset(source.id);
    for (const column of source.ColumnInfo.ConstColumn ?? []) {
      const type = normalizeColumnType(column.type);
      dataset.addConstColumn({ id: column.id, type, size: sizeOf(column.size, type), value: jsonValue(column.value, type) });
    }
    for (const column of source.ColumnInfo.Column) {
      const type = normalizeColumnType(column.type);
      dataset.addColumn({ id: column.id, type, size: sizeOf(column.size, type) });
    }
    for (const row of source.Rows) readRow(dataset, row);
    root.addDataset(dataset);
  }
  return root;
}

function writeJson(root: XapiRoot): NexacroJsonRoot {
  return {
    version: "1.0",
    ...(root.parameterSize() ? { Parameters: root.getParameters().map(parameter => ({
      id: parameter.id,
      ...(parameter.type ? { type: parameter.type } : {}),
      ...(parameter.value !== undefined ? { value: jsonWireValue(parameter.value, parameter.type ?? "STRING") } : {}),
    })) } : {}),
    ...(root.datasetSize() ? { Datasets: root.getDatasets().map(dataset => ({
      id: dataset.id,
      ColumnInfo: {
        ...(dataset.constColumnSize() ? { ConstColumn: dataset.getConstColumns().map(column => ({
          id: column.id, type: column.type, size: column.size, value: jsonWireValue(column.value, column.type),
        })) } : {}),
        Column: dataset.getColumns().map(column => ({ id: column.id, type: column.type, size: column.size })),
      },
      Rows: dataset.getRows().flatMap(row => {
        const type = row.type === "insert" ? "I" : row.type === "update" ? "U" : row.type === "delete" ? "D" : "N";
        const current: NexacroJsonRow = { _RowType_: type, ...columnsToObject(row.cols) };
        if (!row.orgRow) return [current];
        return [current, { _RowType_: "O" as const, ...columnsToObject(row.orgRow) }];
      }),
    })) } : {}),
  };
}

export const nexacroJsonCodec: XapiCodec<NexacroJsonRoot> = {
  serialize: writeJson,
  deserialize: readJson,
};

export function parseJson(value: string): XapiRoot {
  return nexacroJsonCodec.deserialize(JSON.parse(value) as NexacroJsonRoot);
}

export function writeJsonString(root: XapiRoot): string {
  return JSON.stringify(nexacroJsonCodec.serialize(root));
}
