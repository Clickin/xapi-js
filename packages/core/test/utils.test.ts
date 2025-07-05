import { describe, expect, it } from "vitest";
import {
  base64ToUint8Array,
  dateToString,
  makeParseEntities,
  makeWriterEntities,
  stringToDate,
  uint8ArrayToBase64
} from "../src/utils";

describe("Utils Tests", () => {
  describe("makeParseEntities", () => {
    it("should create entities for parsing with correct format", () => {
      const entities = makeParseEntities();
      expect(entities).toBeDefined();
      expect(entities.length).toBe(32);
      expect(entities[0]).toEqual({ entity: String.fromCharCode(1), value: "&#1;" });
      expect(entities[31]).toEqual({ entity: String.fromCharCode(32), value: "&#32;" });
    });
  });

  describe("makeWriterEntities", () => {
    it("should create entities for writing with correct format", () => {
      const entities = makeWriterEntities();
      expect(entities).toBeDefined();
      expect(entities.length).toBe(32);
      expect(entities[0]).toEqual({ entity: "&#1;", value: String.fromCharCode(1) });
      expect(entities[31]).toEqual({ entity: "&#32;", value: String.fromCharCode(32) });
    });
  });

  describe("base64ToUint8Array", () => {
    it("should convert base64 string to Uint8Array", () => {
      const base64 = "SGVsbG8gV29ybGQ="; // "Hello World" in base64
      const result = base64ToUint8Array(base64);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(11);

      // Convert back to string to verify
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toBe("Hello World");
    });

    it("should handle empty base64 string", () => {
      const result = base64ToUint8Array("");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });
  });

  describe("uint8ArrayToBase64", () => {
    it("should convert Uint8Array to base64 string", () => {
      const text = "Hello World";
      const uint8Array = new TextEncoder().encode(text);
      const result = uint8ArrayToBase64(uint8Array);
      expect(result).toBe("SGVsbG8gV29ybGQ=");
    });

    it("should handle empty Uint8Array", () => {
      const result = uint8ArrayToBase64(new Uint8Array(0));
      expect(result).toBe("");
    });
  });

  describe("stringToDate", () => {
    it("should parse date string in yyyyMMdd format", () => {
      const result = stringToDate("20230615");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(5); // 0-based months
      expect(result?.getDate()).toBe(15);
    });

    it("should parse date string in yyyyMMddHHmmss format", () => {
      const result = stringToDate("20230615143022");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(5);
      expect(result?.getDate()).toBe(15);
      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
      expect(result?.getSeconds()).toBe(22);
    });

    it("should parse date string in yyyyMMddHHmmssSSS format", () => {
      const result = stringToDate("2023061514302299");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(5);
      expect(result?.getDate()).toBe(15);
      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
      expect(result?.getSeconds()).toBe(22);
      expect(result?.getMilliseconds()).toBe(99);
    });

    it("should parse time string in HHmmss format", () => {
      const result = stringToDate("143022");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(1970);
      expect(result?.getMonth()).toBe(0);
      expect(result?.getDate()).toBe(1);
      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
      expect(result?.getSeconds()).toBe(22);
    });

    it("should return undefined for empty string", () => {
      const result = stringToDate("");
      expect(result).toBeUndefined();
    });

    it("should return undefined for unsupported format", () => {
      const result = stringToDate("2023-06-15");
      expect(result).toBeUndefined();
    });
  });

  describe("dateToString", () => {
    const testDate = new Date(2023, 5, 15, 14, 30, 22); // June 15, 2023 14:30:22

    it("should format date as DATE", () => {
      const result = dateToString(testDate, "DATE");
      expect(result).toBe("20230615");
    });

    it("should format date as DATETIME", () => {
      const result = dateToString(testDate, "DATETIME");
      expect(result).toBe("20230615143022");
    });

    it("should format date as TIME", () => {
      const result = dateToString(testDate, "TIME");
      expect(result).toBe("143022");
    });

    it("should handle single digit values with padding", () => {
      const singleDigitDate = new Date(2023, 0, 5, 9, 5, 2); // January 5, 2023 09:05:02
      expect(dateToString(singleDigitDate, "DATE")).toBe("20230105");
      expect(dateToString(singleDigitDate, "DATETIME")).toBe("20230105090502");
      expect(dateToString(singleDigitDate, "TIME")).toBe("090502");
    });

    it("should return empty string for unsupported type", () => {
      // @ts-ignore - Testing unsupported type
      const result = dateToString(testDate, "UNSUPPORTED");
      expect(result).toBe("");
    });
  });
});
