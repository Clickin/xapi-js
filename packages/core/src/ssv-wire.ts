import { decodeTypedCell, defaultType, emptyValue, finishDecodedValue, isKnownType, normalizeForEncode, textBlobCell, validateCanonical } from "./wire-common";
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

/**
 * The SSV cell of a field: the null marker (\x02 for XPLATFORM, \x03 for
 * Nexacro), empty, or a value.
 */
function parsedCell(source: string, profile: SsvProfile): CanonicalCell {
  if (source === (profile === "xplatform-ssv" ? "\x02" : "\x03")) return { state: "null" };
  if (source === "") return { state: "empty", lexical: "" };
  return { state: "value", lexical: source };
}

/**
 * Converts a cell as the drivers' typed setters do. BLOB text is
 * base64-decoded only for Nexacro SSV columns; parameters, and every
 * XPLATFORM SSV BLOB, keep the bytes of the text itself.
 */
function typedCell(cell: CanonicalCell, type: string, profile: SsvProfile, parameter: boolean): CanonicalCell {
  if ((type === "BLOB" || type === "FILE") && (parameter || profile === "xplatform-ssv")) return textBlobCell(cell);
  return decodeTypedCell(cell, type);
}

function numericParameter(type: string): boolean {
  return ["SHORT", "USHORT", "INT", "UINT", "LONG", "ULONG", "FLOAT", "DOUBLE"].includes(type);
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





/**
 * Reads "id:type(size)" as the drivers do: no type is STRING, FLOAT reads as
 * DOUBLE, DECIMAL and unknown types as UNDEFINED.
 */
function parseTypedName(header: string): { id: string; type: string; size: string } {
  const colon = header.indexOf(":");
  if (colon <= 0) return { id: header, type: "STRING", size: "" };
  const id = header.slice(0, colon);
  const typeAndSize = header.slice(colon + 1);
  let type = typeAndSize;
  let size = "";
  const open = typeAndSize.indexOf("(");
  if (open >= 0) {
    if (!typeAndSize.endsWith(")") || open === 0) throw new Error("invalid SSV type");
    type = typeAndSize.slice(0, open);
    size = typeAndSize.slice(open + 1, -1);
    if (size === "") throw new Error("empty SSV length");
  }
  const upper = type.toUpperCase();
  if (upper === "") type = "STRING";
  else if (upper === "FLOAT") type = "DOUBLE";
  else if (upper === "DECIMAL" || !isKnownType(upper)) type = "UNDEFINED";
  else type = upper;
  return { id, type, size };
}

function parseDataset(records: string[], start: number, profile: SsvProfile, unit: string): { dataset: CanonicalDataset; next: number } {
  const id = records[start].slice("Dataset:".length);
  if (!id) throw new Error("empty SSV dataset id");
  const dataset: CanonicalDataset = { id, columns: [], constColumns: [], rows: [] };
  const constants: Array<{ id: string; type: string; cell: CanonicalCell }> = [];
  let index = start + 1;
  for (; index < records.length && records[index] !== "" && !records[index].startsWith("Dataset:"); index++) {
    const record = records[index];
    if (record.startsWith("_Const_")) {
      const fields = record.split(unit);
      if (fields[0] !== "_Const_") throw new Error("invalid SSV constant header");
      for (let fieldIndex = 1; fieldIndex < fields.length; fieldIndex++) {
        const field = fields[fieldIndex];
        const equals = field.indexOf("=");
        if (equals < 0) continue;
        const header = parseTypedName(field.slice(0, equals));
        if (!header.id) throw new Error("invalid SSV constant column");
        // A constant has no null marker: \x03 here is the character itself.
        const value = field.slice(equals + 1);
        constants.push({ id: header.id, type: header.type, cell: value === "" ? { state: "empty", lexical: "" } : { state: "value", lexical: value } });
      }
      continue;
    }
    if (record.startsWith("_RowType_")) {
      const fields = record.split(unit);
      if (fields[0] !== "_RowType_") throw new Error("invalid SSV column header");
      for (let fieldIndex = 1; fieldIndex < fields.length; fieldIndex++) {
        const parts = fields[fieldIndex].split(":");
        const header = parseTypedName(parts.slice(0, 2).join(":"));
        if (!header.id) throw new Error("invalid SSV column");
        const type = parts.length > 2 && header.size === "" ? "UNDEFINED" : header.type;
        dataset.columns.push({ id: header.id, type, index: dataset.columns.length });
      }
      continue;
    }
    const fields = record.split(unit);
    const rowType = fields[0] as CanonicalRowType;
    if (!/^[NIUDO]$/.test(rowType) || !dataset.columns.length) continue;
    const values: Record<string, CanonicalCell> = {};
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      values[column.id] = columnIndex + 1 >= fields.length ? { state: "missing" } : typedCell(parsedCell(fields[columnIndex + 1], profile), column.type, profile, false);
    }
    if (rowType === "O") {
      const previous = dataset.rows[dataset.rows.length - 1];
      if (previous && previous.type === "U") {
        for (let constantIndex = 0; constantIndex < constants.length; constantIndex++) values[constants[constantIndex].id] = constants[constantIndex].cell;
        previous.orgRow = { type: "O", orgRow: null, values };
      }
      continue;
    }
    for (let constantIndex = 0; constantIndex < constants.length; constantIndex++) values[constants[constantIndex].id] = constants[constantIndex].cell;
    dataset.rows.push({ type: rowType, orgRow: null, values });
  }
  dataset.constColumns = constants.map((constant, constantIndex) => ({ id: constant.id, type: constant.type, index: dataset.columns.length + constantIndex }));
  if (records[index] === "") index++;
  return { dataset, next: index };
}

