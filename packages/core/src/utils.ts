import { ColumnType, ColumnTypeError, XapiValueType } from "./types";
import { XapiRoot } from "./xapi-data";
const UTF8_DECODER = new TextDecoder();

/**
 * Represents an XML node in the parsed structure.
 */
export type XmlNode = {
  tagName: string;
  attributes?: Record<string, string>;
  children?: (XmlNode | string)[];
};

// make ReadableStream to string
// can be async
export function arrayBufferToString(buffer: ArrayBuffer): string {
  return UTF8_DECODER.decode(buffer);
}


/**
 * Pre-defined XML entities for parsing, including control characters.
 * Static array to avoid repeated allocation.
 */
const PARSE_ENTITIES = (() => {
  const entities: { entity: string; value: string; }[] = [];
  for (let i = 1; i <= 32; i++) {
    entities.push({ entity: `&#${i};`, value: String.fromCharCode(i) });
  }
  return entities;
})();

/**
 * Creates an array of entities for parsing XML, including control characters.
 * @deprecated Use PARSE_ENTITIES directly for better performance
 * @returns An array of objects, each with an `entity` (e.g., "&#1;") and its `value` (e.g., "\x01").
 */
export function makeParseEntities(): { entity: string; value: string; }[] {
  return PARSE_ENTITIES.slice();
}


/**
 * Converts a Base64 string to a Uint8Array.
 * @param base64String - The Base64 string to convert.
 * @returns A Uint8Array.
 */
export function base64ToUint8Array(base64String: string): Uint8Array {
  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a Base64 string.
 * @param uint8Array - The Uint8Array to convert.
 * @returns A Base64 string.
 */
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binaryString);
}

/**
 * Converts a string representation of a date/time to a Date object.
 * Supports "yyyyMMdd", "yyyyMMddHHmmss", "yyyyMMddHHmmssSSS", and "HHmmss" formats.
 * @param value - The string to convert.
 * @returns A Date object if the string is a valid date/time, otherwise undefined.
 */
export function stringToDate(value: string, type?: ColumnType): Date | undefined {
  if (!value) return undefined;
  const normalizedType = type ? normalizeColumnType(type) : undefined;
  if (normalizedType === "TIME") {
    if (value.length !== 6 && value.length !== 9) return undefined;
    const hours = parseInt(value.substring(0, 2), 10);
    const minutes = parseInt(value.substring(2, 4), 10);
    const seconds = parseInt(value.substring(4, 6), 10);
    const milliseconds = value.length === 9 ? parseInt(value.substring(6, 9), 10) : 0;
    if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds) || Number.isNaN(milliseconds) || hours > 23 || minutes > 59 || seconds > 59 || milliseconds > 999) return undefined;
    return new Date(1970, 0, 1, hours, minutes, seconds, milliseconds);
  }
  let year: number;
  let month: number;
  let day: number;
  let hours: number = 0;
  let minutes: number = 0;
  let seconds: number = 0;
  let milliseconds: number = 0;
  if (value.length < 6 || value.length > (normalizedType ? 17 : 16)) {
    return undefined;
  }
  if (value.length >= 8) {
    year = parseInt(value.substring(0, 4), 10);
    month = parseInt(value.substring(4, 6), 10) - 1;
    day = parseInt(value.substring(6, 8), 10);
  } else {
    year = 1970;
    month = 0;
    day = 1;
  }
  if (value.length === 6) {
    hours = parseInt(value.substring(0, 2), 10);
    minutes = parseInt(value.substring(2, 4), 10);
    seconds = parseInt(value.substring(4, 6), 10);
  } else if (value.length >= 10) {
    hours = parseInt(value.substring(8, 10), 10);
    minutes = parseInt(value.substring(10, 12), 10);
    seconds = parseInt(value.substring(12, 14), 10);
  }
  if (value.length === 16 || value.length === 17) {
    milliseconds = parseInt(value.substring(14, value.length), 10);
    if (value.length === 16 && normalizedType) milliseconds *= 10;
  }
  if (year < 1970 || year > 9999 || month < 0 || month > 11 || day < 1 || day > 31 ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59 ||
    milliseconds < 0 || milliseconds > 999) {
    return undefined;
  }
  const date = new Date(year, month, day, hours, minutes, seconds, milliseconds);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}

/**
 * Converts a Date object to a string representation based on the specified column type.
 * @param date - The Date object to convert.
 * @param type - The column type ("DATE", "DATETIME", or "TIME").
 * @returns A string representation of the date/time.
 */
