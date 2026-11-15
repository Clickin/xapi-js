import { decodeTypedCell, defaultType, emptyValue, finishDecodedValue, isKnownType, normalizeForEncode, textBlobCell, validateCanonical, wireScalar, wireSize, wireType } from "./wire-common";
import type { CanonicalCell, CanonicalColumn, CanonicalDataset, CanonicalRowType, CanonicalValue, WireCodecOptions } from "./wire-types";
import { WireCodecError } from "./wire-types";

type JsonNumber = { readonly number: string };
type JsonValue = string | boolean | null | JsonNumber | JsonValue[] | JsonObject;
interface JsonObject { [key: string]: JsonValue }

class LexicalJsonParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): JsonValue {
    const value = this.readValue();
    this.skipWhitespace();
    if (this.position !== this.source.length) throw new Error("multiple JSON values");
    return value;
  }
  private skipWhitespace(): void {
    while (this.position < this.source.length) {
      const code = this.source.charCodeAt(this.position);
      if (code !== 9 && code !== 10 && code !== 13 && code !== 32) return;
      this.position++;
    }
  }
  private readNumber(): JsonNumber {
    const start = this.position;
    if (this.source.charCodeAt(this.position) === 45) this.position++;
    const integer = this.source.charCodeAt(this.position);
    if (integer === 48) this.position++;
    else {
      if (integer < 49 || integer > 57) throw new Error(`invalid JSON value at byte ${start}`);
      do this.position++; while (this.source.charCodeAt(this.position) >= 48 && this.source.charCodeAt(this.position) <= 57);
    }
    if (this.source.charCodeAt(this.position) === 46) {
      this.position++;
      const decimal = this.source.charCodeAt(this.position);
      if (decimal < 48 || decimal > 57) throw new Error(`invalid JSON value at byte ${start}`);
      do this.position++; while (this.source.charCodeAt(this.position) >= 48 && this.source.charCodeAt(this.position) <= 57);
    }
    const exponent = this.source.charCodeAt(this.position);
    if (exponent === 69 || exponent === 101) {
      this.position++;
      const sign = this.source.charCodeAt(this.position);
      if (sign === 43 || sign === 45) this.position++;
      const digit = this.source.charCodeAt(this.position);
      if (digit < 48 || digit > 57) throw new Error(`invalid JSON value at byte ${start}`);
      do this.position++; while (this.source.charCodeAt(this.position) >= 48 && this.source.charCodeAt(this.position) <= 57);
    }
    return { number: this.source.slice(start, this.position) };
  }


  private readValue(): JsonValue {
    this.skipWhitespace();
    const token = this.source[this.position];
    if (token === "{") return this.readObject();
    if (token === "[") return this.readArray();
    if (token === '"') return this.readString();
    if (token === "t" && this.source.startsWith("true", this.position)) { this.position += 4; return true; }
    if (token === "f" && this.source.startsWith("false", this.position)) { this.position += 5; return false; }
    if (token === "n" && this.source.startsWith("null", this.position)) { this.position += 4; return null; }
    return this.readNumber();
  }

  private readObject(): JsonObject {
    this.position++;
    const value: JsonObject = Object.create(null) as JsonObject;
    this.skipWhitespace();
    if (this.source[this.position] === "}") { this.position++; return value; }
    while (true) {
      this.skipWhitespace();
      if (this.source[this.position] !== '"') throw new Error("invalid object key");
      const key = this.readString();
      this.skipWhitespace();
      if (this.source[this.position++] !== ":") throw new Error("object key must be followed by colon");
      if (Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`duplicate JSON key ${JSON.stringify(key)}`);
      value[key] = this.readValue();
      this.skipWhitespace();
      const separator = this.source[this.position++];
      if (separator === "}") return value;
      if (separator !== ",") throw new Error("invalid JSON object separator");
    }
  }

  private readArray(): JsonValue[] {
    this.position++;
    const value: JsonValue[] = [];
    this.skipWhitespace();
    if (this.source[this.position] === "]") { this.position++; return value; }
    while (true) {
      value.push(this.readValue());
      this.skipWhitespace();
      const separator = this.source[this.position++];
      if (separator === "]") return value;
      if (separator !== ",") throw new Error("invalid JSON array separator");
    }
  }
  private readString(): string {
    const start = this.position++;
    let escaped = false;
    while (this.position < this.source.length) {
      const character = this.source[this.position++];
      if (character === '"') {
        if (!escaped) return this.source.slice(start + 1, this.position - 1);
        const token = this.source.slice(start, this.position);
        try { return JSON.parse(token) as string; } catch { throw new Error("invalid JSON string"); }
      }
      if (character === "\\") {
        escaped = true;
        this.position++;
      } else if (character < " ") throw new Error("unescaped control character in JSON string");
    }
    throw new Error("unterminated JSON string");
  }
}

