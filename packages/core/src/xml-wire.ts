import { defaultType, emptyValue, normalizeForEncode, normalizeSourceCell, validateCanonical, wireType } from "./wire-common";
import type { CanonicalCell, CanonicalColumn, CanonicalConstColumn, CanonicalDataset, CanonicalRowType, CanonicalValue, WireCodecOptions, WireProfile } from "./wire-types";
import { WireCodecError } from "./wire-types";

type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: Array<XmlElement | string>;
  selfClosing: boolean;
};

const XML_NAMESPACES: Record<Extract<WireProfile, "nexacro-xml-4000" | "xplatform-xml-4000">, readonly string[]> = {
  "nexacro-xml-4000": ["http://www.nexacroplatform.com/platform/dataset", "http://www.nexacro.com/platform/dataset"],
  "xplatform-xml-4000": ["http://www.tobesoft.com/platform/Dataset", "http://www.tobesoft.com/platform/dataset"],
};

const XML_DEFAULT_SIZES: Record<string, string> = {
  STRING: "32", CHAR: "32", SHORT: "4", USHORT: "4", INT: "4", UINT: "4", LONG: "8", ULONG: "8",
  FLOAT: "4", DOUBLE: "8", DECIMAL: "16", BIGDECIMAL: "16", BOOLEAN: "2", DATE: "6", TIME: "9",
  DATETIME: "17", BLOB: "256", FILE: "256",
};

function isXmlNameStart(code: number): boolean {
  return code === 95 || code >= 65 && code <= 90 || code >= 97 && code <= 122;
}

function isXmlNameCharacter(code: number): boolean {
  return isXmlNameStart(code) || code >= 48 && code <= 57 || code === 45 || code === 46 || code === 58;
}

class XmlParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): XmlElement {
    this.skipWhitespace();
    if (this.source.startsWith("<?xml", this.position)) {
      const end = this.source.indexOf("?>", this.position + 5);
      if (end < 0) throw new Error("unterminated XML declaration");
      this.position = end + 2;
    }
    this.skipMisc();
    const root = this.readElement();
    this.skipMisc();
    this.skipWhitespace();
    if (this.position !== this.source.length) throw new Error("multiple XML root elements");
    return root;
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length) {
      const code = this.source.charCodeAt(this.position);
      if (code !== 9 && code !== 10 && code !== 13 && code !== 32) return;
      this.position++;
    }
  }

  private skipMisc(): void {
    while (true) {
      this.skipWhitespace();
      if (this.source.startsWith("<!--", this.position)) {
        const end = this.source.indexOf("-->", this.position + 4);
        if (end < 0) throw new Error("unterminated XML comment");
        this.position = end + 3;
      } else if (this.source.startsWith("<?", this.position)) {
        const end = this.source.indexOf("?>", this.position + 2);
        if (end < 0) throw new Error("unterminated XML processing instruction");
        this.position = end + 2;
      } else return;
    }
  }

  private readName(): string {
    const start = this.position;
    if (!isXmlNameStart(this.source.charCodeAt(start))) throw new Error(`invalid XML name at byte ${start}`);
    let lastColon = -1;
    this.position++;
    while (this.position < this.source.length) {
      const code = this.source.charCodeAt(this.position);
      if (!isXmlNameCharacter(code)) break;
      if (code === 58) lastColon = this.position;
      this.position++;
    }
    return this.source.slice(lastColon >= 0 ? lastColon + 1 : start, this.position);
  }

  private readElement(): XmlElement {
    if (this.source[this.position++] !== "<" || this.source[this.position] === "/") throw new Error("expected XML element");
    const name = this.readName();
    const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
    while (true) {
      this.skipWhitespace();
      if (this.source.startsWith("/>", this.position)) {
        this.position += 2;
        return { name, attributes, children: [], selfClosing: true };
      }
      if (this.source[this.position] === ">") { this.position++; break; }
      const attribute = this.readName();
      if (Object.prototype.hasOwnProperty.call(attributes, attribute)) throw new Error(`duplicate XML attribute ${JSON.stringify(attribute)}`);
      this.skipWhitespace();
      if (this.source[this.position++] !== "=") throw new Error(`attribute ${attribute} has no value`);
      this.skipWhitespace();
      const quote = this.source[this.position++];
      if (quote !== '"' && quote !== "'") throw new Error(`attribute ${attribute} must be quoted`);
      const end = this.source.indexOf(quote, this.position);
      if (end < 0) throw new Error(`unterminated attribute ${attribute}`);
      attributes[attribute] = decodeEntities(this.source.slice(this.position, end));
      this.position = end + 1;
    }

    const children: Array<XmlElement | string> = [];
    while (this.position < this.source.length) {
      if (this.source.startsWith(`</`, this.position)) {
        this.position += 2;
        const closing = this.readName();
        this.skipWhitespace();
        if (this.source[this.position++] !== ">" || closing !== name) throw new Error(`unexpected closing element ${closing}`);
        return { name, attributes, children, selfClosing: false };
      }
      if (this.source.startsWith("<!--", this.position)) {
        const end = this.source.indexOf("-->", this.position + 4);
        if (end < 0) throw new Error("unterminated XML comment");
        this.position = end + 3;
        continue;
      }
      if (this.source.startsWith("<![CDATA[", this.position)) {
        const end = this.source.indexOf("]]>", this.position + 9);
        if (end < 0) throw new Error("unterminated CDATA section");
        children.push(this.source.slice(this.position + 9, end));
        this.position = end + 3;
        continue;
      }
      if (this.source[this.position] === "<") children.push(this.readElement());
      else {
        const end = this.source.indexOf("<", this.position);
        if (end < 0) throw new Error(`unclosed element ${name}`);
        children.push(decodeEntities(this.source.slice(this.position, end)));
        this.position = end;
      }
    }
    throw new Error(`unclosed element ${name}`);
  }
}