export function dateToString(date: Date, type: Extract<ColumnType, "DATE" | "DATETIME" | "DATE_TIME" | "TIME">): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  switch (normalizeColumnType(type)) {
    case "DATE":
      return `${year}${month}${day}`;
    case "DATETIME":
      return `${year}${month}${day}${hours}${minutes}${seconds}${date.getMilliseconds() ? date.getMilliseconds().toString().padStart(3, '0') : ''}`;
    case "TIME":
      return `${hours}${minutes}${seconds}${date.getMilliseconds() ? date.getMilliseconds().toString().padStart(3, '0') : ''}`;
    default:
      return '';
  }
}

/**
 * A WritableStream that collects all written Uint8Array chunks and provides them as a single string.
 */
export class StringWritableStream extends WritableStream<Uint8Array> {
  private result: string = '';

  constructor() {
    const decoder = new TextDecoder();
    super({
      write: (chunk: Uint8Array) => {
        this.result += decoder.decode(chunk, { stream: true });
      },
      close: () => {
        this.result += decoder.decode();
      }
    });
  }

  /**
   * Returns the collected string result.
   * @returns The concatenated string from all written chunks.
   */
  getResult(): string {
    return this.result;
  }
}

/**
 * Converts a string to a ReadableStream of Uint8Array.
 * @param str - The string to convert.
 * @returns A ReadableStream containing the string as Uint8Array.
 */