function asObject(value: JsonValue | undefined, name: string): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object" || "number" in value) throw new Error(`${name} must be an object`);
  return value;
}

function asArray(value: JsonValue | undefined, name: string): JsonValue[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function scalar(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "number" in value) return (value as JsonNumber).number;
  return "";
}

function requiredString(value: JsonValue | undefined, name: string, strict: boolean): string {
  const result = typeof value === "string" ? value : "";
  if (strict && !result) throw new Error(`${name} is required`);
  return result;
}

function rawCell(value: JsonValue | undefined, exists: boolean): CanonicalCell {
  if (!exists || value === null) return { state: "null", lexical: undefined };
  const lexical = scalar(value);
  return lexical === "" && typeof value === "string" ? { state: "empty", lexical: "" } : { state: "value", lexical };
}

/** A column value converted as the driver's typed setter does (BLOB text is base64-decoded). */
function typedCell(value: JsonValue | undefined, exists: boolean, type: string): CanonicalCell {
  return decodeTypedCell(rawCell(value, exists), type);
}

function decodedType(type: string): string {
  const normalized = (type || "STRING").toUpperCase();
  if (normalized === "FLOAT") return "DOUBLE";
  if (normalized === "DECIMAL" || !isKnownType(normalized)) return "UNDEFINED";
  return normalized;
}

function addJsonColumns(items: JsonValue[], dataset: CanonicalDataset, strict: boolean, constants: boolean): void {
  for (let index = 0; index < items.length; index++) {
    const item = asObject(items[index], "column");
    const id = requiredString(item.id, "column id", strict);
    // The driver reads size as a JSON string and rejects a number.
    if ("size" in item && typeof item.size !== "string") throw new Error(`column ${id} size must be a string`);
    const type = decodedType(typeof item.type === "string" ? item.type : "");
    if (constants) {
      // The JSON reader keeps the constant value string as it is.
      dataset.constColumns.push({ id, type, index: 0, value: rawCell(item.value, "value" in item) });
    } else {
      dataset.columns.push({ id, type, index: dataset.columns.length });
    }
  }
}

function parseColumns(raw: JsonValue, dataset: CanonicalDataset, strict: boolean): void {
  const info = asObject(raw, "ColumnInfo");
  if ("Column" in info) addJsonColumns(asArray(info.Column, "ColumnInfo.Column"), dataset, strict, false);
  if ("ConstColumn" in info) addJsonColumns(asArray(info.ConstColumn, "ColumnInfo.ConstColumn"), dataset, strict, true);
}

