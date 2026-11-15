import type { CanonicalCell, CanonicalDataset, CanonicalRow, CanonicalValue, SaveType, WireCodecOptions } from "./wire-types";
import { WireCodecError } from "./wire-types";
import { javaBigDecimal, javaDateLexical, javaFloating, javaInteger, sourceBoolean } from "./java-scalar";

const KNOWN_TYPES: Record<string, true> = {
  STRING: true, CHAR: true, SHORT: true, USHORT: true, INT: true, UINT: true, LONG: true, ULONG: true,
  FLOAT: true, DOUBLE: true, DECIMAL: true, BIGDECIMAL: true, BOOLEAN: true, DATE: true, TIME: true,
  DATETIME: true, BLOB: true, FILE: true, NULL: true, UNDEFINED: true, DATASET: true, INVALID: true,
};
const WIRE_SIZES: Record<string, string> = {
  STRING: "32", CHAR: "32", SHORT: "4", USHORT: "4", INT: "4", UINT: "4", LONG: "8", ULONG: "8",
  FLOAT: "4", DOUBLE: "8", DECIMAL: "16", BIGDECIMAL: "16", BOOLEAN: "2", DATE: "6", TIME: "9",
  DATETIME: "17", BLOB: "256", FILE: "256",
};
const UTF8_ENCODER = new TextEncoder();

export function emptyValue(): CanonicalValue {
  return { parameters: [], datasets: [], saveType: undefined, wire: undefined };
}

export function defaultType(type?: string): string {
  return (type || "STRING").toUpperCase().replace(/_/g, "");
}

export function isKnownType(type?: string): boolean {
  return KNOWN_TYPES[defaultType(type)] === true;
}

export function wireType(type?: string): string {
  switch (defaultType(type)) {
    case "BOOLEAN":
    case "SHORT":
    case "USHORT":
    case "INT":
    case "UINT":
      return "int";
    case "LONG":
    case "ULONG":
    case "DECIMAL":
    case "BIGDECIMAL":
      return "bigdecimal";
    case "FLOAT":
    case "DOUBLE":
      return "float";
    case "FILE":
    case "BLOB":
      return "blob";
    case "STRING":
    case "CHAR":
      return "string";
    case "DATE":
      return "date";
    case "TIME":
      return "time";
    case "DATETIME":
      return "datetime";
    case "NULL":
      return "null";
    default:
      return type?.toLowerCase() || "string";
  }
}
export function wireSize(type?: string): string {
  return WIRE_SIZES[defaultType(type)] || "32";
}

/**
 * Converts a value as the drivers' StringTypeConverter does before writing:
 * BOOLEAN as 1/0, numbers and dates parsed and printed like Java. An invalid
 * BIGDECIMAL or date becomes null.
 */
export function normalizeSourceCell(type: string, cell: CanonicalCell): CanonicalCell {
  if (cell.state !== "value") return { state: cell.state, lexical: cell.lexical };
  const lexical = cell.lexical || "";
  const normalizedType = defaultType(type);
  switch (normalizedType) {
    case "BOOLEAN": return { state: "value", lexical: sourceBoolean(lexical) ? "1" : "0" };
    case "SHORT":
    case "USHORT":
    case "INT":
    case "UINT": return { state: "value", lexical: javaInteger(lexical, 32) };
    case "LONG":
    case "ULONG": return { state: "value", lexical: javaInteger(lexical, 64) };
    case "FLOAT": return { state: "value", lexical: javaFloating(lexical, 32) };
    case "DOUBLE": return { state: "value", lexical: javaFloating(lexical, 64) };
    case "DECIMAL":
    case "BIGDECIMAL": {
      const decimal = javaBigDecimal(lexical);
      return decimal === undefined ? { state: "null" } : { state: "value", lexical: decimal };
    }
    case "DATE":
    case "TIME":
    case "DATETIME": {
      const date = javaDateLexical(lexical, normalizedType);
      return date === undefined ? { state: "null" } : { state: "value", lexical: date };
    }
    default: return { state: cell.state, lexical: cell.lexical };
  }
}