export function decodeSsvWire(bytes: Uint8Array, profile: SsvProfile, options: WireCodecOptions = {}): CanonicalValue {
  try {
    if ((options.ssvRecordSeparator !== undefined && options.ssvRecordSeparator !== RECORD_SEPARATOR) || (options.ssvUnitSeparator !== undefined && options.ssvUnitSeparator !== UNIT_SEPARATOR)) return emptyValue();
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
        const header = parseTypedName(variable.slice(0, equals));
        if (!header.id) throw new Error("invalid SSV variable");
        const type = header.type === "UNDEFINED" ? "STRING" : header.type;
        let raw = parsedCell(variable.slice(equals + 1), profile);
        // Variable.set converts the null marker like an empty number: 0.
        if (raw.state === "null" && numericParameter(type)) raw = { state: "empty", lexical: "" };
        const cell = typedCell(raw, type, profile, true);
        const parameter = { id: header.id, type, state: cell.state, lexical: cell.lexical };
        let previous = -1;
        for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
          if (value.parameters[parameterIndex].id === header.id) { previous = parameterIndex; break; }
        }
        if (previous >= 0) value.parameters.splice(previous, 1);
        value.parameters.push(parameter);
      }
      index++;
    }
    return finishDecodedValue(value);
  } catch (error) {
    if (error instanceof WireCodecError) throw error;
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}



function validateToken(value: string): string {
  if (value.includes(UNIT_SEPARATOR) || value.includes(RECORD_SEPARATOR)) throw new WireCodecError("invalid-value", "SSV value contains a separator", "value");
  return value;
}

function encodeCell(cell: CanonicalCell | undefined, profile: SsvProfile): string {
  if (!cell || cell.state === "missing" || cell.state === "null") return profile === "nexacro-ssv" ? "\x03" : "";
  if (cell.state === "empty") return "";
  return validateToken(cell.lexical || "");
}

/** An unset BOOLEAN is written as 0: the drivers hold it as false. */
function encodeTypedCell(type: string, cell: CanonicalCell | undefined, profile: SsvProfile): string {
  if ((!cell || cell.state === "null" || cell.state === "missing") && defaultType(type) === "BOOLEAN") return "0";
  return encodeCell(cell, profile);
}