export function decodeJsonWire(source: string, options: WireCodecOptions = {}): CanonicalValue {
  const strict = options.strict ?? true;
  try {
    const parsed = new LexicalJsonParser(source).parse();
    const root = asObject(parsed, "root");
    const out = emptyValue();
    if ("version" in root && typeof root.version !== "string") throw new Error("version must be a string");
    out.wire = { version: "1.0" };
    if ("Parameters" in root) {
      const parameters = asArray(root.Parameters, "Parameters");
      for (let index = 0; index < parameters.length; index++) {
        const item = asObject(parameters[index], "Parameter");
        const id = requiredString(item.id, "Parameter.id", strict);
        let type = decodedType(typeof item.type === "string" ? item.type : "");
        const raw = rawCell(item.value, "value" in item);
        // Variable.set(String) gives an untyped variable the string type; a
        // null value is never set, so the type stays undefined.
        if (type === "UNDEFINED" && raw.state !== "null") type = "STRING";
        const cell = defaultType(type) === "BLOB" ? textBlobCell(raw) : decodeTypedCell(raw, type);
        out.parameters.push({ id, type, state: cell.state, lexical: cell.lexical });
      }
    }
    if ("Datasets" in root) {
      const datasets = asArray(root.Datasets, "Datasets");
      for (let datasetIndex = 0; datasetIndex < datasets.length; datasetIndex++) {
        const item = asObject(datasets[datasetIndex], "Dataset");
        const dataset: CanonicalDataset = {
          id: requiredString(item.id, "Dataset.id", strict),
          columns: [],
          constColumns: [],
          rows: [],
          saveType: undefined,
          wire: undefined,
        };
        if ("ColumnInfo" in item) parseColumns(item.ColumnInfo, dataset, strict);
        for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) dataset.constColumns[columnIndex].index = dataset.columns.length + columnIndex;
        if ("Rows" in item) {
          const rows = asArray(item.Rows, "Dataset.Rows");
          for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const sourceRow = asObject(rows[rowIndex], "Row");
            const rawType = "_RowType_" in sourceRow ? sourceRow._RowType_ : "N";
            if (typeof rawType !== "string") throw new Error("_RowType_ must be a string");
            if (!/^[NIUDO]$/.test(rawType)) {
              if (strict) throw new Error(`invalid _RowType_ ${JSON.stringify(rawType)}`);
              continue;
            }
            if (rawType === "O") {
              if (!dataset.rows.length || dataset.rows[dataset.rows.length - 1].type !== "U") {
                if (strict) throw new Error("orphan original row");
                continue;
              }
              {
                const originalValues: Record<string, CanonicalCell> = {};
                for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
                  const column = dataset.columns[columnIndex];
                  originalValues[column.id] = typedCell(sourceRow[column.id], column.id in sourceRow, column.type);
                }
                for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
                  const column = dataset.constColumns[columnIndex];
                  originalValues[column.id] = column.value || { state: "null", lexical: undefined };
                }
                dataset.rows[dataset.rows.length - 1].orgRow = { type: "O", orgRow: null, values: originalValues };
              }
              continue;
            }
            const values: Record<string, CanonicalCell> = {};
            for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
              const column = dataset.columns[columnIndex];
              values[column.id] = typedCell(sourceRow[column.id], column.id in sourceRow, column.type);
            }
            for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
              const column = dataset.constColumns[columnIndex];
              values[column.id] = column.value || { state: "null", lexical: undefined };
            }
            dataset.rows.push({ type: rawType as CanonicalRowType, orgRow: null, values });
          }
        }
        const constColumns = new Array(dataset.constColumns.length);
        for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
          const column = dataset.constColumns[columnIndex];
          constColumns[columnIndex] = { id: column.id, type: column.type, index: column.index, value: undefined, size: column.size, encoding: column.encoding };
        }
        dataset.constColumns = constColumns;
        out.datasets.push(dataset);
      }
    }
    validateCanonical(out);
    return finishDecodedValue(out);
  } catch (error) {
    if (error instanceof WireCodecError) throw error;
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

type JavaEntry = readonly [string, JavaValue];
type JavaValue = string | null | JavaObject | JavaValue[];
type JavaObject = { readonly entries: JavaEntry[] };

function javaHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * Escapes like json-simple's JSONValue.escape, which the Nexacro driver uses:
 * '/' is escaped, U+0000-U+001F, U+007F-U+009F and U+2000-U+20FF become
 * an upper-case \uXXXX, nothing else is.
 */
function jsonString(value: string): string {
  let out = '"';
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    const code = value.charCodeAt(index);
    switch (character) {
      case '"': out += '\\"'; break;
      case "\\": out += "\\\\"; break;
      case "\b": out += "\\b"; break;
      case "\f": out += "\\f"; break;
      case "\n": out += "\\n"; break;
      case "\r": out += "\\r"; break;
      case "\t": out += "\\t"; break;
      case "/": out += "\\/"; break;
      default:
        if (code <= 0x1f || code >= 0x7f && code <= 0x9f || code >= 0x2000 && code <= 0x20ff) out += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
        else out += character;
    }
  }
  return `${out}"`;
}

function javaObject(entries: JavaEntry[]): JavaObject {
  return { entries };
}