/**
 * Converts only BOOLEAN constants, which the drivers always write as 1 or 0
 * (empty and null as 0); other constant values are written as given.
 */
export function normalizeSourceConstCell(type: string, cell: CanonicalCell): CanonicalCell {
  if (cell.state === "missing" || defaultType(type) !== "BOOLEAN") return { state: cell.state, lexical: cell.lexical };
  return { state: "value", lexical: sourceBoolean(cell.lexical || "") ? "1" : "0" };
}

/**
 * The text a text format writes for a cell of the type; undefined when the
 * drivers write nothing. An unset BOOLEAN is 0.
 */
export function wireScalar(type: string, cell: CanonicalCell): string | undefined {
  const normalized = defaultType(type);
  const text = normalized === "STRING" || normalized === "CHAR" || normalized === "FILE" || normalized === "BLOB";
  if (cell.state === "empty" && text) return "";
  if (cell.state !== "value") return normalized === "BOOLEAN" ? "0" : undefined;
  if (cell.lexical) return cell.lexical;
  if (text) return "";
  switch (normalized) {
    case "SHORT": case "USHORT": case "INT": case "UINT": case "LONG": case "ULONG": return "0";
    case "FLOAT": case "DOUBLE": return "0.0";
    case "BOOLEAN": return "0";
    default: return undefined;
  }
}

function normalizedRow(row: CanonicalRow, columns: CanonicalDataset["columns"]): CanonicalRow {
  const values: Record<string, CanonicalCell> = {};
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index];
    const cell = row.values[column.id];
    if (cell) values[column.id] = normalizeSourceCell(column.type, cell);
  }
  return { type: row.type, orgRow: row.orgRow ? normalizedRow(row.orgRow, columns) : null, values };
}

/** Converts the values like the drivers and selects rows by saveType. */
export function normalizeForEncode(value: CanonicalValue): CanonicalValue {
  const parameters = new Array(value.parameters.length);
  for (let index = 0; index < value.parameters.length; index++) {
    const parameter = value.parameters[index];
    const cell = normalizeSourceCell(parameter.type, parameter);
    parameters[index] = { id: parameter.id, type: parameter.type, state: cell.state, lexical: cell.lexical, index: parameter.index, wire: parameter.wire };
  }
  const datasets = new Array(value.datasets.length);
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    const constColumns = new Array(dataset.constColumns.length);
    for (let index = 0; index < dataset.constColumns.length; index++) {
      const column = dataset.constColumns[index];
      constColumns[index] = {
        id: column.id,
        type: column.type,
        index: column.index,
        value: normalizeSourceConstCell(column.type, column.value || { state: "null" }),
        size: column.size,
        encoding: column.encoding,
      };
    }
    const rows = new Array(dataset.rows.length);
    for (let index = 0; index < dataset.rows.length; index++) rows[index] = normalizedRow(dataset.rows[index], dataset.columns);
    datasets[datasetIndex] = {
      id: dataset.id,
      columns: dataset.columns,
      constColumns,
      rows,
      saveType: dataset.saveType,
      wire: dataset.wire,
    };
  }
  return applySaveTypes({ parameters, datasets, saveType: value.saveType, wire: value.wire });
}

/**
 * The original drivers' row selection. A dataset without saveType inherits
 * the root's; with neither, the drivers use NORMAL (2), which writes every live
 * row as a plain row. Deleted rows live in the driver's removed-row list, so
 * they are always written after the live rows, and only for ALL (1), DELETED
 * (4) and CHANGED (5). An updated row starts as a copy of its original row, so
 * a value it leaves out keeps the original value; written with its original
 * row but without a known one, it gets an empty one.
 */
