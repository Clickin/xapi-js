import { defaultType, emptyValue, isKnownType, normalizeForEncode, validateCanonical, wireSize, wireType } from "./wire-common";
import type { CanonicalCell, CanonicalColumn, CanonicalDataset, CanonicalRowType, CanonicalValue, WireCodecOptions } from "./wire-types";
import { WireCodecError } from "./wire-types";

type JsonNumber = { readonly number: string };
type JsonValue = string | boolean | null | JsonNumber | JsonValue[] | JsonObject;
interface JsonObject { [key: string]: JsonValue }
const UTF8_ENCODER = new TextEncoder();

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

function typedCell(value: JsonValue | undefined, exists: boolean, type: string): CanonicalCell {
  const cell = rawCell(value, exists);
  if (cell.state !== "value" || defaultType(type) !== "BLOB") return cell;
  const bytes = UTF8_ENCODER.encode(cell.lexical);
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return { state: "value", lexical: btoa(binary) };
}

function inferType(value: JsonValue | undefined): string {
  if (value && typeof value === "object" && "number" in value) return /[.eE]/.test((value as JsonNumber).number) ? "FLOAT" : "INT";
  return "STRING";
}
function decodedType(type: string): string {
  const normalized = defaultType(type);
  if (normalized === "FLOAT") return "DOUBLE";
  if (normalized === "DECIMAL" || !isKnownType(normalized)) return "UNDEFINED";
  return normalized;
}

function addJsonColumns(items: JsonValue[], dataset: CanonicalDataset, strict: boolean, constants: boolean): void {
  for (let index = 0; index < items.length; index++) {
    const item = asObject(items[index], "column");
    const id = requiredString(item.id, "column id", strict);
    const sourceType = typeof item.type === "string" ? item.type : constants ? inferType(item.value) : "STRING";
    const type = decodedType(sourceType);
    if (constants) {
      dataset.constColumns.push({
        id,
        type,
        index: 0,
        value: typedCell(item.value, "value" in item, type),
        size: undefined,
        encoding: undefined,
      });
    } else {
      dataset.columns.push({
        id,
        type,
        index: dataset.columns.length,
        size: undefined,
        encoding: undefined,
        prop: undefined,
        sumtext: undefined,
      });
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
    const version = typeof root.version === "string" ? root.version : "1.0";
    out.wire = { version };
    if ("Parameters" in root) {
      const parameters = asArray(root.Parameters, "Parameters");
      for (let index = 0; index < parameters.length; index++) {
        const item = asObject(parameters[index], "Parameter");
        const id = requiredString(item.id, "Parameter.id", strict);
        const sourceType = typeof item.type === "string" ? item.type : inferType(item.value);
        const type = decodedType(sourceType);
        const cell = typedCell(item.value, "value" in item, type);
        out.parameters.push({ id, type, state: cell.state, lexical: cell.lexical, index: undefined, wire: undefined });
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
              if (!dataset.rows.length) throw new Error("orphan original row");
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
    return out;
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

function javaObject(entries: JavaEntry[]): JavaObject {
  return { entries };
}

function serializeJava(value: JavaValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value).replace(/\//g, "\\/");
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
    output += `${JSON.stringify(entry[0])}:${serializeJava(entry[1])}`;
  }
  return output + "}";
}

function columnObject(column: CanonicalColumn): JavaObject {
  const entries: JavaEntry[] = [["id", column.id], ["type", wireType(column.type)], ["size", wireSize(column.type)]];
  if (column.prop) entries.push(["prop", column.prop]);
  if (column.sumtext) entries.push(["sumtext", column.sumtext]);
  return javaObject(entries);
}

function jsonCell(cell: CanonicalCell): string | undefined {
  if (cell.state !== "value") return undefined;
  return cell.lexical || "";
}

function datasetObject(dataset: CanonicalDataset): JavaObject {
  const entries: JavaEntry[] = [["id", dataset.id]];
  const info: JavaEntry[] = [];
  if (dataset.constColumns.length) {
    const constants = new Array<JavaValue>(dataset.constColumns.length);
    for (let index = 0; index < dataset.constColumns.length; index++) {
      const column = dataset.constColumns[index];
      const values: JavaEntry[] = [["id", column.id], ["type", wireType(column.type)], ["size", wireSize(column.type)]];
      const value = column.value && jsonCell(column.value);
      if (value !== undefined) values.push(["value", value]);
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
  if (dataset.rows.length) {
    const rows: JavaValue[] = [];
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      if (row.type === "O") continue;
      const values: JavaEntry[] = [];
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
        const column = dataset.columns[columnIndex];
        const cell = row.values[column.id];
        const value = cell && jsonCell(cell);
        if (value !== undefined) values.push([column.id, value]);
        else if (defaultType(column.type) === "BOOLEAN") values.push([column.id, "0"]);
      }
      values.push(["_RowType_", "N"]);
      rows.push(javaObject(values));
    }
    entries.push(["Rows", rows]);
  }
  return javaObject(entries);
}
export function encodeJsonWire(source: CanonicalValue): string {
  validateCanonical(source);
  const value = normalizeForEncode(source);
  const entries: JavaEntry[] = [["version", "1.0"]];
  if (value.parameters.length) {
    const parameters = new Array<JavaValue>(value.parameters.length);
    for (let index = 0; index < value.parameters.length; index++) {
      const parameter = value.parameters[index];
      const item: JavaEntry[] = [["id", parameter.id], ["type", wireType(parameter.type)]];
      const cell = jsonCell(parameter);
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
