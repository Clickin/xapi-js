import { decodeWire, encodeWire } from "./wire-codec";
import { Dataset, XapiRoot } from "./xapi-data";
import type { Col, ColumnType, RowType, XapiValueType } from "./types";
import { convertToColumnType, convertToString, normalizeColumnType } from "./utils";
import type {
  CanonicalCell,
  CanonicalColumn,
  CanonicalConstColumn,
  CanonicalDataset,
  CanonicalRow,
  CanonicalValue,
  XapiCodecSelection,
  WireCodecOptions,
  WireProfile,
} from "./wire-types";

export const defaultXapiCodec: WireProfile = "nexacro-xml-4000";

export interface ResolvedXapiCodec {
  profile: WireProfile;
  options: WireCodecOptions;
  contentType: string;
}

function defaultContentType(profile: WireProfile): string {
  if (profile === "nexacro-json-1.0") return "application/json";
  if (profile === "nexacro-ssv" || profile === "xplatform-ssv") return "application/x-ssv";
  if (profile === "nexacro-binary-5000" || profile === "xplatform-binary-5000") return "application/octet-stream";
  return "application/xml";
}

export function resolveXapiCodec(selection?: XapiCodecSelection): ResolvedXapiCodec {
  if (typeof selection === "string" || selection === undefined) {
    const profile = selection || defaultXapiCodec;
    return { profile, options: {}, contentType: defaultContentType(profile) };
  }
  return {
    profile: selection.profile,
    options: selection.options || {},
    contentType: selection.contentType || defaultContentType(selection.profile),
  };
}

function cellFromValue(value: XapiValueType | undefined, rawValue: string | undefined, type: ColumnType | string): CanonicalCell {
  if (rawValue !== undefined) return { state: rawValue === "" ? "empty" : "value", lexical: rawValue };
  if (value === undefined) return { state: "missing", lexical: undefined };
  const lexical = convertToString(value, normalizeColumnType(type));
  return { state: lexical === "" ? "empty" : "value", lexical };
}

function cellToValue(cell: CanonicalCell | undefined, type: ColumnType | string): XapiValueType {
  if (!cell || cell.state === "missing" || cell.state === "null") return undefined;
  return convertToColumnType(cell.lexical || "", normalizeColumnType(type));
}

function rowTypeToCanonical(type: RowType | undefined): "N" | "I" | "U" | "D" {
  if (type === "insert") return "I";
  if (type === "update") return "U";
  if (type === "delete") return "D";
  return "N";
}

function rowTypeFromCanonical(type: "N" | "I" | "U" | "D" | "O"): RowType | undefined {
  if (type === "I") return "insert";
  if (type === "U") return "update";
  if (type === "D") return "delete";
  return undefined;
}

function columnsToCanonical(dataset: Dataset): CanonicalColumn[] {
  const columns = dataset.getColumns();
  const result = new Array<CanonicalColumn>(columns.length);
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    result[index] = {
      id: column.id,
      type: column.type,
      index,
      size: String(column.size),
      encoding: undefined,
      prop: undefined,
      sumtext: undefined,
    };
  }
  return result;
}

function constColumnsToCanonical(dataset: Dataset): CanonicalConstColumn[] {
  const columns = dataset.getConstColumns();
  const result = new Array<CanonicalConstColumn>(columns.length);
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    result[index] = {
      id: column.id,
      type: column.type,
      index: dataset.columnSize() + index,
      value: cellFromValue(column.value, column.rawValue, column.type),
      size: String(column.size),
      encoding: undefined,
    };
  }
  return result;
}

function colsToCanonical(cols: Col[] | undefined, columns: CanonicalColumn[]): Record<string, CanonicalCell> {
  const values: Record<string, CanonicalCell> = {};
  if (!cols) return values;
  for (let index = 0; index < cols.length; index++) {
    const col = cols[index];
    if (!col) continue;
    let column: CanonicalColumn | undefined;
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      if (columns[columnIndex].id === col.id) {
        column = columns[columnIndex];
        break;
      }
    }
    values[col.id] = cellFromValue(col.value, col.rawValue, column?.type || "STRING");
  }
  return values;
}

function rowsToCanonical(dataset: Dataset, columns: CanonicalColumn[]): CanonicalRow[] {
  const rows = dataset.getRows();
  const result = new Array<CanonicalRow>(rows.length);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    result[index] = {
      type: rowTypeToCanonical(row.type),
      orgRow: row.orgRow ? { type: "O", orgRow: null, values: colsToCanonical(row.orgRow, columns) } : null,
      values: colsToCanonical(row.cols, columns),
    };
  }
  return result;
}

