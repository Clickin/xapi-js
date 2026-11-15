import { decodeTypedCell, defaultType, emptyValue, finishDecodedValue, isKnownType, normalizeForEncode, textBlobCell, validateCanonical, wireScalar, wireSize, wireType } from "./wire-common";
import type { CanonicalCell, CanonicalColumn, CanonicalConstColumn, CanonicalDataset, CanonicalRow, CanonicalRowType, CanonicalValue, WireCodecOptions, WireProfile } from "./wire-types";
import { WireCodecError } from "./wire-types";

type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: Array<XmlElement | string>;
  selfClosing: boolean;
};

const XML_NAMESPACES: Record<Extract<WireProfile, "nexacro-xml-4000" | "xplatform-xml-4000" | "xplatform-xml-5000">, readonly string[]> = {
  "nexacro-xml-4000": ["http://www.nexacroplatform.com/platform/dataset", "http://www.nexacro.com/platform/dataset"],
  "xplatform-xml-4000": ["http://www.tobesoft.com/platform/Dataset", "http://www.tobesoft.com/platform/dataset"],
  "xplatform-xml-5000": ["http://www.tobesoft.com/platform/Dataset", "http://www.tobesoft.com/platform/dataset"],
};

function isXmlNameStart(code: number): boolean {
  return code === 95 || code >= 65 && code <= 90 || code >= 97 && code <= 122;
}

function isXmlNameCharacter(code: number): boolean {
  return isXmlNameStart(code) || code >= 48 && code <= 57 || code === 45 || code === 46 || code === 58;
}

class XmlParser {
  private position = 0;

  private lastPrefix = "";
  private readonly source: string;

  constructor(source: string) {
    // Line endings are normalized before entities are read, so &#13; stays a CR.
    this.source = source.indexOf("\r") < 0 ? source : source.replace(/\r\n?/g, "\n");
  }