function ssvWireType(type: string): string {
  switch (defaultType(type)) {
    case "CHAR": case "STRING": return "string";
    case "SHORT": case "USHORT": case "INT": case "UINT": case "BOOLEAN": return "int";
    case "FLOAT": case "DOUBLE": return "float";
    case "LONG": case "ULONG": case "DECIMAL": case "BIGDECIMAL": return "bigdecimal";
    case "DATE": return "date";
    case "TIME": return "time";
    case "DATETIME": return "datetime";
    case "BLOB": case "FILE": return "blob";
    default: return defaultType(type).toLowerCase();
  }
}

const SSV_DEFAULT_SIZES: Record<string, string> = {
  CHAR: "1", STRING: "32", SHORT: "2", USHORT: "2", BOOLEAN: "2", INT: "4", UINT: "4", FLOAT: "4",
  LONG: "8", ULONG: "8", DOUBLE: "8", DECIMAL: "16", BIGDECIMAL: "16", DATE: "6", TIME: "9", DATETIME: "17",
  BLOB: "256", FILE: "256",
};

function ssvSize(size: string | undefined, type: string): string {
  return size || SSV_DEFAULT_SIZES[defaultType(type)] || "0";
}

/** Writes SSV as the original drivers do, byte for byte. */
export function encodeSsvWire(source: CanonicalValue, profile: SsvProfile): Uint8Array {
  validateCanonical(source);
  const value = normalizeForEncode(source);
  const nexacro = profile === "nexacro-ssv";
  let output = `SSV:UTF-8${RECORD_SEPARATOR}`;
  for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
    const parameter = value.parameters[parameterIndex];
    const header = `${validateToken(parameter.id)}:${ssvWireType(parameter.type)}`;
    if (parameter.state === "missing") {
      output += header + RECORD_SEPARATOR;
      continue;
    }
    // The drivers write a null BLOB variable as an empty value.
    const cell: CanonicalCell = parameter.state === "null" && defaultType(parameter.type) === "BLOB" ? { state: "empty" } : parameter;
    output += `${header}=${encodeTypedCell(parameter.type, cell, profile)}${RECORD_SEPARATOR}`;
  }
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    output += `Dataset:${validateToken(dataset.id)}${RECORD_SEPARATOR}`;
    if (dataset.constColumns.length) {
      output += "_Const_";
      for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
        const column = dataset.constColumns[columnIndex];
        output += `${UNIT_SEPARATOR}${validateToken(column.id)}:${ssvWireType(column.type)}(${ssvSize(column.size, column.type)})`;
        const cell = column.value;
        if (cell?.state === "missing") continue;
        // A constant has no null marker: null is written as an empty value.
        output += `=${!cell || cell.state === "null" ? "" : encodeCell(cell, profile)}`;
      }
      output += RECORD_SEPARATOR;
    }
    if (!dataset.columns.length) throw new WireCodecError("invalid-value", `SSV dataset ${dataset.id} has no columns`, "value");
    output += "_RowType_";
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      output += `${UNIT_SEPARATOR}${validateToken(`${column.id}:${ssvWireType(column.type)}(${ssvSize(column.size, column.type)})`)}`;
    }
    output += RECORD_SEPARATOR;
    const writeRow = (type: string, cells: Record<string, CanonicalCell>): void => {
      if (type.length !== 1 || !"NIUDO".includes(type)) throw new WireCodecError("invalid-value", `invalid SSV row type ${type}`, "value");
      output += type;
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
        const column = dataset.columns[columnIndex];
        // A saved row keeps no BOOLEAN default.
        output += UNIT_SEPARATOR + encodeTypedCell(type === "O" ? "STRING" : column.type, cells[column.id], profile);
      }
      output += RECORD_SEPARATOR;
    };
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      writeRow(row.type, row.values);
      if (row.orgRow) writeRow("O", row.orgRow.values);
    }
    if (nexacro || datasetIndex + 1 < value.datasets.length) output += RECORD_SEPARATOR;
  }
  if (nexacro && !value.datasets.length) output += RECORD_SEPARATOR;
  return UTF8_ENCODER.encode(output);
}