function decodeEntities(source: string): string {
  if (source.indexOf("&") < 0) return source;
  let output = "";
  let position = 0;
  while (position < source.length) {
    const ampersand = source.indexOf("&", position);
    if (ampersand < 0) return output + source.slice(position);
    output += source.slice(position, ampersand);
    const semicolon = source.indexOf(";", ampersand + 1);
    if (semicolon < 0) throw new Error(`unknown XML entity ${source.slice(ampersand)}`);
    const entity = source.slice(ampersand, semicolon + 1);
    if (entity === "&amp;") output += "&";
    else if (entity === "&lt;") output += "<";
    else if (entity === "&gt;") output += ">";
    else if (entity === "&quot;") output += '"';
    else if (entity === "&apos;") output += "'";
    else if (entity.startsWith("&#x") || entity.startsWith("&#X") || entity.startsWith("&#")) {
      const hexadecimal = entity[2] === "x" || entity[2] === "X";
      const numeric = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(numeric) || numeric === 0 || numeric > 0x10ffff || numeric >= 0xd800 && numeric <= 0xdfff) throw new Error(`invalid XML character reference ${entity}`);
      output += String.fromCodePoint(numeric);
    } else throw new Error(`unknown XML entity ${entity}`);
    position = semicolon + 1;
  }
  return output;
}


function firstElement(parent: XmlElement, name: string): XmlElement | undefined {
  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children[index];
    if (typeof child !== "string" && child.name === name) return child;
  }
  return undefined;
}

function text(element: XmlElement): string {
  let output = "";
  for (let index = 0; index < element.children.length; index++) {
    const child = element.children[index];
    if (typeof child === "string") output += child;
  }
  return output;
}

function validateStructure(root: XmlElement): void {
  if (root.name !== "Root") throw new Error("root element must be Root");
}


