import type { CanonicalCell, CanonicalDataset, CanonicalRow, CanonicalValue, SaveType, WireCodecOptions } from "./wire-types";
import { WireCodecError } from "./wire-types";

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
const INTEGER_RANGES: Record<string, readonly [bigint, bigint]> = {
  SHORT: [-32768n, 32767n], USHORT: [-32768n, 32767n],
  INT: [-2147483648n, 2147483647n], UINT: [-2147483648n, 2147483647n],
  LONG: [-9223372036854775808n, 9223372036854775807n], ULONG: [-9223372036854775808n, 9223372036854775807n],
};
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
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

function sourceBoolean(value: string): boolean {
  return /^(?:true|yes|y|on|1)$/i.test(value);
}

function normalizeInteger(value: string, type: string): string {
  const stripped = value.trim().replace(/,/g, "");
  let normalized: string;
  if (type !== "LONG" && type !== "ULONG" && /^0x[0-9a-f]+$/i.test(stripped)) normalized = BigInt(stripped).toString();
  else {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(stripped)) return "0";
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(stripped);
    if (!match) return "0";
    const sign = match[1] === "-" ? "-" : "";
    const digits = `${match[2] || "0"}${match[3] || ""}`.replace(/^0+/, "") || "0";
    const decimalPlaces = (match[3]?.length || 0) - Number(match[4] || 0);
    let integer: string;
    if (decimalPlaces <= 0) integer = digits + "0".repeat(-decimalPlaces);
    else if (digits.length <= decimalPlaces) integer = "0";
    else integer = digits.slice(0, -decimalPlaces);
    integer = integer.replace(/^0+/, "") || "0";
    normalized = integer === "0" ? "0" : sign + integer;
  }
  const range = INTEGER_RANGES[type];
  const parsed = BigInt(normalized);
  return parsed < range[0] || parsed > range[1] ? "0" : normalized;
}

function goFloat(value: string, bits: 32 | 64): string {
  const stripped = value.trim().replace(/,/g, "");
  let number: number;
  if (stripped === "Infinity" || stripped === "+Infinity") number = Infinity;
  else if (stripped === "-Infinity") number = -Infinity;
  else number = Number(stripped);
  if (Number.isNaN(number)) return stripped.toLowerCase() === "nan" ? "NaN" : "0.0";
  if (bits === 32) number = Math.fround(number);
  if (number === Infinity) return "Infinity";
  if (number === -Infinity) return "-Infinity";
  let formatted = String(number);
  if (formatted.includes("e")) {
    const exponent = /e([+-]?)(\d+)$/.exec(formatted);
    if (exponent) formatted = formatted.slice(0, exponent.index) + `e${exponent[1] || "+"}${Number(exponent[2])}`;
  }
  if (!/[.eE]/.test(formatted)) formatted += ".0";
  return formatted;
}

function normalizeDecimal(value: string): string {
  let stripped = value.trim().replace(/,/g, "");
  if (!DECIMAL_PATTERN.test(stripped)) return "0";
  let exponent = "";
  const exponentAt = stripped.search(/[eE]/);
  if (exponentAt >= 0) {
    exponent = stripped.slice(exponentAt);
    stripped = stripped.slice(0, exponentAt);
  }
  let sign = "";
  if (stripped[0] === "+" || stripped[0] === "-") {
    sign = stripped[0] === "-" ? "-" : "";
    stripped = stripped.slice(1);
  }
  const dot = stripped.indexOf(".");
  const integer = (dot < 0 ? stripped : stripped.slice(0, dot)).replace(/^0+/, "") || "0";
  return sign + integer + (dot < 0 ? "" : stripped.slice(dot)) + exponent;
}

export function normalizeSourceCell(type: string, cell: CanonicalCell): CanonicalCell {
  if (cell.state !== "value") return { state: cell.state, lexical: cell.lexical };
  const lexical = cell.lexical || "";
  const normalizedType = defaultType(type);
  switch (normalizedType) {
    case "BOOLEAN": return { state: "value", lexical: sourceBoolean(lexical) ? "1" : "0" };
    case "SHORT":
    case "USHORT":
    case "INT":
    case "UINT":
    case "LONG":
    case "ULONG": return { state: "value", lexical: normalizeInteger(lexical, normalizedType) };
    case "FLOAT": return { state: "value", lexical: goFloat(lexical, 32) };
    case "DOUBLE": return { state: "value", lexical: goFloat(lexical, 64) };
    case "DECIMAL":
    case "BIGDECIMAL": return { state: "value", lexical: normalizeDecimal(lexical) };
    default: return { state: cell.state, lexical: cell.lexical };
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
        value: column.value ? normalizeSourceCell(column.type, column.value) : undefined,
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

function selectedRows(dataset: CanonicalDataset, rootSaveType: SaveType | undefined): CanonicalRow[] {
  const saveType = dataset.saveType || rootSaveType || 0;
  if (saveType === 0 || saveType === 1) return dataset.rows;
  const rows: CanonicalRow[] = [];
  for (let index = 0; index < dataset.rows.length; index++) {
    const row = dataset.rows[index];
    const type = row.type || "N";
    const include = saveType === 2 ? type !== "D" : saveType === 3 ? type === "I" || type === "U" : saveType === 4 ? type === "D" : type !== "N";
    if (include) rows.push(saveType === 2 ? { type: "N", orgRow: null, values: row.values } : row);
  }
  return rows;
}

export function applySaveTypes(value: CanonicalValue): CanonicalValue {
  let needsFiltering = Boolean(value.saveType);
  for (let index = 0; !needsFiltering && index < value.datasets.length; index++) needsFiltering = Boolean(value.datasets[index].saveType);
  if (!needsFiltering) return value;
  const datasets = new Array(value.datasets.length);
  for (let index = 0; index < value.datasets.length; index++) {
    const dataset = value.datasets[index];
    datasets[index] = {
      id: dataset.id,
      columns: dataset.columns,
      constColumns: dataset.constColumns,
      rows: selectedRows(dataset, value.saveType),
      saveType: dataset.saveType,
      wire: dataset.wire,
    };
  }
  return { parameters: value.parameters, datasets, saveType: value.saveType, wire: value.wire };
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

export function validateCanonical(value: CanonicalValue): void {
  if ((value.saveType || 0) < 0 || (value.saveType || 0) > 5) throw new WireCodecError("invalid-value", `invalid root saveType ${value.saveType}`, "value");
  for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
    const parameter = value.parameters[parameterIndex];
    if (!isKnownType(parameter.type)) throw new WireCodecError("invalid-value", `unsupported parameter type ${parameter.type}`, "value");
    validateCell(parameter.type, parameter, `value.parameters[${parameterIndex}]`);
  }
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    if ((dataset.saveType || 0) < 0 || (dataset.saveType || 0) > 5) throw new WireCodecError("invalid-value", `invalid dataset saveType ${dataset.saveType}`, "value");
    for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
      const column = dataset.constColumns[columnIndex];
      if (!isKnownType(column.type)) throw new WireCodecError("invalid-value", `unsupported constant column type ${column.type}`, "value");
      if (column.value) validateCell(column.type, column.value, `value.datasets[${datasetIndex}].constColumns[${columnIndex}]`);
    }
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      if (!isKnownType(column.type)) throw new WireCodecError("invalid-value", `unsupported column type ${column.type}`, "value");
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