function selectedRows(dataset: CanonicalDataset, rootSaveType: SaveType | undefined): CanonicalRow[] {
  const saveType = dataset.saveType || rootSaveType || 2;
  const live: CanonicalRow[] = [];
  const removed: CanonicalRow[] = [];
  for (let index = 0; index < dataset.rows.length; index++) {
    const source = dataset.rows[index];
    const type = ((source.type || "N").toUpperCase() || "N") as CanonicalRow["type"];
    if (type === "O") continue;
    if (type === "D") {
      if (saveType === 1 || saveType === 4 || saveType === 5) removed.push({ type, orgRow: null, values: source.values });
      continue;
    }
    const include = saveType === 1 || saveType === 2 || (saveType === 3 || saveType === 5) && type !== "N";
    if (!include) continue;
    const values = type === "U" && source.orgRow ? { ...source.orgRow.values, ...source.values } : source.values;
    if (saveType === 2) live.push({ type: "N", orgRow: null, values });
    else if (type === "U") live.push({ type, orgRow: source.orgRow || { type: "O", orgRow: null, values: {} }, values });
    else live.push({ type, orgRow: null, values });
  }
  return live.concat(removed);
}

export function applySaveTypes(value: CanonicalValue): CanonicalValue {
  const datasets = new Array(value.datasets.length);
  for (let index = 0; index < value.datasets.length; index++) {
    const dataset = value.datasets[index];
    datasets[index] = {
      id: dataset.id,
      columns: dataset.columns,
      constColumns: dataset.constColumns,
      rows: selectedRows(dataset, value.saveType),
      wire: dataset.wire,
    };
  }
  return { parameters: value.parameters, datasets, wire: value.wire };
}

function validBase64(value: string): boolean {
  if (value === "") return true;
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

function validateCell(type: string, cell: CanonicalCell, path: string): void {
  const normalized = defaultType(type);
  if ((cell.state === "value" || cell.state === "empty") && (normalized === "BLOB" || normalized === "FILE") && !validBase64(cell.lexical || "")) {
    throw new WireCodecError("invalid-value", "invalid base64 BLOB value", path);
  }
}

export function validateCanonical(value: CanonicalValue, allowBinaryInternalParameters = false): void {
  if ((value.saveType || 0) < 0 || (value.saveType || 0) > 5) throw new WireCodecError("invalid-value", `invalid root saveType ${value.saveType}`, "value");
  for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
    const parameter = value.parameters[parameterIndex];
    if (!isKnownType(parameter.type)) throw new WireCodecError("invalid-value", `unsupported parameter type ${parameter.type}`, "value");
    if (!allowBinaryInternalParameters && ["DATASET", "INVALID"].includes(defaultType(parameter.type))) throw new WireCodecError("invalid-value", `unsupported public parameter type ${parameter.type}`, "value");
    validateCell(parameter.type, parameter, `value.parameters[${parameterIndex}]`);
  }
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    if ((dataset.saveType || 0) < 0 || (dataset.saveType || 0) > 5) throw new WireCodecError("invalid-value", `invalid dataset saveType ${dataset.saveType}`, "value");
    for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
      const column = dataset.constColumns[columnIndex];
      if (!isKnownType(column.type)) throw new WireCodecError("invalid-value", `unsupported constant column type ${column.type}`, "value");
      if (["DATASET", "INVALID"].includes(defaultType(column.type))) throw new WireCodecError("invalid-value", `unsupported public constant column type ${column.type}`, "value");
      if (column.value) validateCell(column.type, column.value, `value.datasets[${datasetIndex}].constColumns[${columnIndex}]`);
    }
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      if (!isKnownType(column.type)) throw new WireCodecError("invalid-value", `unsupported column type ${column.type}`, "value");
      if (["DATASET", "INVALID"].includes(defaultType(column.type))) throw new WireCodecError("invalid-value", `unsupported public column type ${column.type}`, "value");
    }
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
        const column = dataset.columns[columnIndex];
        const cell = row.values[column.id];
        if (cell) validateCell(column.type, cell, `value.datasets[${datasetIndex}].rows[${rowIndex}].values.${column.id}`);
      }
    }
  }
}