export function stringToReadableStream(str: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

/**
 * Converts a value to the specified ColumnType.
 * @param value - The value to convert.
 * @param type - The target ColumnType.
 * @returns The converted value, or the original value if conversion fails or is not applicable.
 * @throws {ColumnTypeError} if the column type is unsupported.
 */
export function convertToColumnType(value: XapiValueType, type: ColumnType): XapiValueType {
  const normalizedType = normalizeColumnType(type);
  switch (normalizeColumnType(type)) {
    case "INT":
      const intValue = parseInt(value as string, 10);
      return isNaN(intValue) ? value : intValue;
    case "FLOAT":
    case "DOUBLE":
    case "LONG":
    case "BIGDECIMAL":
    case "BIG_DECIMAL":
    const floatValue = parseFloat(value as string);
      return isNaN(floatValue) ? value : floatValue;
    case "DECIMAL":
      const decimalValue = parseFloat(value as string);
      return isNaN(decimalValue) ? value : decimalValue;
    case "DATE":
    case "DATETIME":
    case "DATE_TIME":
    case "TIME":
      return stringToDate(value as string, normalizedType) || value;
    case "BOOLEAN":
      if (value === "true" || value === "1" || value === 1 || value === true) return true;
      if (value === "false" || value === "0" || value === 0 || value === false) return false;
      return value;
    case "BLOB":
      try {
        return base64ToUint8Array(value as string);
      } catch {
        return value;
      }
    case "STRING":
      return value as string;
    default:
      throw new ColumnTypeError(`Unsupported column type: ${normalizedType}`);
  }
}

/** Normalizes X-API/Java type spellings to the names used by Dataset XML. */
export function normalizeColumnType(type?: string): ColumnType {
  const normalized = type?.replace(/[- ]/g, "_").toUpperCase();
  switch (normalized) {
    case "DATE_TIME": return "DATETIME";
    case "BIG_DECIMAL": return "BIGDECIMAL";
    case "BOOL": return "BOOLEAN";
    default: return normalized as ColumnType || "STRING";
  }
}

/**
 * Converts an XapiValueType to its string representation based on the specified ColumnType.
 * @param value - The value to convert.
 * @param type - The ColumnType to guide the conversion.
 * @returns The string representation of the value.
 */
export function convertToString(value: XapiValueType, type: ColumnType): string {
  switch (type) {
    case "INT":
    case "LONG":
    case "BIGDECIMAL":
    case "BIG_DECIMAL":
    case "FLOAT":
    case "DOUBLE":
    case "DECIMAL":
      return String(value);
    case "BOOLEAN":
      return value ? "true" : "false";
    case "DATE":
    case "DATETIME":
    case "DATE_TIME":
    case "TIME":
      return dateToString(value as Date, normalizeColumnType(type) as Extract<ColumnType, "DATE" | "DATETIME" | "TIME">);
    case "BLOB":
      return uint8ArrayToBase64(value as Uint8Array);
    case "STRING":
      return String(value);
    default:
      return String(value);
  }
}

export function _unescapeXml(str?: string): string | undefined {
  if (!str || str.indexOf("&") === -1) return str;
  let output = "";
  let position = 0;
  while (position < str.length) {
    const ampersand = str.indexOf("&", position);
    if (ampersand < 0) return output + str.slice(position);
    output += str.slice(position, ampersand);
    const semicolon = str.indexOf(";", ampersand + 1);
    if (semicolon < 0) return output + str.slice(ampersand);
    const entity = str.slice(ampersand, semicolon + 1);
    if (entity === "&lt;") output += "<";
    else if (entity === "&gt;") output += ">";
    else if (entity === "&quot;") output += '"';
    else if (entity === "&apos;") output += "'";
    else if (entity === "&amp;") output += "&";
    else if (entity.startsWith("&#") && entity[2] !== "x" && entity[2] !== "X") {
      const code = Number.parseInt(entity.slice(2, -1), 10);
      output += code >= 1 && code <= 32 ? String.fromCharCode(code) : entity;
    } else output += entity;
    position = semicolon + 1;
  }
  return output;
}

export function isXapiRoot(value: unknown): value is XapiRoot {
  return value instanceof XapiRoot
}

/**
 * Escapes XML special characters in a string.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escapeXml(str: string): string {
  let output = "";
  for (let index = 0; index < str.length; index++) {
    const character = str[index];
    if (character === "&") output += "&amp;";
    else if (character === "<") output += "&lt;";
    else if (character === ">") output += "&gt;";
    else if (character === '"') output += "&quot;";
    else if (character === "'") output += "&apos;";
    else output += character;
  }
  return output;
}

/**
 * Encodes control characters as XML entities, excluding standard whitespace.
 * Encodes 0x01-0x08, 0x0B-0x0C, 0x0E-0x1F but NOT 0x09 (tab), 0x0A (LF), 0x0D (CR), 0x20 (space).
 * @param str - The string to encode.
 * @returns The encoded string.
 */
export function encodeControlChars(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    // Encode control characters except standard whitespace
    if ((charCode >= 1 && charCode <= 8) ||
        (charCode >= 11 && charCode <= 12) ||
        (charCode >= 14 && charCode <= 31)) {
      result += `&#${charCode};`;
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * A string builder for generating formatted XML.
 */
export class XmlStringBuilder {
  private lines: string[] = [];
  private indentLevel: number = 0;
  private readonly indentString: string = '  ';

  /**
   * Writes the XML declaration.
   * @param version - The XML version (default: "1.0").
   * @param encoding - The encoding (default: "UTF-8").
   */
  writeDeclaration(version: string = '1.0', encoding: string = 'UTF-8'): void {
    this.lines.push(`<?xml version="${version}" encoding="${encoding}"?>`);
  }

  /**
   * Writes a start element tag.
   * @param name - The element name.
   * @param attributes - Optional attributes object.
   * @param selfClosing - Whether to create a self-closing tag.
   */
  writeStartElement(name: string, attributes?: Record<string, string | undefined>, selfClosing?: boolean): void {
    const indent = this.indentString.repeat(this.indentLevel);
    let tag = `${indent}<${name}`;

    if (attributes) {
      const keys = Object.keys(attributes);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const value = attributes[key];
        if (value === undefined) continue;
        const encodedValue = encodeControlChars(escapeXml(value));
        tag += ` ${key}="${encodedValue}"`;
      }
    }

    if (selfClosing) {
      tag += '/>';
      this.lines.push(tag);
    } else {
      tag += '>';
      this.lines.push(tag);
      this.indentLevel++;
    }
  }

  /**
   * Writes an end element tag.
   * @param name - The element name.
   */
  writeEndElement(name: string): void {
    this.indentLevel--;
    const indent = this.indentString.repeat(this.indentLevel);
    this.lines.push(`${indent}</${name}>`);
  }

  /**
   * Writes an element with text content.
   * @param name - The element name.
   * @param attributes - Optional attributes object.
   * @param text - The text content.
   */
  writeElementWithText(name: string, attributes: Record<string, string | undefined> | undefined, text: string): void {
    const indent = this.indentString.repeat(this.indentLevel);
    let tag = `${indent}<${name}`;

    if (attributes) {
      const keys = Object.keys(attributes);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const value = attributes[key];
        if (value === undefined) continue;
        const encodedValue = encodeControlChars(escapeXml(value));
        tag += ` ${key}="${encodedValue}"`;
      }
    }

    const encodedText = encodeControlChars(escapeXml(text));
    tag += `>${encodedText}</${name}>`;
    this.lines.push(tag);
  }

  /**
   * Returns the generated XML string.
   * @returns The complete XML string with line breaks.
   */
  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

/**
 * Parses XML string into an XML node structure.
 * This is a lightweight parser optimized for X-API XML structure.
 *
 * @param xml - The XML string to parse.
 * @returns An array of parsed XML nodes.
 */
export function parseXml(xml: string): XmlNode[] {
  if (!xml) return [];

  const parser = new XapiXmlParser(xml);
  return parser.parse();
}

/**
 * Character codes for fast comparison
 */
const CHAR_SPACE = 32;      // ' '
const CHAR_TAB = 9;         // '\t'
const CHAR_LF = 10;         // '\n'
const CHAR_CR = 13;         // '\r'
const CHAR_GT = 62;         // '>'
const CHAR_SLASH = 47;      // '/'
const CHAR_EQUALS = 61;     // '='
const CHAR_QUOTE = 34;      // '"'
const CHAR_APOS = 39;       // "'"

/** Reuse the small, fixed X-API vocabulary instead of allocating a name per node. */
function xapiXmlName(xml: string, start: number, end: number): string {
  switch (end - start) {
    case 2:
      if (xml.startsWith('id', start)) return 'id';
      break;
    case 3:
      if (xml.startsWith('Col', start)) return 'Col';
      if (xml.startsWith('Row', start)) return 'Row';
      break;
    case 4:
      if (xml.startsWith('Root', start)) return 'Root';
      if (xml.startsWith('Rows', start)) return 'Rows';
      if (xml.startsWith('size', start)) return 'size';
      if (xml.startsWith('type', start)) return 'type';
      break;
    case 5:
      if (xml.startsWith('value', start)) return 'value';
      if (xml.startsWith('xmlns', start)) return 'xmlns';
      break;
    case 6:
      if (xml.startsWith('Column', start)) return 'Column';
      if (xml.startsWith('OrgRow', start)) return 'OrgRow';
      break;
    case 7:
      if (xml.startsWith('Dataset', start)) return 'Dataset';
      if (xml.startsWith('version', start)) return 'version';
      break;
    case 8:
      if (xml.startsWith('Datasets', start)) return 'Datasets';
      break;
    case 9:
      if (xml.startsWith('Parameter', start)) return 'Parameter';
      break;
    case 10:
      if (xml.startsWith('ColumnInfo', start)) return 'ColumnInfo';
      if (xml.startsWith('Parameters', start)) return 'Parameters';
      break;
    case 11:
      if (xml.startsWith('ConstColumn', start)) return 'ConstColumn';
      break;
  }
  return xml.substring(start, end);
}

/**
 * A lightweight XML parser optimized for X-API structure.
 */
class XapiXmlParser {
  private readonly xml: string;
  private pos: number = 0;
  private readonly length: number;

  constructor(xml: string) {
    this.xml = xml;
    this.length = xml.length;
  }

  parse(): XmlNode[] {
    const nodes: XmlNode[] = [];
    const xml = this.xml;
    const length = this.length;

    while (this.pos < length) {
      while (this.pos < length) {
        const code = xml.charCodeAt(this.pos);
        if (code !== CHAR_SPACE && code !== CHAR_TAB && code !== CHAR_LF && code !== CHAR_CR) break;
        this.pos++;
      }
      if (this.pos >= length) break;

      // Skip XML declaration
      if (xml.startsWith('<?xml', this.pos)) {
        const end = xml.indexOf('?>', this.pos + 5);
        this.pos = end < 0 ? length : end + 2;
        continue;
      }

      // Skip comments
      if (xml.startsWith('<!--', this.pos)) {
        const end = xml.indexOf('-->', this.pos + 4);
        this.pos = end < 0 ? length : end + 3;
        continue;
      }

      // Parse element
      if (xml.charCodeAt(this.pos) === 60) {
        const node = this.parseElement();
        if (node) nodes.push(node);
      } else {
        // Skip unexpected text at root level
        this.pos++;
      }
    }

    return nodes;
  }

  private parseElement(): XmlNode | null {
    const xml = this.xml;
    const length = this.length;
    this.pos++; // skip <

    // Check for closing tag
    if (xml.charCodeAt(this.pos) === CHAR_SLASH) {
      return null; // Closing tag handled by parent
    }

    // Parse tag name
    const nameStart = this.pos;
    while (this.pos < length) {
      const code = xml.charCodeAt(this.pos);
      if (code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_LF || code === CHAR_CR ||
          code === CHAR_GT || code === CHAR_SLASH) break;
      this.pos++;
    }
    const tagName = xapiXmlName(xml, nameStart, this.pos);
    if (!tagName) return null;

    // Initialize all fields upfront for V8 hidden class optimization
    // This ensures consistent object shape across all XmlNode instances
    const node: XmlNode = {
      tagName,
      attributes: undefined,
      children: undefined
    };

    // Parse attributes
    const attributes = this.parseAttributes();
    if (attributes) node.attributes = attributes;

    // Check for self-closing tag
    if (xml.charCodeAt(this.pos) === CHAR_SLASH && xml.charCodeAt(this.pos + 1) === CHAR_GT) {
      this.pos += 2;
      return node;
    }

    // Skip >
    if (xml.charCodeAt(this.pos) === CHAR_GT) this.pos++;

    // Parse children
    let children: (XmlNode | string)[] | undefined;
    let textContent = '';

    while (this.pos < length) {
      const markup = xml.indexOf('<', this.pos);
      if (markup < 0) {
        this.pos = length;
        break;
      }
      if (markup > this.pos) {
        const text = xml.substring(this.pos, markup);
        textContent = textContent ? textContent + text : text;
        this.pos = markup;
      }

      // Check for CDATA
      if (xml.startsWith('<![CDATA[', this.pos)) {
        const start = this.pos + 9;
        const end = xml.indexOf(']]>', start);
        if (end < 0) {
          textContent += xml.substring(start);
          this.pos = length;
          break;
        }
        textContent += xml.substring(start, end);
        this.pos = end + 3;
        continue;
      }

      // Check for closing tag
      if (xml.charCodeAt(this.pos + 1) === CHAR_SLASH) {
        if (textContent && (!children || textContent.trim())) (children ??= []).push(textContent);
        this.pos += 2; // skip </
        const end = xml.indexOf('>', this.pos);
        this.pos = end < 0 ? length : end + 1;
        break;
      }

      // Comments do not contribute to the DOM tree.
      if (xml.startsWith('<!--', this.pos)) {
        const end = xml.indexOf('-->', this.pos + 4);
        this.pos = end < 0 ? length : end + 3;
        continue;
      }

      // Check for child element
      if (textContent && textContent.trim()) {
        (children ??= []).push(textContent);
      }
      textContent = '';
      const child = this.parseElement();
      if (child) (children ??= []).push(child);
    }

    if (children) node.children = children;

    return node;
  }

  private parseAttributes(): Record<string, string> | undefined {
    const xml = this.xml;
    const length = this.length;
    let attrs: Record<string, string> | undefined;

    while (this.pos < length) {
      while (this.pos < length) {
        const code = xml.charCodeAt(this.pos);
        if (code !== CHAR_SPACE && code !== CHAR_TAB && code !== CHAR_LF && code !== CHAR_CR) break;
        this.pos++;
      }

      // End of attributes
      const code = xml.charCodeAt(this.pos);
      if (code === CHAR_GT || code === CHAR_SLASH) break;

      // Parse attribute name
      const nameStart = this.pos;
      while (this.pos < length) {
        const code = xml.charCodeAt(this.pos);
        if (code === CHAR_EQUALS || code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_LF ||
            code === CHAR_CR || code === CHAR_GT || code === CHAR_SLASH) break;
        this.pos++;
      }
      const attrName = xapiXmlName(xml, nameStart, this.pos);
      if (!attrName) break;

      while (this.pos < length) {
        const code = xml.charCodeAt(this.pos);
        if (code !== CHAR_SPACE && code !== CHAR_TAB && code !== CHAR_LF && code !== CHAR_CR) break;
        this.pos++;
      }

      // Skip =
      if (xml.charCodeAt(this.pos) === CHAR_EQUALS) this.pos++;

      while (this.pos < length) {
        const code = xml.charCodeAt(this.pos);
        if (code !== CHAR_SPACE && code !== CHAR_TAB && code !== CHAR_LF && code !== CHAR_CR) break;
        this.pos++;
      }

      // Parse attribute value
      const quote = xml.charCodeAt(this.pos);
      let valueStart: number;
      let valueEnd: number;
      if (quote === CHAR_QUOTE || quote === CHAR_APOS) {
        valueStart = ++this.pos;
        valueEnd = xml.indexOf(quote === CHAR_QUOTE ? '"' : "'", valueStart);
        if (valueEnd < 0) {
          valueEnd = length;
          this.pos = length;
        } else {
          this.pos = valueEnd + 1;
        }
      } else {
        valueStart = this.pos;
        while (this.pos < length) {
          const code = xml.charCodeAt(this.pos);
          if (code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_LF || code === CHAR_CR ||
              code === CHAR_GT || code === CHAR_SLASH) break;
          this.pos++;
        }
        valueEnd = this.pos;
      }
      (attrs ??= {})[attrName] = xml.substring(valueStart, valueEnd);
    }

    return attrs;
  }

}