export function xapiRootToCanonical(root: XapiRoot): CanonicalValue {
  const parameters = root.getParameters();
  const canonicalParameters = new Array<CanonicalValue["parameters"][number]>(parameters.length);
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    const cell = cellFromValue(parameter.value, parameter.rawValue, parameter.type || "STRING");
    canonicalParameters[index] = {
      id: parameter.id,
      type: parameter.type || "STRING",
      state: cell.state,
      lexical: cell.lexical,
      index: undefined,
      wire: undefined,
    };
  }

  const datasets = root.getDatasets();
  const canonicalDatasets = new Array<CanonicalDataset>(datasets.length);
  for (let index = 0; index < datasets.length; index++) {
    const dataset = datasets[index];
    const columns = columnsToCanonical(dataset);
    canonicalDatasets[index] = {
      id: dataset.id,
      columns,
      constColumns: constColumnsToCanonical(dataset),
      rows: rowsToCanonical(dataset, columns),
      saveType: undefined,
      wire: undefined,
    };
  }
  return { parameters: canonicalParameters, datasets: canonicalDatasets, saveType: undefined, wire: undefined };
}

function addCell(dataset: Dataset, rowIndex: number, id: string, cell: CanonicalCell | undefined, type: string): void {
  if (!cell || cell.state === "missing") return;
  const value = cellToValue(cell, type);
  dataset.setColumn(rowIndex, id, value);
  const rowCol = dataset.rows[rowIndex].cols[dataset.getColumnIndex(id) as number];
  rowCol.rawValue = cell.lexical;
}

function canonicalRowToCols(row: CanonicalRow, columns: CanonicalColumn[]): Col[] {
  const result = new Array<Col>(columns.length);
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    const cell = row.values[column.id];
    result[index] = {
      id: column.id,
      value: cellToValue(cell, column.type),
      rawValue: cell?.lexical,
    };
  }
  return result;
}

export function canonicalToXapiRoot(value: CanonicalValue): XapiRoot {
  const root = new XapiRoot();
  for (let index = 0; index < value.parameters.length; index++) {
    const parameter = value.parameters[index];
    root.addParameter({
      id: parameter.id,
      type: normalizeColumnType(parameter.type),
      value: cellToValue(parameter, parameter.type),
      rawValue: parameter.lexical,
    });
  }

  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const source = value.datasets[datasetIndex];
    const columns = new Array<CanonicalColumn>(source.columns.length);
    for (let columnIndex = 0; columnIndex < source.columns.length; columnIndex++) columns[columnIndex] = source.columns[columnIndex];
    const dataset = new Dataset(source.id);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const column = columns[columnIndex];
      dataset.addColumn({ id: column.id, type: normalizeColumnType(column.type), size: Number(column.size || 0) });
    }
    for (let columnIndex = 0; columnIndex < source.constColumns.length; columnIndex++) {
      const column = source.constColumns[columnIndex];
      dataset.addConstColumn({
        id: column.id,
        type: normalizeColumnType(column.type),
        size: Number(column.size || 0),
        value: cellToValue(column.value, column.type),
        rawValue: column.value?.lexical,
      });
    }
    for (let rowIndex = 0; rowIndex < source.rows.length; rowIndex++) {
      const sourceRow = source.rows[rowIndex];
      const targetRowIndex = dataset.newRow();
      dataset.rows[targetRowIndex].type = rowTypeFromCanonical(sourceRow.type);
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const column = columns[columnIndex];
        addCell(dataset, targetRowIndex, column.id, sourceRow.values[column.id], column.type);
      }
      if (sourceRow.orgRow) dataset.rows[targetRowIndex].orgRow = canonicalRowToCols(sourceRow.orgRow, columns);
    }
    root.addDataset(dataset);
  }
  return root;
}

export function encodeXapiWire(root: XapiRoot, selection?: XapiCodecSelection): Uint8Array {
  const codec = resolveXapiCodec(selection);
  return encodeWire(xapiRootToCanonical(root), codec.profile, { ...codec.options, preserveRowState: true });
}

export function decodeXapiWire(source: Uint8Array, selection?: XapiCodecSelection): XapiRoot {
  const codec = resolveXapiCodec(selection);
  return canonicalToXapiRoot(decodeWire(source, codec.profile, { ...codec.options, preserveRowState: true }));
}

export function xapiContentType(selection?: XapiCodecSelection): string {
  return resolveXapiCodec(selection).contentType;
}

export function xapiContentTypeMatches(value: string | undefined, selection?: XapiCodecSelection): boolean {
  if (!value) return false;
  return value.toLowerCase().startsWith(xapiContentType(selection).toLowerCase());
}

export function xapiBodyToBytes(body: unknown): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new TypeError("X-API codec requires a string or Uint8Array request body");
}
