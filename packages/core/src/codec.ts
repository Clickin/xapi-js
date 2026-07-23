import { Dataset, XapiRoot } from "./xapi-data";
import { Col, ColumnType, RowType, XapiValueType } from "./types";
import { convertToColumnType, dateToString, normalizeColumnType, uint8ArrayToBase64 } from "./utils";

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
  ColumnInfo: { ConstColumn?: NexacroJsonColumn[]; Column: NexacroJsonColumn[] };
  Rows: NexacroJsonRow[];
}

export interface NexacroJsonRoot {
  version: "1.0";
  Parameters?: NexacroJsonParameter[];
  Datasets?: NexacroJsonDataset[];
}

export interface XapiCodec<Serialized> {
  serialize(root: XapiRoot): Serialized;
  deserialize(value: Serialized): XapiRoot;
}

const rowTypes: Record<NonNullable<NexacroJsonRow["_RowType_"]>, RowType | undefined> = {
  N: undefined, I: "insert", U: "update", D: "delete", O: undefined,
};

function sizeOf(size: number | string | undefined, type: ColumnType): number {
  if (size !== undefined) return Number(size);
  return type === "STRING" ? 255 : 0;
}

function jsonValue(value: unknown, type: ColumnType | undefined): XapiValueType {
  if (value === null || value === undefined) return undefined;
  return convertToColumnType(typeof value === "string" ? value : String(value), normalizeColumnType(type));
}

function jsonRawValue(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function jsonWireValue(value: XapiValueType, type: ColumnType): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) return dateToString(value, type as Extract<ColumnType, "DATE" | "DATETIME" | "TIME">);
  if (value instanceof Uint8Array) return uint8ArrayToBase64(value);
  return value as string | number | boolean;
}

function columnsToObject(columns: Col[], type: NonNullable<NexacroJsonRow["_RowType_"]>): NexacroJsonRow {
  const result: NexacroJsonRow = { _RowType_: type };
  for (let index = 0; index < columns.length; index++) result[columns[index].id] = columns[index].value;
  return result;
}

function readRow(dataset: Dataset, row: NexacroJsonRow): void {
  const rowType = rowTypes[row._RowType_ ?? "N"];
  const columns = dataset.getColumns();
  if (row._RowType_ === "O") {
    const previous = dataset.rows[dataset.rows.length - 1];
    if (previous?.type !== "update") return;
    const original: Col[] = [];
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      if (Object.prototype.hasOwnProperty.call(row, column.id)) original.push({ id: column.id, value: jsonValue(row[column.id], column.type), rawValue: jsonRawValue(row[column.id]) });
    }
    previous.orgRow = original;
    return;
  }
  const rowIndex = dataset.newRow();
  dataset.rows[rowIndex].type = rowType;
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    if (Object.prototype.hasOwnProperty.call(row, column.id)) dataset.rows[rowIndex].cols.push({ id: column.id, value: jsonValue(row[column.id], column.type), rawValue: jsonRawValue(row[column.id]) });
  }
}

function readJson(value: NexacroJsonRoot): XapiRoot {
  const root = new XapiRoot();
  const parameters = value.Parameters;
  if (parameters) {
    for (let index = 0; index < parameters.length; index++) {
      const parameter = parameters[index];
      const type = normalizeColumnType(parameter.type);
      root.addParameter({ id: parameter.id, type, value: jsonValue(parameter.value, type), rawValue: jsonRawValue(parameter.value) });
    }
  }
  const datasets = value.Datasets;
  if (!datasets) return root;
  for (let datasetIndex = 0; datasetIndex < datasets.length; datasetIndex++) {
    const source = datasets[datasetIndex];
    const dataset = new Dataset(source.id);
    const constants = source.ColumnInfo.ConstColumn;
    if (constants) {
      for (let index = 0; index < constants.length; index++) {
        const column = constants[index];
        const type = normalizeColumnType(column.type);
        dataset.addConstColumn({ id: column.id, type, size: sizeOf(column.size, type), value: jsonValue(column.value, type), rawValue: jsonRawValue(column.value) });
      }
    }
    const columns = source.ColumnInfo.Column;
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const type = normalizeColumnType(column.type);
      dataset.addColumn({ id: column.id, type, size: sizeOf(column.size, type) });
    }
    for (let index = 0; index < source.Rows.length; index++) readRow(dataset, source.Rows[index]);
    root.addDataset(dataset);
  }
  return root;
}

function writeJson(root: XapiRoot): NexacroJsonRoot {
  const result: NexacroJsonRoot = { version: "1.0", Parameters: undefined, Datasets: undefined };
  const sourceParameters = root.getParameters();
  if (sourceParameters.length) {
    const parameters: NexacroJsonParameter[] = new Array(sourceParameters.length);
    for (let index = 0; index < sourceParameters.length; index++) {
      const source = sourceParameters[index];
      parameters[index] = {
        id: source.id,
        type: source.type || undefined,
        value: source.value !== undefined ? jsonWireValue(source.value, source.type ?? "STRING") : undefined,
      };
    }
    result.Parameters = parameters;
  }
  const sourceDatasets = root.getDatasets();
  if (!sourceDatasets.length) return result;
  const datasets: NexacroJsonDataset[] = new Array(sourceDatasets.length);
  for (let datasetIndex = 0; datasetIndex < sourceDatasets.length; datasetIndex++) {
    const source = sourceDatasets[datasetIndex];
    const sourceColumns = source.getColumns();
    const columns: NexacroJsonColumn[] = new Array(sourceColumns.length);
    for (let index = 0; index < sourceColumns.length; index++) {
      const column = sourceColumns[index];
      columns[index] = { id: column.id, type: column.type, size: column.size, value: undefined };
    }
    const sourceConstants = source.getConstColumns();
    let constants: NexacroJsonColumn[] | undefined;
    if (sourceConstants.length) {
      constants = new Array(sourceConstants.length);
      for (let index = 0; index < sourceConstants.length; index++) {
        const column = sourceConstants[index];
        constants[index] = { id: column.id, type: column.type, size: column.size, value: jsonWireValue(column.value, column.type) };
      }
    }
    const columnInfo: NexacroJsonDataset["ColumnInfo"] = { ConstColumn: constants, Column: columns };
    const rows: NexacroJsonRow[] = [];
    const sourceRows = source.getRows();
    for (let index = 0; index < sourceRows.length; index++) {
      const row = sourceRows[index];
      const type = row.type === "insert" ? "I" : row.type === "update" ? "U" : row.type === "delete" ? "D" : "N";
      rows.push(columnsToObject(row.cols, type));
      if (row.orgRow) rows.push(columnsToObject(row.orgRow, "O"));
      }
    datasets[datasetIndex] = { id: source.id, ColumnInfo: columnInfo, Rows: rows };
  }
  result.Datasets = datasets;
  return result;
}

export const nexacroJsonCodec: XapiCodec<NexacroJsonRoot> = { serialize: writeJson, deserialize: readJson };
export function parseJson(value: string): XapiRoot { return nexacroJsonCodec.deserialize(JSON.parse(value) as NexacroJsonRoot); }
export function writeJsonString(root: XapiRoot): string { return JSON.stringify(nexacroJsonCodec.serialize(root)); }