export function checkLimits(value: CanonicalValue, options: WireCodecOptions, payloadBytes = -1): void {
  const limits = options.limits;
  if (!limits) return;
  if (limits.payloadBytes !== undefined && payloadBytes > limits.payloadBytes) throw new WireCodecError("limit-exceeded", "payload exceeds configured limit", "input.data");
  if (limits.datasets !== undefined && value.datasets.length > limits.datasets) throw new WireCodecError("limit-exceeded", "dataset limit exceeded", "value.datasets");
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    if (limits.columns !== undefined && dataset.columns.length + dataset.constColumns.length > limits.columns) throw new WireCodecError("limit-exceeded", "column limit exceeded", `value.datasets[${datasetIndex}].columns`);
    if (limits.rows !== undefined && dataset.rows.length > limits.rows) throw new WireCodecError("limit-exceeded", "row limit exceeded", `value.datasets[${datasetIndex}].rows`);
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
        const column = dataset.columns[columnIndex];
        const cell = row.values[column.id];
        if (!cell) continue;
        const lexical = cell.lexical || "";
        const path = `value.datasets[${datasetIndex}].rows[${rowIndex}].values.${column.id}`;
        if (limits.scalarBytes !== undefined && UTF8_ENCODER.encode(lexical).length > limits.scalarBytes) throw new WireCodecError("limit-exceeded", "scalar limit exceeded", path);
        const type = defaultType(column.type);
        if (limits.blobBytes !== undefined && cell.state === "value" && (type === "BLOB" || type === "FILE") && atob(lexical).length > limits.blobBytes) throw new WireCodecError("limit-exceeded", "blob limit exceeded", path);
      }
    }
  }
}

function validDecodeBase64(value: string): boolean {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

/**
 * A decoded value as the drivers' typed setters convert it: numbers and dates
 * parsed like Java, BOOLEAN as true/false, FLOAT as a double. An invalid
 * BIGDECIMAL, date or BLOB reads as null; an empty BLOB stays empty.
 */
export function decodeTypedCell(cell: CanonicalCell, type: string): CanonicalCell {
  if (cell.state === "null" || cell.state === "missing") return cell;
  let value = cell.lexical || "";
  const upper = (type || "").toUpperCase();
  switch (upper) {
    case "CHAR": case "SHORT": case "USHORT": case "INT": case "UINT":
      value = javaInteger(value, 32);
      break;
    case "LONG": case "ULONG":
      value = javaInteger(value, 64);
      break;
    case "FLOAT": case "DOUBLE":
      value = javaFloating(value, 64);
      break;
    case "BIGDECIMAL": {
      const decimal = javaBigDecimal(value);
      if (decimal === undefined) return { state: "null" };
      value = decimal;
      break;
    }
    case "DATE": case "TIME": case "DATETIME": {
      const date = javaDateLexical(value, upper);
      if (date === undefined) return { state: "null" };
      value = date;
      break;
    }
    case "BOOLEAN":
      value = sourceBoolean(value) ? "true" : "false";
      break;
    case "BLOB": case "FILE":
      if (value === "") return { state: "empty", lexical: "" };
      if (!validDecodeBase64(value)) return { state: "null" };
      break;
  }
  if (cell.state === "empty" && value === "") return { state: "empty", lexical: "" };
  return { state: "value", lexical: value };
}

/**
 * How the drivers read a BLOB parameter in the text formats: Variable.set
 * converts the text to its bytes without decoding base64, so the parameter
 * holds the bytes of the wire text itself.
 */
export function textBlobCell(cell: CanonicalCell): CanonicalCell {
  if (cell.state !== "value" && cell.state !== "empty") return cell;
  const text = cell.lexical || "";
  if (text === "") return { state: "empty", lexical: "" };
  const bytes = UTF8_ENCODER.encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return { state: "value", lexical: btoa(binary) };
}

/**
 * What every driver decode shares: deleted rows go to the driver's
 * removed-row list, so they come after all live rows, and a saved row
 * holding only nulls is reported as no saved row.
 */
export function finishDecodedValue(value: CanonicalValue): CanonicalValue {
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    const live: CanonicalRow[] = [];
    const removed: CanonicalRow[] = [];
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      if (row.orgRow) {
        let meaningful = false;
        for (const id in row.orgRow.values) {
          const state = row.orgRow.values[id].state;
          if (state !== "null" && state !== "missing") meaningful = true;
        }
        if (!meaningful) row.orgRow = null;
      }
      if (row.type === "D") removed.push(row);
      else live.push(row);
    }
    dataset.rows = live.concat(removed);
  }
  return value;
}
