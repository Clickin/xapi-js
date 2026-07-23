import { defaultType, normalizeForEncode, normalizeSourceCell, validateCanonical, wireSize, wireType } from "./wire-common";
import type { CanonicalCell, CanonicalDataset, CanonicalRowType, CanonicalValue, WireCodecOptions } from "./wire-types";
import { WireCodecError } from "./wire-types";

const RECORD_SEPARATOR = "\x1e";
const UNIT_SEPARATOR = "\x1f";

const UTF8_ENCODER = new TextEncoder();
const UTF8_FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });
const ASCII_DECODER = new TextDecoder("ascii");
const WINDOWS_DECODER = new TextDecoder("windows-1252");
const LATIN1_DECODER = new TextDecoder("iso-8859-1");
type SsvProfile = "nexacro-ssv" | "xplatform-ssv";

function decodedSsvType(source: string | undefined, profile: SsvProfile, defaultString: boolean): string {
  if (source === undefined) return defaultString ? "STRING" : "UNDEFINED";
  let type = source;
  const open = type.indexOf("(");
  if (open >= 0) type = type.slice(0, open);
  const normalized = defaultType(type);
  switch (normalized) {
    case "STRING":
    case "CHAR": return "STRING";
    case "BOOLEAN": return profile === "xplatform-ssv" ? "BOOLEAN" : "INT";
    case "SHORT":
    case "USHORT":
    case "INT":
    case "UINT": return "INT";
    case "LONG":
    case "ULONG":
    case "BIGDECIMAL": return "BIGDECIMAL";
    case "FLOAT":
    case "DOUBLE": return "DOUBLE";
    case "BLOB":
    case "FILE": return "BLOB";
    case "DATE":
    case "TIME":
    case "DATETIME": return normalized;
    default: return "UNDEFINED";
  }
}

function ssvCell(source: string, profile: SsvProfile, type: string): CanonicalCell {
  void profile;
  if (source === "\x02" || source === "\x03") return { state: "null", lexical: undefined };
  if (source === "") return { state: "empty", lexical: "" };
  if (type === "BLOB") {
    try {
      if (btoa(atob(source)) !== source) return { state: "null", lexical: undefined };
    } catch {
      return { state: "null", lexical: undefined };
    }
  }
  if (type === "BOOLEAN" || type === "UNDEFINED") return { state: "value", lexical: source };
  if (type === "DATE") return /^\d{8}$/.test(source) ? { state: "value", lexical: source } : { state: "null", lexical: undefined };
  if (type === "DATETIME") {
    if (!/^\d{14}(?:\d{3})?$/.test(source)) return { state: "null", lexical: undefined };
    return { state: "value", lexical: source.length === 14 ? `${source}000` : source };
  }
  if (type === "TIME") {
    if (!/^\d{6}(?:\d{3})?$/.test(source)) return { state: "null", lexical: undefined };
    return { state: "value", lexical: source.length === 6 ? `${source}000` : source };
  }
  if (type === "BIGDECIMAL" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(source.replace(/,/g, "").trim())) return { state: "null", lexical: undefined };
  return normalizeSourceCell(type, { state: "value", lexical: source });
}

function decodeText(bytes: Uint8Array): string {
  try {
    return UTF8_FATAL_DECODER.decode(bytes);
  } catch {
    const headerEnd = bytes.indexOf(RECORD_SEPARATOR.charCodeAt(0));
    const header = headerEnd < 0 ? "" : ASCII_DECODER.decode(bytes.subarray(0, headerEnd)).toLowerCase();
    if (!/ssv:(?:iso-8859-1|latin1|windows-1252)/.test(header)) throw new Error("SSV input is not valid UTF-8");
    return (header.includes("1252") ? WINDOWS_DECODER : LATIN1_DECODER).decode(bytes);
  }
}

function splitTypedName(header: string): { id: string; type?: string } {
  const colon = header.indexOf(":");
  return colon < 0 ? { id: header, type: undefined } : { id: header.slice(0, colon), type: header.slice(colon + 1) };
}