  parse(): XmlElement {
    this.skipWhitespace();
    if (/^<\?xml[\t\n ]/.test(this.source.slice(this.position, this.position + 6))) {
      if (this.position > 0) throw new Error("XML declaration must be at the start of the document");
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
    this.lastPrefix = lastColon >= 0 ? this.source.slice(start, lastColon) : "";
    return this.source.slice(lastColon >= 0 ? lastColon + 1 : start, this.position);
  }

  private readElement(inherited?: ReadonlySet<string>): XmlElement {
    if (this.source[this.position++] !== "<" || this.source[this.position] === "/") throw new Error("expected XML element");
    const name = this.readName();
    const elementPrefix = this.lastPrefix;
    let prefixes = inherited;
    let usedPrefixes: string[] | undefined;
    const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
    while (true) {
      this.skipWhitespace();
      if (this.source.startsWith("/>", this.position)) {
        this.position += 2;
        checkPrefixes(elementPrefix, usedPrefixes, prefixes);
        return { name, attributes, children: [], selfClosing: true };
      }
      if (this.source[this.position] === ">") { this.position++; break; }
      const attribute = this.readName();
      if (this.lastPrefix === "xmlns") (prefixes = new Set(prefixes)).add(attribute);
      else if (this.lastPrefix) (usedPrefixes ||= []).push(this.lastPrefix);
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

    checkPrefixes(elementPrefix, usedPrefixes, prefixes);

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
      if (this.source[this.position] === "<") children.push(this.readElement(prefixes));
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

function checkPrefixes(elementPrefix: string, usedPrefixes: readonly string[] | undefined, declared: ReadonlySet<string> | undefined): void {
  if (elementPrefix && elementPrefix !== "xml" && !declared?.has(elementPrefix)) throw new Error(`undeclared XML prefix ${JSON.stringify(elementPrefix)}`);
  if (!usedPrefixes) return;
  for (let index = 0; index < usedPrefixes.length; index++) {
    const prefix = usedPrefixes[index];
    if (prefix !== "xml" && !declared?.has(prefix)) throw new Error(`undeclared XML prefix ${JSON.stringify(prefix)}`);
  }
}

function isXmlCharacter(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code >= 0x20 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff;
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
      if (!isXmlCharacter(numeric)) throw new Error(`invalid XML character reference ${entity}`);
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

function deepText(element: XmlElement): string {
  let output = "";
  for (let index = 0; index < element.children.length; index++) {
    const child = element.children[index];
    output += typeof child === "string" ? child : deepText(child);
  }
  return output;
}

function validateStructure(root: XmlElement): void {
  if (root.name !== "Root") throw new Error("root element must be Root");
}


/** A declared column type as the drivers report it: FLOAT reads as DOUBLE, DECIMAL and unknown types as UNDEFINED. */
function xmlColumnType(type: string | undefined): string {
  const upper = (type || "").toUpperCase();
  if (upper === "") return "UNDEFINED";
  if (upper === "FLOAT") return "DOUBLE";
  if (upper === "DECIMAL" || !isKnownType(upper)) return "UNDEFINED";
  return upper;
}

/** A parameter type: no, DECIMAL or unknown type reads as STRING. */
function xmlParameterType(type: string | undefined): string {
  const upper = (type || "").toUpperCase();
  if (upper === "FLOAT") return "DOUBLE";
  if (upper === "" || upper === "DECIMAL" || !isKnownType(upper)) return "STRING";
  return upper;
}

function xmlCell(value: string, type: string): CanonicalCell {
  return decodeTypedCell(value === "" ? { state: "empty", lexical: "" } : { state: "value", lexical: value }, type);
}

function rowType(value: string): CanonicalRowType {
  switch (value) {
    case "insert": return "I";
    case "update": return "U";
    case "delete": return "D";
    default: return "N";
  }
}

export function decodeXmlWire(source: string, profile: "nexacro-xml-4000" | "xplatform-xml-4000" | "xplatform-xml-5000", options: WireCodecOptions = {}): CanonicalValue {
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
        ver: profile === "xplatform-xml-4000" ? "4000" : profile === "xplatform-xml-5000" ? "5000" : undefined,
      },
    };

    const parameters = firstElement(root, "Parameters");
    if (parameters) {
      for (let index = 0; index < parameters.children.length; index++) {
        const parameter = parameters.children[index];
        if (typeof parameter === "string" || parameter.name !== "Parameter") continue;
        const id = parameter.attributes.id || "";
        if (!id) throw new Error("Parameter.id is required");
        const type = xmlParameterType(parameter.attributes.type);
        const textValue = text(parameter);
        const cell = type === "BLOB" ? textBlobCell(textValue === "" ? { state: "empty", lexical: "" } : { state: "value", lexical: textValue }) : xmlCell(textValue, type);
        out.parameters.push({ id, type, state: cell.state, lexical: cell.lexical });
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
      // The type each value is converted by: the declared type as written.
      const wireTypes = new Map<string, string>();
      const info = firstElement(item, "ColumnInfo");
      let combinedIndex = 0;
      if (info) {
        for (let definitionIndex = 0; definitionIndex < info.children.length; definitionIndex++) {
          const definition = info.children[definitionIndex];
          if (typeof definition === "string" || definition.name !== "Column" && definition.name !== "ConstColumn") continue;
          const columnId = definition.attributes.id || "";
          if (!columnId) throw new Error(`${definition.name}.id is required`);
          const type = xmlColumnType(definition.attributes.type);
          const wireTypeName = (definition.attributes.type || "").toUpperCase();
          wireTypes.set(columnId, wireTypeName);
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
            // The drivers fail on a BLOB constant without a value attribute,
            // which they write themselves for a null BLOB constant.
            if (definition.attributes.value === undefined && type === "BLOB") throw new Error(`BLOB ConstColumn ${JSON.stringify(columnId)} has no value`);
            constants.set(columnId, definition.attributes.value === undefined ? { state: "null" } : xmlCell(definition.attributes.value, wireTypeName));
            columnById.set(columnId, { id: columnId, type, index: combinedIndex });
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
              values[column.id] = xmlCell(deepText(child), wireTypes.get(column.id) || "");
              continue;
            }
            for (let cellIndex = 0; cellIndex < child.children.length; cellIndex++) {
              const cell = child.children[cellIndex];
              if (typeof cell === "string" || cell.name !== "Col") continue;
              const column = columnById.get(cell.attributes.id || "");
              if (!column) throw new Error(`column ${JSON.stringify(cell.attributes.id || "")} is not declared`);
              values[column.id] = xmlCell(deepText(cell), wireTypes.get(column.id) || "");
            }
          }
          let orgRow: CanonicalRow | null = null;
          const org = firstElement(sourceRow, "OrgRow");
          if (org && type === "U") {
            const saved: Record<string, CanonicalCell> = {};
            for (let columnIndex = 0; columnIndex < dataset.columns.length; columnIndex++) saved[dataset.columns[columnIndex].id] = { state: "null" };
            for (let constantIndex = 0; constantIndex < dataset.constColumns.length; constantIndex++) {
              const constant = dataset.constColumns[constantIndex];
              saved[constant.id] = constants.get(constant.id) || { state: "null" };
            }
            // A saved row whose cells are all null is no saved row.
            let meaningful = false;
            for (let cellIndex = 0; cellIndex < org.children.length; cellIndex++) {
              const cell = org.children[cellIndex];
              if (typeof cell === "string" || cell.name !== "Col") continue;
              const column = columnById.get(cell.attributes.id || "");
              if (!column) throw new Error(`org column ${JSON.stringify(cell.attributes.id || "")} is not declared`);
              const value = xmlCell(deepText(cell), wireTypes.get(column.id) || "");
              saved[column.id] = value;
              if (value.state !== "null") meaningful = true;
            }
            if (meaningful) orgRow = { type: "O", orgRow: null, values: saved };
          }
          dataset.rows.push({ type, orgRow, values });
        }
      }
      out.datasets.push(dataset);
    }
    validateCanonical(out);
    return finishDecodedValue(out);
  } catch (error) {
    if (error instanceof WireCodecError) throw error;
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

/**
 * Escapes like the drivers' XmlCodec. XPLATFORM writes every character below
 * U+0020 as a decimal reference and a space as &#32;; Nexacro escapes only
 * the five predefined entities and writes tab, LF and CR as they are. Nexacro
 * would also write other control characters raw, which no XML parser reads
 * back, so they are rejected.
 */
function escapeXml(value: string, xplatform: boolean): string {
  let out = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    const code = value.charCodeAt(index);
    if (character === "&") out += "&amp;";
    else if (character === "<") out += "&lt;";
    else if (character === ">") out += "&gt;";
    else if (character === '"') out += "&quot;";
    else if (character === "'") out += "&apos;";
    else if (character === " ") out += xplatform ? "&#32;" : " ";
    else if (code < 0x20 && xplatform) out += `&#${code};`;
    else if (code < 0x20 && character !== "\t" && character !== "\n" && character !== "\r") throw new WireCodecError("invalid-value", `character U+${code.toString(16).toUpperCase().padStart(4, "0")} is not valid XML 1.0`, "value");
    else out += character;
  }
  return out;
}

function columnSize(size: string | undefined, type: string): string {
  return size || wireSize(type);
}

function writeXmlColumn(lines: string[], column: { id: string; type: string; size?: string }, xplatform: boolean): void {
  const blob = isBlob(column.type);
  lines.push(`\t\t\t<Column id="${escapeXml(column.id, xplatform)}" type="${escapeXml(wireType(column.type), xplatform)}" size="${escapeXml(columnSize(column.size, column.type), xplatform)}"${blob ? ' encrypt="base64"' : ""}/>`);
}

function writeXmlConstant(lines: string[], column: CanonicalConstColumn, xplatform: boolean): void {
  const start = `\t\t\t<ConstColumn id="${escapeXml(column.id, xplatform)}" type="${escapeXml(wireType(column.type), xplatform)}" size="${escapeXml(columnSize(column.size, column.type), xplatform)}"`;
  const cell = column.value;
  if (!cell || cell.state !== "value" && cell.state !== "empty") {
    lines.push(`${start}/>`);
    return;
  }
  const blob = defaultType(column.type) === "BLOB";
  const value = ` value="${escapeXml(cell.lexical || "", xplatform)}"`;
  lines.push(blob ? `${start} encrypt="base64"${value}></ConstColumn>` : `${start}${value}/>`);
}

function isBlob(type: string): boolean {
  return defaultType(type) === "BLOB";
}

function writeXmlCells(lines: string[], cells: Record<string, CanonicalCell>, columns: CanonicalColumn[], indent: string, xplatform: boolean, saved: boolean): void {
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex];
    let cell = cells[column.id];
    if (!cell || cell.state === "missing" || cell.state === "null") {
      // The drivers hold an unset BOOLEAN as false and write it as 0; a saved
      // row the driver never filled has no cells at all.
      if (saved || defaultType(column.type) !== "BOOLEAN") continue;
      cell = { state: "value", lexical: "0" };
    }
    lines.push(`${indent}<Col id="${escapeXml(column.id, xplatform)}">${escapeXml(cell.lexical || "", xplatform)}</Col>`);
  }
}

