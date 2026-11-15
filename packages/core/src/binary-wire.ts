import { defaultType, finishDecodedValue, normalizeForEncode, normalizeSourceCell, validateCanonical, wireSize } from "./wire-common";
import { formatJavaDate, javaDate } from "./java-scalar";
import type { CanonicalCell, CanonicalDataset, CanonicalRow, CanonicalRowType, CanonicalValue } from "./wire-types";
import { WireCodecError } from "./wire-types";

const VARIABLE_MARK = 0xfe10;
const DATASET_MARK = 0xfe01;
const VERSION = 5000;
const MAX_LENGTH = 10 << 20;

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();
type BinaryProfile = "nexacro-binary-5000" | "xplatform-binary-5000";

class BinaryReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number { return this.bytes.length - this.offset; }

  u16(): number {
    if (this.remaining < 2) throw new Error("truncated PlatformBinary value");
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 2).getUint16(0, false);
    this.offset += 2;
    return value;
  }

  i16(): number {
    const value = this.u16();
    return value & 0x8000 ? value - 0x10000 : value;
  }

  i32(): number {
    if (this.remaining < 4) throw new Error("truncated PlatformBinary integer");
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getInt32(0, false);
    this.offset += 4;
    return value;
  }

  f64(): number {
    if (this.remaining < 8) throw new Error("truncated PlatformBinary float");
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8).getFloat64(0, false);
    this.offset += 8;
    return value;
  }

  length(): number {
    const first = this.u16();
    const length = first & 0x8000 ? ((first & 0x7fff) << 16) | this.u16() : first;
    if (length < 0 || length > MAX_LENGTH || length > this.remaining) throw new Error(`binary length ${length} exceeds available limit`);
    return length;
  }

  take(length: number): Uint8Array {
    if (length < 0 || length > MAX_LENGTH || length > this.remaining) throw new Error(`binary length ${length} exceeds available limit`);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  shortString(): string {
    return UTF8_DECODER.decode(this.take(this.u16()));
  }
}

class BinaryWriter {
  private bytes = new Uint8Array(256);
  private view = new DataView(this.bytes.buffer);
  private offset = 0;

  private ensure(additional: number): void {
    const required = this.offset + additional;
    if (required <= this.bytes.length) return;
    let capacity = this.bytes.length;
    while (capacity < required) capacity *= 2;
    const expanded = new Uint8Array(capacity);
    expanded.set(this.bytes);
    this.bytes = expanded;
    this.view = new DataView(expanded.buffer);
  }
  u16(value: number): void {
    this.ensure(2);
    this.bytes[this.offset++] = value >>> 8 & 0xff;
    this.bytes[this.offset++] = value & 0xff;
  }
  u32(value: number): void {
    this.ensure(4);
    this.bytes[this.offset++] = value >>> 24 & 0xff;
    this.bytes[this.offset++] = value >>> 16 & 0xff;
    this.bytes[this.offset++] = value >>> 8 & 0xff;
    this.bytes[this.offset++] = value & 0xff;
  }
  i32(value: number): void { this.u32(value >>> 0); }
  f64(value: number): void {
    this.ensure(8);
    // Double.doubleToLongBits writes one canonical NaN.
    if (Number.isNaN(value)) this.view.setUint32(this.offset, 0x7ff80000, false), this.view.setUint32(this.offset + 4, 0, false);
    else this.view.setFloat64(this.offset, value, false);
    this.offset += 8;
  }
  write(value: Uint8Array): void {
    this.ensure(value.length);
    this.bytes.set(value, this.offset);
    this.offset += value.length;
  }
  length(value: number): void { value < 32768 ? this.u16(value) : this.u32(value | 0x80000000); }
  shortString(value: string): void {
    const bytes = UTF8_ENCODER.encode(value);
    if (bytes.length > 32767) throw new Error("binary string exceeds short length");
    this.u16(bytes.length);
    this.write(bytes);
  }
  result(): Uint8Array { return this.bytes.slice(0, this.offset); }
}

type BinaryValue = { tag: number; value: string | number | boolean | Uint8Array | undefined };