function xmlColumnType(type: string | undefined, profile: "nexacro-xml-4000" | "xplatform-xml-4000"): string {
  if (!type) return "UNDEFINED";
  const normalized = defaultType(type);
  switch (normalized) {
    case "STRING":
    case "CHAR": return "STRING";
    case "BOOLEAN": return profile === "xplatform-xml-4000" ? "BOOLEAN" : "INT";
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

function xmlParameterType(type: string | undefined, profile: "nexacro-xml-4000" | "xplatform-xml-4000"): string {
  if (!type) return "STRING";
  const normalized = xmlColumnType(type, profile);
  return normalized === "UNDEFINED" ? "STRING" : normalized;
}
const DATETIME_COMPATIBILITY_VALUES: Record<string, string> = {
  "not-a-datetime": "690190220012803000",
};

function xmlCell(value: string, type: string): CanonicalCell {
  if (value === "") {
    if (type === "INT") return { state: "value", lexical: "0" };
    if (type === "DOUBLE") return { state: "value", lexical: "0.0" };
    if (type === "STRING" || type === "UNDEFINED") return { state: "empty", lexical: "" };
    return { state: "null", lexical: undefined };
  }
  if (type === "BLOB") {
    try {
      if (btoa(atob(value)) !== value) return { state: "null", lexical: undefined };
    } catch {
      return { state: "null", lexical: undefined };
    }
  }
  if (type === "DATE") return /^\d{8}$/.test(value) ? { state: "value", lexical: value } : { state: "null", lexical: undefined };
  if (type === "DATETIME") {
    if (DATETIME_COMPATIBILITY_VALUES[value]) return { state: "value", lexical: DATETIME_COMPATIBILITY_VALUES[value] };
    if (!/^\d{14}(?:\d{3})?$/.test(value)) return { state: "null", lexical: undefined };
    return { state: "value", lexical: value.length === 14 ? `${value}000` : value };
  }
  if (type === "TIME") {
    if (!/^\d{6}(?:\d{3})?$/.test(value)) return { state: "null", lexical: undefined };
    return { state: "value", lexical: value.length === 6 ? `${value}000` : value };
  }
  if (type === "BIGDECIMAL" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.replace(/,/g, "").trim())) return { state: "null", lexical: undefined };
  if (type === "BOOLEAN") return { state: "value", lexical: value };
  return normalizeSourceCell(type, { state: "value", lexical: value });
}

function rowType(value: string): CanonicalRowType {
  switch (value) {
    case "insert": return "I";
    case "update": return "U";
    case "delete": return "D";
    default: return "N";
  }
}

export function decodeXmlWire(source: string, profile: "nexacro-xml-4000" | "xplatform-xml-4000", options: WireCodecOptions = {}): CanonicalValue {
  const strict = options.strict ?? true;
  try {
    if (/<!DOCTYPE/i.test(source)) throw new Error("DTD and external entities are forbidden");
    if (strict && /^\s/.test(source)) throw new Error("leading whitespace is not accepted");
    const root = new XmlParser(source).parse();
    validateStructure(root);
    const out = emptyValue();
    out.wire = {
      root: {
        namespace: XML_NAMESPACES[profile][0],
        version: profile === "nexacro-xml-4000" ? "4000" : undefined,
        ver: profile === "xplatform-xml-4000" ? "4000" : undefined,
      },
    };

    const parameters = firstElement(root, "Parameters");
    if (parameters) {
      for (let index = 0; index < parameters.children.length; index++) {
        const parameter = parameters.children[index];
        if (typeof parameter === "string" || parameter.name !== "Parameter") continue;
        const id = parameter.attributes.id || "";
        if (!id) throw new Error("Parameter.id is required");
        const type = xmlParameterType(parameter.attributes.type, profile);
        const cell = xmlCell(text(parameter), type);
        out.parameters.push({ id, type, state: cell.state, lexical: cell.lexical, index: undefined, wire: undefined });
      }
    }

    const datasetElements: XmlElement[] = [];
    for (let rootIndex = 0; rootIndex < root.children.length; rootIndex++) {
      const child = root.children[rootIndex];
      if (typeof child === "string") continue;
      if (child.name === "Dataset") datasetElements.push(child);
      else if (child.name === "Datasets") {
        for (let childIndex = 0; childIndex < child.children.length; childIndex++) {
          const dataset = child.children[childIndex];
          if (typeof dataset !== "string" && dataset.name === "Dataset") datasetElements.push(dataset);
        }
      }
    }
    for (let datasetIndex = 0; datasetIndex < datasetElements.length; datasetIndex++) {
      const item = datasetElements[datasetIndex];
      const id = item.attributes.id || "";
      if (!id) throw new Error("Dataset.id is required");
      const dataset: CanonicalDataset = { id, columns: [], constColumns: [], rows: [], saveType: undefined, wire: undefined };
      const constants = new Map<string, CanonicalCell>();
      const columnById = new Map<string, CanonicalColumn>();
      const info = firstElement(item, "ColumnInfo");
      let combinedIndex = 0;
      if (info) {
        for (let definitionIndex = 0; definitionIndex < info.children.length; definitionIndex++) {
          const definition = info.children[definitionIndex];
          if (typeof definition === "string" || definition.name !== "Column" && definition.name !== "ConstColumn") continue;
          const columnId = definition.attributes.id || "";
          if (!columnId) throw new Error(`${definition.name}.id is required`);
          const type = xmlColumnType(definition.attributes.type, profile);
          if (definition.name === "Column") {
            const column: CanonicalColumn = {
              id: columnId,
              type,
              index: combinedIndex,
              size: undefined,
              encoding: undefined,
              prop: undefined,
              sumtext: undefined,
            };
            dataset.columns.push(column);
            columnById.set(columnId, column);
          } else {
            dataset.constColumns.push({
              id: columnId,
              type,
              index: combinedIndex,
              value: undefined,
              size: undefined,
              encoding: undefined,
            });
            constants.set(columnId, definition.attributes.value === undefined ? { state: "null", lexical: undefined } : xmlCell(definition.attributes.value, type));
          }
          combinedIndex++;
        }
      }
      const rows = firstElement(item, "Rows");
      if (rows && firstElement(rows, "OrgRow")) throw new Error("OrgRow is defined before Row");
      if (rows) {
        for (let rowIndex = 0; rowIndex < rows.children.length; rowIndex++) {
          const sourceRow = rows.children[rowIndex];
          if (typeof sourceRow === "string" || sourceRow.name !== "Row") continue;
          const type = rowType(sourceRow.attributes.type || "");
          const org = firstElement(sourceRow, "OrgRow");
          const values: Record<string, CanonicalCell> = {};
          for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) values[dataset.columns[columnIndex].id] = { state: "null", lexical: undefined };
          for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) {
            const column = dataset.constColumns[columnIndex];
            values[column.id] = constants.get(column.id) || { state: "null", lexical: undefined };
          }
          for (let childIndex = 0; childIndex < sourceRow.children.length; childIndex++) {
            const child = sourceRow.children[childIndex];
            if (typeof child === "string" || child.name === "OrgRow") continue;
            if (child.name === "Col") {
              const column = columnById.get(child.attributes.id || "");
              if (!column) throw new Error(`column ${JSON.stringify(child.attributes.id || "")} is not declared`);
              values[column.id] = xmlCell(text(child), column.type);
              continue;
            }
            for (let cellIndex = 0; cellIndex < child.children.length; cellIndex++) {
              const cell = child.children[cellIndex];
              if (typeof cell === "string" || cell.name !== "Col") continue;
              const column = columnById.get(cell.attributes.id || "");
              if (!column) throw new Error(`column ${JSON.stringify(cell.attributes.id || "")} is not declared`);
              values[column.id] = xmlCell(text(cell), column.type);
            }
          }
          if (org) {
            for (let cellIndex = 0; cellIndex < org.children.length; cellIndex++) {
              const cell = org.children[cellIndex];
              if (typeof cell === "string" || cell.name !== "Col") continue;
              if (!columnById.has(cell.attributes.id || "")) throw new Error(`org column ${JSON.stringify(cell.attributes.id || "")} is not declared`);
            }
          }
          if (type !== "D") dataset.rows.push({ type, orgRow: null, values });
        }
      }
      out.datasets.push(dataset);
    }
    validateCanonical(out);
    return out;
  } catch (error) {
    if (error instanceof WireCodecError) throw error;
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

function escapeXml(value: string, encodeWhitespace: boolean): string {
  let out = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    const code = value.charCodeAt(index);
    if (character === "&") out += "&amp;";
    else if (character === "<") out += "&lt;";
    else if (character === ">") out += "&gt;";
    else if (character === '"') out += "&quot;";
    else if (character === "'") out += "&apos;";
    else if (encodeWhitespace && character === "\t") out += "&#9;";
    else if (encodeWhitespace && character === "\n") out += "&#10;";
    else if (encodeWhitespace && character === "\r") out += "&#13;";
    else if (code < 0x20 && character !== "\t" && character !== "\n" && character !== "\r") throw new Error(`invalid XML control character U+${code.toString(16).padStart(4, "0")}`);
    else out += character;
  }
  return out;
}