const XML_ROW_TYPES: Record<string, string> = { N: "", I: "insert", U: "update", D: "delete" };

/** Writes X-API XML as the original drivers do, byte for byte. */
export function encodeXmlWire(source: CanonicalValue, profile: "nexacro-xml-4000" | "xplatform-xml-4000" | "xplatform-xml-5000"): string {
  validateCanonical(source);
  const value = normalizeForEncode(source);
  const xplatform = profile !== "nexacro-xml-4000";
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(xplatform ? `<Root xmlns="http://www.tobesoft.com/platform/dataset" ver="${profile === "xplatform-xml-5000" ? "5000" : "4000"}">` : '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">');
  if (!value.parameters.length) lines.push("\t<Parameters/>");
  else {
    lines.push("\t<Parameters>");
    for (let parameterIndex = 0; parameterIndex < value.parameters.length; parameterIndex++) {
      const parameter = value.parameters[parameterIndex];
      const scalar = wireScalar(parameter.type, parameter);
      const start = `\t\t<Parameter id="${escapeXml(parameter.id, xplatform)}" type="${escapeXml(wireType(parameter.type), xplatform)}"`;
      if (scalar === undefined) lines.push(`${start}/>`);
      else lines.push(`${start}${isBlob(parameter.type) ? ' encrypt="base64"' : ""}>${escapeXml(scalar, xplatform)}</Parameter>`);
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
      const type = XML_ROW_TYPES[(row.type || "N").toUpperCase()];
      if (type === undefined) throw new WireCodecError("invalid-value", `invalid XML row type ${row.type}`, "value");
      lines.push(`\t\t\t<Row${type ? ` type="${type}"` : ""}>`);
      writeXmlCells(lines, row.values, dataset.columns, "\t\t\t\t", xplatform, false);
      if (row.orgRow) {
        lines.push("\t\t\t\t<OrgRow>");
        writeXmlCells(lines, row.orgRow.values, dataset.columns, "\t\t\t\t\t", xplatform, true);
        lines.push("\t\t\t\t</OrgRow>");
      }
      lines.push("\t\t\t</Row>");
    }
    lines.push("\t\t</Rows>");
    lines.push("\t</Dataset>");
  }
  lines.push("</Root>");
  return lines.join("\n") + "\n";
}
