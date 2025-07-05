import { ColumnType } from "./types";

export function makeParseEntities(): { entity: string; value: string; }[] {
  // This function can be used to create entities for parsing
  const entities: { entity: string; value: string; }[] = [];
  for (let i = 1; i <= 32; i++) {
    entities.push({ entity: `&#${i};`, value: String.fromCharCode(i) });
  }
  return entities;
}
export function makeWriterEntities(): { entity: string; value: string; }[] {
  // This function can be used to create entities for writing
  const entities: { entity: string; value: string; }[] = [];
  for (let i = 1; i <= 32; i++) {
    entities.push({ entity: `&#${i};`, value: String.fromCharCode(i) });
  }
  return entities;
}
/**
 * Base64 문자열을 Uint8Array로 변환합니다.
 * @param base64String - 변환할 base64 문자열
 * @returns Uint8Array
 */

export function base64ToUint8Array(base64String: string): Uint8Array {
  // atob()를 사용하여 base64를 binary string으로 디코딩
  const binaryString = atob(base64String);

  // binary string을 Uint8Array로 변환
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}
/**
 * Uint8Array를 Base64 문자열로 변환합니다.
 * @param uint8Array - 변환할 Uint8Array
 * @returns Base64 문자열
 */

export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  // Uint8Array를 binary string으로 변환
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  // btoa()를 사용하여 binary string을 base64로 인코딩
  return btoa(binaryString);
} export function stringToDate(value: string): Date | undefined {
  if (!value) return undefined;
  const strlen = value.length;
  switch (strlen) {
    case 8: // yyyyMMdd
      return new Date(
        parseInt(value.substring(0, 4), 10),
        parseInt(value.substring(4, 6), 10) - 1,
        parseInt(value.substring(6, 8), 10)
      );
    case 14: // yyyyMMddHHmmss
      return new Date(
        parseInt(value.substring(0, 4), 10),
        parseInt(value.substring(4, 6), 10) - 1,
        parseInt(value.substring(6, 8), 10),
        parseInt(value.substring(8, 10), 10),
        parseInt(value.substring(10, 12), 10),
        parseInt(value.substring(12, 14), 10)
      );
    case 16: // yyyyMMddHHmmssSSS
      return new Date(
        parseInt(value.substring(0, 4), 10),
        parseInt(value.substring(4, 6), 10) - 1,
        parseInt(value.substring(6, 8), 10),
        parseInt(value.substring(8, 10), 10),
        parseInt(value.substring(10, 12), 10),
        parseInt(value.substring(12, 14), 10),
        parseInt(value.substring(14, 16), 10)
      );
    case 6: // HHmmss
      return new Date(
        1970,
        0,
        1,
        parseInt(value.substring(0, 2), 10),
        parseInt(value.substring(2, 4), 10),
        parseInt(value.substring(4, 6), 10)
      );
  }
}

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

  getResult(): string {
    return this.result;
  }
}

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