function parseDataset(records: string[], start: number, profile: SsvProfile, unit: string): { dataset: CanonicalDataset; next: number } {
  const id = records[start].slice("Dataset:".length);
  if (!id) throw new Error("empty SSV dataset id");
  const dataset: CanonicalDataset = { id, columns: [], constColumns: [], rows: [], saveType: undefined, wire: undefined };
  const constants: Array<{ id: string; type: string; cell: CanonicalCell }> = [];
  let index = start + 1;
  for (; index < records.length && records[index] !== "" && !records[index].startsWith("Dataset:"); index++) {
    const record = records[index];
    if (record.startsWith("_Const_")) {
      const fields = record.split(unit);
      for (let fieldIndex = 1; fieldIndex < fields.length; fieldIndex++) {
        const field = fields[fieldIndex];
        const equals = field.indexOf("=");
        if (equals < 0) continue;
        const header = splitTypedName(field.slice(0, equals));
        if (!header.id) throw new Error("invalid SSV constant column");
        const type = decodedSsvType(header.type, profile, true);
        constants.push({ id: header.id, type, cell: ssvCell(field.slice(equals + 1), profile, type) });
      }
      continue;
    }
    if (record.startsWith("_RowType_")) {
      const fields = record.split(unit);
      for (let fieldIndex = 1; fieldIndex < fields.length; fieldIndex++) {
        const field = fields[fieldIndex];
        const header = field.startsWith(":") ? { id: field, type: undefined } : splitTypedName(field);
        dataset.columns.push({ id: header.id, type: decodedSsvType(header.type, profile, true), index: dataset.columns.length, size: undefined, encoding: undefined, prop: undefined, sumtext: undefined });
      }
      continue;
    }
    const fields = record.split(unit);
    const rowType = fields[0] as CanonicalRowType;
    if (!/^[NIUDO]$/.test(rowType)) continue;
    if (rowType === "O") continue;
    const values: Record<string, CanonicalCell> = {};
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      values[column.id] = ssvCell(fields[columnIndex + 1] ?? "", profile, column.type);
    }
    for (let constantIndex = 0; constantIndex < constants.length; constantIndex++) values[constants[constantIndex].id] = constants[constantIndex].cell;
    dataset.rows.push({ type: rowType, orgRow: null, values });
  }
  const constColumns = new Array(constants.length);
  for (let constantIndex = 0; constantIndex < constants.length; constantIndex++) {
    const constant = constants[constantIndex];
    constColumns[constantIndex] = { id: constant.id, type: constant.type, index: dataset.columns.length + constantIndex, value: undefined, size: undefined, encoding: undefined };
  }
  dataset.constColumns = constColumns;
  if (records[index] === "") index++;
  return { dataset, next: index };
}

export function decodeSsvWire(bytes: Uint8Array, profile: SsvProfile, options: WireCodecOptions = {}): CanonicalValue {
  try {
    if (options.ssvUnitSeparator || options.ssvRecordSeparator) throw new Error("custom SSV separators are not supported by the official driver");
    const source = decodeText(bytes);
    const records = source.split(RECORD_SEPARATOR);
    const header = records[0];
    const value: CanonicalValue = { parameters: [], datasets: [], saveType: undefined, wire: undefined };
    if (header !== "SSV" && !header.startsWith("SSV:")) return value;
    let index = 1;
    while (index < records.length) {
      const record = records[index];
      if (!record) { index++; continue; }
      if (record.startsWith("Dataset:")) {
        const parsed = parseDataset(records, index, profile, UNIT_SEPARATOR);
        value.datasets.push(parsed.dataset);
        index = parsed.next;
        continue;
      }
      const variables = record.split(UNIT_SEPARATOR);
      for (let variableIndex = 0; variableIndex < variables.length; variableIndex++) {
        const variable = variables[variableIndex];
        const equals = variable.indexOf("=");
        if (equals < 0) continue;
        const header = splitTypedName(variable.slice(0, equals));
        if (!header.id) throw new Error("invalid SSV variable");
        const type = decodedSsvType(header.type, profile, true);
        const cell = ssvCell(variable.slice(equals + 1), profile, type);
        const parameter = { id: header.id, type, state: cell.state, lexical: cell.lexical, index: undefined, wire: undefined };
        let previous = -1;
        for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
          if (value.parameters[parameterIndex].id === header.id) { previous = parameterIndex; break; }
        }
        if (previous >= 0) value.parameters.splice(previous, 1);
        value.parameters.push(parameter);
      }
      index++;
    }
    return value;
  } catch (error) {
    if (error instanceof WireCodecError) throw error;
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

function encodeCell(cell: CanonicalCell | undefined, profile: SsvProfile): string {
  if (!cell || cell.state === "missing" || cell.state === "null" || cell.state === "empty") return profile === "nexacro-ssv" ? "\x03" : "";
  return cell.lexical || "";
}

export function encodeSsvWire(source: CanonicalValue, profile: SsvProfile): Uint8Array {
  validateCanonical(source);
  const value = normalizeForEncode(source);
  let output = `SSV:UTF-8${RECORD_SEPARATOR}`;
  for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
    const parameter = value.parameters[parameterIndex];
    if (parameter.state !== "missing") output += `${parameter.id}:${wireType(parameter.type)}=${encodeCell(parameter, profile)}${RECORD_SEPARATOR}`;
  }
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    if (!dataset.id) throw new WireCodecError("malformed-input", "empty SSV dataset id");
    output += `Dataset:${dataset.id}${RECORD_SEPARATOR}`;
    if (dataset.constColumns.length) {
      output += "_Const_";
      for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
        const column = dataset.constColumns[columnIndex];
        output += `${UNIT_SEPARATOR}${column.id}:${wireType(column.type)}(${wireSize(column.type)})=${encodeCell(column.value, profile)}`;
      }
      output += RECORD_SEPARATOR;
    }
    output += "_RowType_";
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      output += `${UNIT_SEPARATOR}${column.id}:${wireType(column.type)}(${wireSize(column.type)})`;
    }
    output += RECORD_SEPARATOR;
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      if (row.type === "O") continue;
      output += row.type;
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) output += UNIT_SEPARATOR + encodeCell(row.values[dataset.columns[columnIndex].id], profile);
      output += RECORD_SEPARATOR;
    }
    if (profile === "nexacro-ssv") output += RECORD_SEPARATOR;
  }
  if (profile === "nexacro-ssv" && !output.endsWith(RECORD_SEPARATOR + RECORD_SEPARATOR)) output += RECORD_SEPARATOR;
  return UTF8_ENCODER.encode(output);
}
