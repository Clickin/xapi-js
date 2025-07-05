import { ColumnType, ColumnTypeError, XapiValueType } from "./types";

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
}

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
    // 잘못된 형식의 날짜 문자열인 경우 undefined 반환
    return undefined;
  }
  // 문자열 길이에 따라 날짜를 파싱
  // yyyyMMdd, yyyyMMddHHmmss, yyyyMMddHHmmssSSS, HHmmss 형식 지원
  // yyyyMMdd: 8자리, yyyyMMddHHmmss: 14자리, yyyyMMddHHmmssSSS: 16자리, HHmmss: 6자리
  if (value.length >= 8) {
    year = parseInt(value.substring(0, 4), 10);
    month = parseInt(value.substring(4, 6), 10) - 1; // 월은 0부터 시작
    day = parseInt(value.substring(6, 8), 10);
  } else {
    year = 1970; // 기본값
    month = 0; // 기본값
    day = 1; // 기본값
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
  // 19700101 000000 ~ 99991231 235959.9999999 까지 지원
  // 검증
  if (year < 1970 || year > 9999 || month < 0 || month > 11 || day < 1 || day > 31 ||
    hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59 ||
    milliseconds < 0 || milliseconds > 999) {
    return undefined;
  }
  // Date 객체 생성
  const date = new Date(year, month, day, hours, minutes, seconds, milliseconds);
  // Date 객체가 유효한지 확인
  if (isNaN(date.getTime())) {
    return undefined; // 유효하지 않은 날짜
  }
  return date;
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
      return value as string; // No conversion needed for STRING type
    default:
      throw new ColumnTypeError(`Unsupported column type: ${type}`);
  } // this line is reported as not covered by test, but it's not possible to cover it
}
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
      return String(value); // Default to string
  }
}