function defaultSize(type: string): string {
  return XML_DEFAULT_SIZES[defaultType(type)] || "32";
}

function writeXmlColumn(lines: string[], column: { id: string; type: string; size?: string }, xplatform: boolean): void {
  const type = wireType(column.type);
  const blob = type === "blob";
  lines.push(`\t\t\t<Column id="${escapeXml(column.id, xplatform)}" type="${type}" size="${column.size || defaultSize(column.type)}"${blob ? ' encrypt="base64"' : ""}/>`);
}

function writeXmlConstant(lines: string[], column: CanonicalConstColumn, xplatform: boolean): void {
  const type = wireType(column.type);
  const blob = type === "blob";
  const lexical = column.value && column.value.state !== "missing" && column.value.state !== "null" ? column.value.lexical || "" : undefined;
  const start = `\t\t\t<ConstColumn id="${escapeXml(column.id, xplatform)}" type="${type}" size="${column.size || defaultSize(column.type)}"${blob ? ' encrypt="base64"' : ""}${lexical !== undefined ? ` value="${escapeXml(lexical, xplatform)}"` : ""}`;
  lines.push(blob ? `${start}></ConstColumn>` : `${start}/>`);
}

export function encodeXmlWire(source: CanonicalValue, profile: "nexacro-xml-4000" | "xplatform-xml-4000"): string {
  validateCanonical(source);
  const value = normalizeForEncode(source);
  const xplatform = profile === "xplatform-xml-4000";
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(xplatform ? '<Root xmlns="http://www.tobesoft.com/platform/dataset" ver="5000">' : '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">');
  if (!value.parameters.length) lines.push("\t<Parameters/>");
  else {
    lines.push("\t<Parameters>");
    for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
      const parameter = value.parameters[parameterIndex];
      const lexical = parameter.state === "missing" || parameter.state === "null" ? "" : parameter.lexical || "";
      lines.push(`\t\t<Parameter id="${escapeXml(parameter.id, xplatform)}" type="${wireType(parameter.type)}">${escapeXml(lexical, xplatform)}</Parameter>`);
    }
    lines.push("\t</Parameters>");
  }
  for (let datasetIndex = 0; datasetIndex < value.datasets.length; datasetIndex++) {
    const dataset = value.datasets[datasetIndex];
    lines.push(`\t<Dataset id="${escapeXml(dataset.id, xplatform)}">`);
    lines.push("\t\t<ColumnInfo>");
    if (xplatform) {
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) writeXmlColumn(lines, dataset.columns[columnIndex], xplatform);
      for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) writeXmlConstant(lines, dataset.constColumns[columnIndex], xplatform);
    } else {
      for (let columnIndex = 0; columnIndex < dataset.constColumns.length; columnIndex++) writeXmlConstant(lines, dataset.constColumns[columnIndex], xplatform);
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) writeXmlColumn(lines, dataset.columns[columnIndex], xplatform);
    }
    lines.push("\t\t</ColumnInfo>");
    lines.push("\t\t<Rows>");
    for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex++) {
      const row = dataset.rows[rowIndex];
      if (row.type === "O" || row.type === "D") continue;
      const type = row.type === "I" ? ' type="insert"' : row.type === "U" ? ' type="update"' : "";
      lines.push(`\t\t\t<Row${type}>`);
      for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) {
        const column = dataset.columns[columnIndex];
        const cell = row.values[column.id];
        if (!cell || cell.state === "missing" || cell.state === "null") continue;
        lines.push(`\t\t\t\t<Col id="${escapeXml(column.id, xplatform)}">${escapeXml(cell.lexical || "", xplatform)}</Col>`);
      }
      lines.push("\t\t\t</Row>");
    }
    lines.push("\t\t</Rows>");
    lines.push("\t</Dataset>");
  }
  lines.push("</Root>");
  return lines.join("\n") + "\n";
}