function serializeJava(value: JavaValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return jsonString(value);
  if (Array.isArray(value)) {
    let output = "[";
    for (let index = 0; index < value.length; index++) {
      if (index) output += ",";
      output += serializeJava(value[index]);
    }
    return output + "]";
  }
  let capacity = 16;
  while (value.entries.length > capacity * 0.75) capacity *= 2;
  const count = value.entries.length;
  const ordered = new Array<JavaEntry>(count);
  const buckets = new Uint32Array(count);
  const originalIndexes = new Uint32Array(count);
  for (let index = 0; index < count; index++) {
    const entry = value.entries[index];
    const bucket = javaHash(entry[0]) & (capacity - 1);
    let insertion = index;
    while (insertion > 0 && (buckets[insertion - 1] > bucket || buckets[insertion - 1] === bucket && originalIndexes[insertion - 1] > index)) {
      ordered[insertion] = ordered[insertion - 1];
      buckets[insertion] = buckets[insertion - 1];
      originalIndexes[insertion] = originalIndexes[insertion - 1];
      insertion--;
    }
    ordered[insertion] = entry;
    buckets[insertion] = bucket;
    originalIndexes[insertion] = index;
  }
  let output = "{";
  for (let index = 0; index < count; index++) {
    if (index) output += ",";
    const entry = ordered[index];
    output += `${jsonString(entry[0])}:${serializeJava(entry[1])}`;
  }
  return output + "}";
}

function columnObject(column: CanonicalColumn): JavaObject {
  const entries: JavaEntry[] = [["id", column.id], ["type", wireType(column.type)], ["size", column.size === undefined ? wireSize(column.type) : column.size]];
  if (column.prop) entries.push(["prop", column.prop]);
  if (column.sumtext) entries.push(["sumtext", column.sumtext]);
  return javaObject(entries);
}

function datasetObject(dataset: CanonicalDataset): JavaObject {
  const entries: JavaEntry[] = [["id", dataset.id]];
  const info: JavaEntry[] = [];
  if (dataset.constColumns.length) {
    const constants = new Array<JavaValue>(dataset.constColumns.length);
    for (let index = 0; index < dataset.constColumns.length; index++) {
      const column = dataset.constColumns[index];
      const values: JavaEntry[] = [["id", column.id], ["type", wireType(column.type)], ["size", column.size || wireSize(column.type)]];
      const cell = column.value;
      if (cell && (cell.state === "value" || cell.state === "empty")) values.push(["value", cell.lexical || ""]);
      else if (defaultType(column.type) === "BOOLEAN") values.push(["value", "0"]);
      constants[index] = javaObject(values);
    }
    info.push(["ConstColumn", constants]);
  }
  if (dataset.columns.length) {
    const columns = new Array<JavaValue>(dataset.columns.length);
    for (let index = 0; index < dataset.columns.length; index++) columns[index] = columnObject(dataset.columns[index]);
    info.push(["Column", columns]);
  }
  if (info.length) entries.push(["ColumnInfo", javaObject(info)]);
  const row = (type: string, cells: Record<string, CanonicalCell>, saved: boolean): JavaObject => {
    const values: JavaEntry[] = [["_RowType_", type]];
    for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
      const column = dataset.columns[columnIndex];
      const cell = cells[column.id];
      // A saved row writes only the cells it has.
      if (!cell && saved) continue;
      const value = wireScalar(column.type, cell || { state: "missing" });
      if (value !== undefined) values.push([column.id, value]);
    }
    return javaObject(values);
  };
  if (dataset.rows.length) {
    const rows: JavaValue[] = [];
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const current = dataset.rows[rowIndex];
      rows.push(row(current.type, current.values, false));
      if (current.orgRow) rows.push(row("O", current.orgRow.values, true));
    }
    entries.push(["Rows", rows]);
  }
  return javaObject(entries);
}

/** Writes Nexacro JSON as the original driver does, byte for byte. */
export function encodeJsonWire(source: CanonicalValue, _options: WireCodecOptions = {}): string {
  validateCanonical(source);
  const value = normalizeForEncode(source);
  const version = typeof value.wire?.version === "string" ? value.wire.version : "1.0";
  const entries: JavaEntry[] = [["version", version]];
  if (value.parameters.length) {
    const parameters = new Array<JavaValue>(value.parameters.length);
    for (let index = 0; index < value.parameters.length; index++) {
      const parameter = value.parameters[index];
      const item: JavaEntry[] = [["id", parameter.id], ["type", wireType(parameter.type)]];
      const cell = wireScalar(parameter.type, parameter);
      if (cell !== undefined) item.push(["value", cell]);
      parameters[index] = javaObject(item);
    }
    entries.push(["Parameters", parameters]);
  }
  if (value.datasets.length) {
    const datasets = new Array<JavaValue>(value.datasets.length);
    for (let index = 0; index < value.datasets.length; index++) datasets[index] = datasetObject(value.datasets[index]);
    entries.push(["Datasets", datasets]);
  }
  return serializeJava(javaObject(entries));
}
