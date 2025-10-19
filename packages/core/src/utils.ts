import { ColumnType, ColumnTypeError, XapiValueType } from "./types";
import { XapiRoot } from "./xapi-data";

// make ReadableStream to string
// can be async
export function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}


/**
 * Creates an array of entities for parsing XML, including control characters.
 * @returns An array of objects, each with an `entity` (e.g., "&#1;") and its `value` (e.g., "\x01").
 */
export function makeParseEntities(): { entity: string; value: string; }[] {
  const entities: { entity: string; value: string; }[] = [];
  for (let i = 1; i <= 32; i++) {
    entities.push({ entity: `&#${i};`, value: String.fromCharCode(i) });
  }
  return entities;
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
export function stringToDate(value: string): Date | undefined {
  if (!value) return undefined;
  let year: number;
  let month: number;
  let day: number;
  let hours: number = 0;
  let minutes: number = 0;
  let seconds: number = 0;
  let milliseconds: number = 0;
  if (value.length < 6 || value.length > 16) {
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
  if (value.length === 16) {
    milliseconds = parseInt(value.substring(14, 16), 10);
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
export function dateToString(date: Date, type: Extract<ColumnType, "DATE" | "DATETIME" | "TIME">): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  switch (type) {
    case "DATE":
      return `${year}${month}${day}`;
    case "DATETIME":
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    case "TIME":
      return `${hours}${minutes}${seconds}`;
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
  switch (type) {
    case "INT":
    case "BIGDECIMAL":
      const intValue = parseInt(value as string, 10);
      return isNaN(intValue) ? value : intValue;
    case "FLOAT":
      const floatValue = parseFloat(value as string);
      return isNaN(floatValue) ? value : floatValue;
    case "DECIMAL":
      const decimalValue = parseFloat(value as string);
      return isNaN(decimalValue) ? value : decimalValue;
    case "DATE":
    case "DATETIME":
    case "TIME":
      return stringToDate(value as string) || value;
    case "BLOB":
      try {
        return base64ToUint8Array(value as string);
      } catch {
        return value;
      }
    case "STRING":
      return value as string;
    default:
      throw new ColumnTypeError(`Unsupported column type: ${type}`);
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
    case "BIGDECIMAL":
    case "FLOAT":
    case "DECIMAL":
      return String(value);
    case "DATE":
    case "DATETIME":
    case "TIME":
      return dateToString(value as Date, type);
    case "BLOB":
      return uint8ArrayToBase64(value as Uint8Array);
    case "STRING":
      return String(value);
    default:
      return String(value);
  }
}

const entities = makeParseEntities();
export function _unescapeXml(str?: string): string | undefined {
  if (!str) return str; // Return empty string if input is empty

  // First handle standard XML entities
  let result = str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // &amp; must be last to avoid double-decoding

  // Then handle control character entities
  const regex = new RegExp(entities.map(e => e.entity).join('|'), 'g');
  result = result.replace(regex, (match) => {
    const entity = entities.find(e => e.entity === match);
    return entity ? entity.value : match; // If not found, return the original match
  });

  return result;
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  writeStartElement(name: string, attributes?: Record<string, string>, selfClosing?: boolean): void {
    const indent = this.indentString.repeat(this.indentLevel);
    let tag = `${indent}<${name}`;

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
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
  writeElementWithText(name: string, attributes: Record<string, string> | undefined, text: string): void {
    const indent = this.indentString.repeat(this.indentLevel);
    let tag = `${indent}<${name}`;

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
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
 * Parses XML string into a txml-compatible node structure.
 * This is a lightweight parser optimized for X-API XML structure.
 *
 * @param xml - The XML string to parse.
 * @returns An array of parsed nodes compatible with txml structure.
 */
export function parseXml(xml: string): any[] {
  if (!xml || xml.trim() === '') {
    return [];
  }

  const parser = new XapiXmlParser(xml);
  return parser.parse();
}

/**
 * A lightweight XML parser optimized for X-API structure.
 * Compatible with txml's output format.
 */
class XapiXmlParser {
  private xml: string;
  private pos: number = 0;
  private length: number;

  constructor(xml: string) {
    this.xml = xml;
    this.length = xml.length;
  }

  parse(): any[] {
    const nodes: any[] = [];

    while (this.pos < this.length) {
      this.skipWhitespace();

      if (this.pos >= this.length) break;

      // Skip XML declaration
      if (this.peek(5) === '<?xml') {
        this.skipUntil('?>');
        this.pos += 2; // skip ?>
        continue;
      }

      // Skip comments
      if (this.peek(4) === '<!--') {
        this.skipUntil('-->');
        this.pos += 3; // skip -->
        continue;
      }

      // Parse element
      if (this.current() === '<') {
        const node = this.parseElement();
        if (node) {
          nodes.push(node);
        }
      } else {
        // Skip unexpected text at root level
        this.pos++;
      }
    }

    return nodes;
  }

  private parseElement(): any {
    if (this.current() !== '<') return null;

    this.pos++; // skip <

    // Check for closing tag
    if (this.current() === '/') {
      return null; // Closing tag handled by parent
    }

    // Parse tag name
    const tagName = this.parseTagName();
    if (!tagName) return null;

    const node: any = { tagName };

    // Parse attributes
    const attributes = this.parseAttributes();
    if (attributes && Object.keys(attributes).length > 0) {
      node.attributes = attributes;
    }

    this.skipWhitespace();

    // Check for self-closing tag
    if (this.peek(2) === '/>') {
      this.pos += 2;
      return node;
    }

    // Skip >
    if (this.current() === '>') {
      this.pos++;
    }

    // Parse children
    const children: any[] = [];
    let textContent = '';

    while (this.pos < this.length) {
      // Check for CDATA
      if (this.peek(9) === '<![CDATA[') {
        const cdataText = this.parseCDATA();
        if (cdataText !== null) {
          textContent += cdataText;
        }
        continue;
      }

      // Check for closing tag
      if (this.peek(2) === '</') {
        if (textContent) {
          children.push(textContent);
        }
        this.pos += 2; // skip </
        this.skipUntil('>');
        this.pos++; // skip >
        break;
      }

      // Check for child element
      if (this.current() === '<') {
        // Save any accumulated text before parsing child
        if (textContent.trim()) {
          children.push(textContent);
          textContent = '';
        }

        const child = this.parseElement();
        if (child) {
          children.push(child);
        }
      } else {
        // Accumulate text content
        textContent += this.current();
        this.pos++;
      }
    }

    if (children.length > 0) {
      node.children = children;
    }

    return node;
  }

  private parseTagName(): string {
    let name = '';

    while (this.pos < this.length) {
      const ch = this.current();

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
          ch === '>' || ch === '/') {
        break;
      }

      name += ch;
      this.pos++;
    }

    return name;
  }

  private parseAttributes(): Record<string, string> | undefined {
    const attrs: Record<string, string> = {};

    while (this.pos < this.length) {
      this.skipWhitespace();

      const ch = this.current();

      // End of attributes
      if (ch === '>' || ch === '/' || this.peek(2) === '/>') {
        break;
      }

      // Parse attribute name
      const attrName = this.parseAttributeName();
      if (!attrName) break;

      this.skipWhitespace();

      // Skip =
      if (this.current() === '=') {
        this.pos++;
      }

      this.skipWhitespace();

      // Parse attribute value
      const attrValue = this.parseAttributeValue();
      attrs[attrName] = attrValue;
    }

    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  private parseAttributeName(): string {
    let name = '';

    while (this.pos < this.length) {
      const ch = this.current();

      if (ch === '=' || ch === ' ' || ch === '\t' || ch === '\n' ||
          ch === '\r' || ch === '>' || ch === '/') {
        break;
      }

      name += ch;
      this.pos++;
    }

    return name;
  }

  private parseAttributeValue(): string {
    let value = '';
    const quote = this.current();

    if (quote !== '"' && quote !== "'") {
      // No quotes - read until whitespace or >
      while (this.pos < this.length) {
        const ch = this.current();
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
            ch === '>' || ch === '/') {
          break;
        }
        value += ch;
        this.pos++;
      }
      return value;
    }

    this.pos++; // skip opening quote

    while (this.pos < this.length) {
      const ch = this.current();

      if (ch === quote) {
        this.pos++; // skip closing quote
        break;
      }

      value += ch;
      this.pos++;
    }

    return value;
  }

  private parseCDATA(): string | null {
    if (this.peek(9) !== '<![CDATA[') return null;

    this.pos += 9; // skip <![CDATA[

    let content = '';

    while (this.pos < this.length) {
      if (this.peek(3) === ']]>') {
        this.pos += 3; // skip ]]>
        break;
      }

      content += this.current();
      this.pos++;
    }

    return content;
  }

  private skipWhitespace(): void {
    while (this.pos < this.length) {
      const ch = this.current();
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
        break;
      }
      this.pos++;
    }
  }

  private skipUntil(target: string): void {
    while (this.pos < this.length) {
      if (this.peek(target.length) === target) {
        break;
      }
      this.pos++;
    }
  }

  private current(): string {
    return this.xml[this.pos];
  }

  private peek(length: number): string {
    return this.xml.substring(this.pos, this.pos + length);
  }
}