function readValue(reader: BinaryReader, tag: number): BinaryValue {
  if (tag === 0 || tag === 1) return { tag, value: undefined };
  if (tag === 2) return { tag, value: reader.i16() !== 0 };
  if (tag === 3) return { tag, value: reader.i32() };
  if (tag === 4 || tag === 41) return { tag, value: reader.f64() };
  if (tag === 21 || tag === 40) return { tag, value: UTF8_DECODER.decode(reader.take(reader.length())) };
  if (tag === 26) return { tag, value: reader.take(reader.length()) };
  throw new Error(`invalid PlatformBinary value type 0x${tag.toString(16).padStart(4, "0")}`);
}

function variantType(tag: number): string {
  switch (tag) {
    case 2: return "BOOLEAN";
    case 3: return "INT";
    case 4: return "DOUBLE";
    case 21: return "STRING";
    case 26: return "BLOB";
    case 40: return "BIGDECIMAL";
    case 41: return "DATETIME";
    default: return "UNDEFINED";
  }
}

function columnType(code: number): string {
  switch (code) {
    case 1: return "STRING";
    case 2: return "INT";
    case 3: return "DOUBLE";
    case 4: return "BIGDECIMAL";
    case 5: return "DATE";
    case 6: return "TIME";
    case 7: return "DATETIME";
    case 8: return "BLOB";
    default: return "UNDEFINED";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

/**
 * Formats a double like the reference reads it (Go strconv 'g' shortest,
 * with ".0" added when there is no fraction or exponent).
 */
function goDouble(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "+Inf.0" : "-Inf.0";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
  const [mantissa, exponentText] = Math.abs(value).toExponential().split("e");
  const exponent = Number(exponentText);
  const digits = mantissa.replace(".", "");
  const sign = value < 0 ? "-" : "";
  let text: string;
  if (exponent < -4 || exponent >= 6) {
    text = `${sign}${mantissa}e${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
  } else if (exponent < 0) {
    text = `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
  } else if (digits.length <= exponent + 1) {
    text = `${sign}${digits}${"0".repeat(exponent + 1 - digits.length)}`;
  } else {
    text = `${sign}${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`;
  }
  return /[.eN]/.test(text) ? text : `${text}.0`;
}

/** A value read as the type: dates as the column's date type, BLOB text as its bytes. */
function binaryCell(value: BinaryValue, type = variantType(value.tag)): CanonicalCell {
  if (value.tag === 0 || value.tag === 1) return { state: "null" };
  if (value.value instanceof Uint8Array) return value.value.length ? { state: "value", lexical: bytesToBase64(value.value) } : { state: "empty", lexical: "" };
  if (typeof value.value === "boolean") return { state: "value", lexical: String(value.value) };
  if (typeof value.value === "number") {
    if (value.tag === 41) return { state: "value", lexical: formatJavaDate(Math.trunc(value.value), type) };
    if (value.tag === 4) return { state: "value", lexical: goDouble(value.value) };
    return { state: "value", lexical: String(value.value) };
  }
  const lexical = String(value.value ?? "");
  if (lexical === "") return { state: "empty", lexical: "" };
  if (type === "BLOB" || type === "FILE") return { state: "value", lexical: bytesToBase64(UTF8_ENCODER.encode(lexical)) };
  return { state: "value", lexical };
}

function readVariables(reader: BinaryReader, value: CanonicalValue): void {
  if (reader.u16() !== VERSION) throw new Error("invalid PlatformBinary variable version");
  const block = new BinaryReader(reader.take(reader.length()));
  const count = block.u16();
  for (let index = 0; index < count; index++) {
    const id = block.shortString();
    const tag = block.u16();
    const cell = binaryCell(readValue(block, tag));
    value.parameters.push({ id, type: variantType(tag), state: cell.state, lexical: cell.lexical });
  }
  if (block.remaining) throw new Error("trailing bytes in PlatformBinary variable block");
}

function binaryRowType(code: number): CanonicalRowType {
  switch (code) {
    case 2: return "I";
    case 4: return "U";
    case 8: return "D";
    default: return "N";
  }
}

function readDataset(reader: BinaryReader, value: CanonicalValue): void {
  if (reader.u16() !== VERSION) throw new Error("invalid PlatformBinary dataset version");
  const header = new BinaryReader(reader.take(reader.length()));
  const id = header.shortString();
  if (header.u16() !== VARIABLE_MARK || header.u16() !== VERSION) throw new Error("invalid PlatformBinary constant block");
  const constantBlock = new BinaryReader(header.take(header.length()));
  const constantCount = constantBlock.u16();
  const constants: Array<{ id: string; type: string; cell: CanonicalCell }> = [];
  for (let index = 0; index < constantCount; index++) {
    const constantId = constantBlock.shortString();
    const tag = constantBlock.u16();
    constants.push({ id: constantId, type: variantType(tag), cell: binaryCell(readValue(constantBlock, tag)) });
  }
  if (constantBlock.remaining) throw new Error("trailing bytes in PlatformBinary constant block");
  const columnCount = header.u16();
  const dataset: CanonicalDataset = { id, columns: [], constColumns: [], rows: [], saveType: undefined, wire: undefined };
  for (let index = 0; index < columnCount; index++) {
    const columnId = header.shortString();
    const type = columnType(header.u16());
    const size = header.u16();
    const attribute = header.u16();
    if ((attribute & 0xf000) === 0x6000) header.shortString();
    void size;
    dataset.columns.push({ id: columnId, type, index: constantCount + index });
  }
  if (header.remaining) throw new Error("trailing bytes in PlatformBinary dataset header");
  const constColumns = new Array(constants.length);
  for (let index = 0; index < constants.length; index++) {
    const constant = constants[index];
    constColumns[index] = { id: constant.id, type: constant.type, index };
  }
  dataset.constColumns = constColumns;
  while (true) {
    const rowLength = reader.length();
    const rowCode = reader.u16();
    if (rowLength === 0 && rowCode === 0) break;
    if (rowLength < 2) throw new Error("invalid PlatformBinary row length");
    const row = new BinaryReader(reader.take(rowLength - 2));
    const count = row.u16();
    const values: Record<string, CanonicalCell> = {};
    for (let index = 0; index < count; index++) {
      const tag = row.u16();
      const wire = readValue(row, tag);
      if (index < dataset.columns.length) values[dataset.columns[index].id] = binaryCell(wire, dataset.columns[index].type);
    }
    let orgRow: CanonicalRow | null = null;
    const type = binaryRowType(rowCode);
    if (type === "U") {
      const savedCount = row.u16();
      const saved: Record<string, CanonicalCell> = {};
      for (let index = 0; index < savedCount; index++) {
        const tag = row.u16();
        const wire = readValue(row, tag);
        if (index < dataset.columns.length) saved[dataset.columns[index].id] = binaryCell(wire, dataset.columns[index].type);
      }
      orgRow = { type: "O", orgRow: null, values: saved };
    }
    if (row.remaining) throw new Error("trailing bytes in PlatformBinary row");
    for (let index = 0; index < constants.length; index++) values[constants[index].id] = constants[index].cell;
    dataset.rows.push({ type, orgRow, values });
  }
  value.datasets.push(dataset);
}

export function decodeBinaryWire(bytes: Uint8Array, _profile: BinaryProfile): CanonicalValue {
  try {
    const value: CanonicalValue = { parameters: [], datasets: [], saveType: undefined, wire: undefined };
    // The drivers cannot read an empty PlatformBinary body.
    if (!bytes.length) throw new Error("empty PlatformBinary payload");
    if (bytes.length > MAX_LENGTH) throw new Error("binary payload exceeds limit");
    const reader = new BinaryReader(bytes);
    let mark = reader.u16();
    if (mark === VARIABLE_MARK) readVariables(reader, value);
    else if (mark === DATASET_MARK) readDataset(reader, value);
    else throw new Error(`invalid PlatformBinary mark 0x${mark.toString(16)}`);
    while (reader.remaining) {
      mark = reader.u16();
      if (mark !== DATASET_MARK) throw new Error("invalid PlatformBinary dataset mark");
      readDataset(reader, value);
    }
    return finishDecodedValue(value);
  } catch (error) {
    if (error instanceof WireCodecError) throw error;
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

function columnCode(type: string): number {
  switch (defaultType(type)) {
    case "STRING":
    case "CHAR": return 1;
    case "SHORT":
    case "USHORT":
    case "INT":
    case "UINT":
    case "BOOLEAN": return 2;
    case "FLOAT":
    case "DOUBLE": return 3;
    case "LONG":
    case "ULONG":
    case "DECIMAL":
    case "BIGDECIMAL": return 4;
    case "DATE": return 5;
    case "TIME": return 6;
    case "DATETIME": return 7;
    case "BLOB":
    case "FILE": return 8;
    default: return 0;
  }
}

function rowCode(type: CanonicalRowType): number {
  switch (type) {
    case "I": return 2;
    case "U": return 4;
    case "D": return 8;
    default: return 1;
  }
}

/**
 * Reads the normalized lexical of a date whose year has more than four digits
 * (formatJavaDate never cuts the year), which javaDate cannot tell apart by
 * length.
 */
function longYearDate(lexical: string, type: string): number | undefined {
  if (type === "TIME") return undefined;
  const tail = type === "DATE" ? 4 : 13;
  if (lexical.length <= tail + 4 || !/^\d+$/.test(lexical)) return undefined;
  const year = Number(lexical.slice(0, lexical.length - tail));
  const rest = lexical.slice(lexical.length - tail);
  const n = (start: number, end: number): number => Number(rest.slice(start, end));
  const date = new Date(0);
  date.setUTCFullYear(year, n(0, 2) - 1, n(2, 4));
  if (tail === 13) date.setUTCHours(n(4, 6), n(6, 8), n(8, 10), n(10, 13));
  return date.getTime();
}

/** A date lexical as the epoch milliseconds (UTC) PlatformBinary carries. */
function epoch(lexical: string, type: string): number {
  const millis = longYearDate(lexical, type) ?? javaDate(lexical, type);
  if (millis === undefined) throw new WireCodecError("invalid-value", `invalid PlatformBinary ${type.toLowerCase()} ${lexical}`, "value");
  return millis;
}

function binaryInteger(lexical: string): number {
  const text = lexical.trim().replace(/,/g, "");
  const hex = /^0[xX]/.test(text);
  const body = hex ? text.slice(2) : text;
  if (!(hex ? /^[+-]?[0-9a-fA-F]+$/ : /^[+-]?\d+$/).test(body)) throw new WireCodecError("invalid-value", `invalid PlatformBinary integer ${lexical}`, "value");
  const negative = body[0] === "-";
  const digits = body.replace(/^[+-]/, "");
  const value = BigInt(hex ? `0x${digits}` : digits) * (negative ? -1n : 1n);
  return Number(BigInt.asIntN(32, value));
}

/**
 * A null of a primitive Java type is written as that type's zero; the object
 * types stay null.
 */
function primitiveNullAsZero(type: string, cell: CanonicalCell | undefined): CanonicalCell | undefined {
  if (cell && cell.state !== "null" && cell.state !== "missing") return cell;
  switch (defaultType(type)) {
    case "SHORT": case "USHORT": case "INT": case "UINT": case "LONG": case "ULONG": case "BOOLEAN": case "FLOAT": case "DOUBLE":
      return { state: "value", lexical: "0" };
    default:
      return cell;
  }
}

/**
 * A constant value converted to the column type as the drivers do before
 * writing it: an empty value converts like any other lexical, so it becomes
 * zero or null for the non-string types.
 */
function constCell(type: string, source: CanonicalCell | undefined): CanonicalCell | undefined {
  let cell = primitiveNullAsZero(type, source);
  switch (defaultType(type)) {
    case "STRING": case "CHAR": case "BLOB": case "FILE": case "UNDEFINED":
      return cell;
  }
  if (!cell) return cell;
  if (cell.state === "empty") cell = { state: "value", lexical: "" };
  return normalizeSourceCell(type, cell);
}

function writeLengthBytes(writer: BinaryWriter, bytes: Uint8Array): void {
  if (bytes.length > MAX_LENGTH) throw new Error("binary value exceeds payload limit");
  writer.length(bytes.length);
  writer.write(bytes);
}

function writeTypedValue(writer: BinaryWriter, type: string, cell: CanonicalCell | undefined): void {
  const normalized = defaultType(type);
  if (!cell || cell.state !== "value" && cell.state !== "empty") {
    writer.u16(0);
    return;
  }
  const lexical = cell.lexical || "";
  switch (normalized) {
    case "STRING":
    case "CHAR":
    case "UNDEFINED":
    case "DATASET":
    case "INVALID":
      writer.u16(21);
      writeLengthBytes(writer, UTF8_ENCODER.encode(lexical));
      return;
    case "SHORT":
    case "USHORT":
    case "INT":
    case "UINT":
    case "BOOLEAN":
      writer.u16(3);
      writer.i32(binaryInteger(lexical));
      return;
    case "LONG":
    case "ULONG":
    case "DECIMAL":
    case "BIGDECIMAL":
      writer.u16(40);
      writeLengthBytes(writer, UTF8_ENCODER.encode(lexical));
      return;
    case "FLOAT":
    case "DOUBLE": {
      const number = Number(lexical.trim());
      if (Number.isNaN(number) && lexical.trim() !== "NaN") throw new WireCodecError("invalid-value", `invalid PlatformBinary number ${lexical}`, "value");
      writer.u16(4);
      writer.f64(number);
      return;
    }
    case "DATE":
    case "TIME":
    case "DATETIME":
      writer.u16(41);
      writer.f64(epoch(lexical, normalized));
      return;
    case "BLOB":
    case "FILE": {
      writer.u16(26);
      const binary = atob(lexical);
      const blob = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) blob[index] = binary.charCodeAt(index);
      writeLengthBytes(writer, blob);
      return;
    }
    case "NULL":
      writer.u16(0);
      return;
    default:
      throw new WireCodecError("invalid-value", `unsupported PlatformBinary type ${type}`, "value");
  }
}

function writeDataset(writer: BinaryWriter, dataset: CanonicalDataset): void {
  const header = new BinaryWriter();
  const alias = typeof dataset.wire?.alias === "string" && dataset.wire.alias ? dataset.wire.alias : dataset.id;
  header.shortString(alias);
  const constants = new BinaryWriter();
  constants.u16(dataset.constColumns.length);
  for (let index = 0; index < dataset.constColumns.length; index++) {
    const column = dataset.constColumns[index];
    constants.shortString(column.id);
    // Constant values stay as given in the text formats; PlatformBinary
    // writes them converted to the column type.
    writeTypedValue(constants, column.type, constCell(column.type, column.value));
  }
  const constantBytes = constants.result();
  header.u16(VARIABLE_MARK);
  header.u16(VERSION);
  header.length(constantBytes.length);
  header.write(constantBytes);
  header.u16(dataset.columns.length);
  for (let index = 0; index < dataset.columns.length; index++) {
    const column = dataset.columns[index];
    header.shortString(column.id);
    header.u16(columnCode(column.type));
    header.u16(Number(column.size || wireSize(column.type)) & 0xffff);
    const sum = (column.prop || "").toUpperCase() === "SUM";
    header.u16(sum ? 0x6000 : 1);
    if (sum) header.shortString(column.sumtext || "");
  }
  const headerBytes = header.result();
  writer.u16(DATASET_MARK);
  writer.u16(VERSION);
  writer.length(headerBytes.length);
  writer.write(headerBytes);
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
    const row = dataset.rows[rowIndex];
    const body = new BinaryWriter();
    body.u16(rowCode(row.type));
    body.u16(dataset.columns.length);
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      writeTypedValue(body, column.type, row.values[column.id]);
    }
    if (row.type === "U") {
      body.u16(row.orgRow ? dataset.columns.length : 0);
      if (row.orgRow) {
        for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
          const column = dataset.columns[columnIndex];
          writeTypedValue(body, column.type, row.orgRow.values[column.id]);
        }
      }
    }
    const bytes = body.result();
    writer.length(bytes.length);
    writer.write(bytes);
  }
  writer.u32(0);
}

/** Writes PlatformBinary as the original drivers do, byte for byte. */
export function encodeBinaryWire(source: CanonicalValue, _profile: BinaryProfile): Uint8Array {
  validateCanonical(source);
  if (!source.parameters.length && !source.datasets.length) return new Uint8Array();
  const value = normalizeForEncode(source);
  const writer = new BinaryWriter();
  if (value.parameters.length) {
    const block = new BinaryWriter();
    block.u16(value.parameters.length);
    for (let index = 0; index < value.parameters.length; index++) {
      const parameter = value.parameters[index];
      block.shortString(parameter.id);
      writeTypedValue(block, parameter.type, primitiveNullAsZero(parameter.type, parameter));
    }
    const bytes = block.result();
    writer.u16(VARIABLE_MARK);
    writer.u16(VERSION);
    writer.length(bytes.length);
    writer.write(bytes);
  }
  for (let index = 0; index < value.datasets.length; index++) writeDataset(writer, value.datasets[index]);
  return writer.result();
}
