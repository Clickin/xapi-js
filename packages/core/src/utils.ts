import { ColumnType, ColumnTypeError, XapiValueType } from "./types";

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
 * Creates an array of entities for writing XML, including control characters.
 * @returns An array of objects, each with an `entity` (e.g., "&#1;") and its `value` (e.g., "\x01").
 */
export function makeWriterEntities(): { entity: string; value: string; }[] {
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
    default:
      return String(value);
  }
}

const entities = makeParseEntities();
export function _unescapeXml(str?: string): string | undefined {
  if (!str) return str; // Return empty string if input is empty
  const regex = new RegExp(entities.map(e => e.entity).join('|'), 'g');
  return str.replace(regex, (match) => {
    const entity = entities.find(e => e.entity === match);
    return entity ? entity.value : match; // If not found, return the original match
  });
}