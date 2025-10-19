import { describe, expect, it } from "vitest";
import { ColumnType, ColumnTypeError, XapiRoot } from "../src";
import {
  StringWritableStream,
  _unescapeXml,
  arrayBufferToString,
  base64ToUint8Array,
  convertToColumnType,
  convertToString,
  dateToString,
  encodeControlChars,
  escapeXml,
  isXapiRoot,
  makeParseEntities,
  stringToDate,
  stringToReadableStream,
  uint8ArrayToBase64,
  XmlStringBuilder
} from "../src/utils";

describe("Utils Tests", () => {
  describe("makeParseEntities", () => {
    it("should create entities for parsing with correct format", () => {
      const entities = makeParseEntities();
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

    it("should return undefined for string length less than 6", () => {
      const result = stringToDate("123");
      expect(result).toBeUndefined();
    });

    it("should return undefined for string length greater than 16", () => {
      const result = stringToDate("20230615143022999");
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

  describe("StringWritableStream", () => {
    it("should write and get result correctly", async () => {
      const stream = new StringWritableStream();
      const writer = stream.getWriter();
      const encoder = new TextEncoder();

      await writer.write(encoder.encode("Hello"));
      await writer.write(encoder.encode(" World"));
      await writer.close();

      expect(stream.getResult()).toBe("Hello World");
    });

    it("should handle empty writes", async () => {
      const stream = new StringWritableStream();
      const writer = stream.getWriter();

      await writer.write(new Uint8Array());
      await writer.close();

      expect(stream.getResult()).toBe("");
    });
  });

  describe("stringToReadableStream", () => {
    it("should convert string to readable stream", async () => {
      const testString = "Hello ReadableStream";
      const stream = stringToReadableStream(testString);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let done, value;

      while (({ done, value } = await reader.read()) && !done) {
        result += decoder.decode(value);
      }

      expect(result).toBe(testString);
    });

    it("should handle empty string", async () => {
      const testString = "";
      const stream = stringToReadableStream(testString);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let done, value;

      while (({ done, value } = await reader.read()) && !done) {
        result += decoder.decode(value);
      }

      expect(result).toBe(testString);
    });
  });
  describe("string coversion functions", () => {
    it("convertToColumnType branch", async () => {
      expect(convertToColumnType("123", "INT")).toBe(123);
      expect(convertToColumnType("123", "BIGDECIMAL")).toBe(123); // BIGDECIMAL 케이스 추가
      expect(convertToColumnType("123.45", "FLOAT")).toBe(123.45);
      expect(convertToColumnType("123.45", "DECIMAL")).toBe(123.45); // DECIMAL 케이스 추가
      expect(convertToColumnType("20230615", "DATE")).toBeInstanceOf(Date);
      expect(convertToColumnType("20230615143022", "DATETIME")).toBeInstanceOf(Date);
      expect(convertToColumnType("143022", "TIME")).toBeInstanceOf(Date);
      expect(convertToColumnType("Hello", "STRING")).toBe("Hello");
      expect(convertToColumnType("SGVsbG8gV29ybGQ=", "BLOB")).toBeInstanceOf(Uint8Array);
      expect(convertToColumnType("Hello", "BLOB")).toBe("Hello");
      expect(() => convertToColumnType("123", "UNKNOWN" as ColumnType)).toThrow(ColumnTypeError); // Unsupported
    })

    it("convertToString branch", () => {
      // 숫자 타입들
      expect(convertToString(123, "INT")).toBe("123");
      expect(convertToString(123.45, "BIGDECIMAL")).toBe("123.45");
      expect(convertToString(123.45, "FLOAT")).toBe("123.45");
      expect(convertToString(123.45, "DECIMAL")).toBe("123.45");

      // 날짜/시간 타입들
      const date = new Date(2023, 5, 15, 14, 30, 22); // 2023-06-15 14:30:22
      expect(convertToString(date, "DATE")).toBe("20230615");
      expect(convertToString(date, "DATETIME")).toBe("20230615143022");
      expect(convertToString(date, "TIME")).toBe("143022");

      // BLOB 타입
      const uint8Array = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      expect(convertToString(uint8Array, "BLOB")).toBe(uint8ArrayToBase64(uint8Array));

      // STRING 및 default 케이스
      expect(convertToString("Hello", "STRING")).toBe("Hello");
      expect(convertToString("Hello", "UNKNOWN" as ColumnType)).toBe("Hello"); // default case
    })
  })

  describe("arrayBufferToString", () => {
    it("should convert ArrayBuffer to string", () => {
      const encoder = new TextEncoder();
      const buffer = encoder.encode("Hello World").buffer;
      const result = arrayBufferToString(buffer);
      expect(result).toBe("Hello World");
    });

    it("should handle empty ArrayBuffer", () => {
      const buffer = new ArrayBuffer(0);
      const result = arrayBufferToString(buffer);
      expect(result).toBe("");
    });
  })
  describe("_unescapeXml", () => {
    it("should unescape XML entities", () => {
      const input = `Test &#10;`;
      const expected = "Test \x0A";
      const result = _unescapeXml(input);
      expect(result).toBe(expected);
    });

    it("should handle empty string", () => {
      const input = "";
      const expected = "";
      const result = _unescapeXml(input);
      expect(result).toBe(expected);
    });

    it("should handle no entities", () => {
      const input = "Hello World";
      const expected = "Hello World";
      const result = _unescapeXml(input);
      expect(result).toBe(expected);
    });
    it("should handle undefined input", () => {
      const input = undefined;
      const expected = undefined;
      const result = _unescapeXml(input);
      expect(result).toBe(expected);
    });
  })
  describe("_unescapeXml additional tests", () => {
    it("should return undefined when input is undefined (unmatched condition)", () => {
      // Passing undefined to trigger "if (!str) return str"
      const result = _unescapeXml(undefined);
      expect(result).toBeUndefined();
    });

    it("should return empty string when input is an empty string (unmatched condition)", () => {
      // Passing an empty string to trigger the same branch
      const result = _unescapeXml("");
      expect(result).toBe("");
    });

    it("should unescape multiple XML entities in a single string", () => {
      const control1 = String.fromCharCode(1);
      const control5 = String.fromCharCode(5);
      const input = `Start &#1; middle &#5; end`;
      const expected = `Start ${control1} middle ${control5} end`;
      const result = _unescapeXml(input);
      expect(result).toBe(expected);
    });
  });
  describe("isXapiRoot test", () => {
    it("if XapiRoot then ok", () => {
      const root = new XapiRoot();
      const result = isXapiRoot(root);
      expect(result).toBe(true)
    })
    it("if not XapiRoot then false", () => {
      const root = {};
      const result = isXapiRoot(root);
      expect(result).toBe(false)
    })
  })

  describe("escapeXml", () => {
    it("should escape XML special characters", () => {
      expect(escapeXml("&")).toBe("&amp;");
      expect(escapeXml("<")).toBe("&lt;");
      expect(escapeXml(">")).toBe("&gt;");
      expect(escapeXml('"')).toBe("&quot;");
      expect(escapeXml("'")).toBe("&apos;");
    });

    it("should escape multiple special characters", () => {
      expect(escapeXml("<div class=\"test\">Hello & goodbye</div>")).toBe(
        "&lt;div class=&quot;test&quot;&gt;Hello &amp; goodbye&lt;/div&gt;"
      );
    });

    it("should handle strings with no special characters", () => {
      expect(escapeXml("Hello World")).toBe("Hello World");
    });

    it("should handle empty string", () => {
      expect(escapeXml("")).toBe("");
    });
  });

  describe("encodeControlChars", () => {
    it("should encode control characters except whitespace", () => {
      const input = String.fromCharCode(1) + "test" + String.fromCharCode(5);
      const expected = "&#1;test&#5;";
      expect(encodeControlChars(input)).toBe(expected);
    });

    it("should NOT encode space character (0x20)", () => {
      const input = "hello world";
      const expected = "hello world";
      expect(encodeControlChars(input)).toBe(expected);
    });

    it("should NOT encode tab and newline characters", () => {
      const input = "line1\tline2\nline3\rline4";
      const expected = "line1\tline2\nline3\rline4";
      expect(encodeControlChars(input)).toBe(expected);
    });

    it("should encode non-whitespace control characters", () => {
      // Test 0x01-0x08 range
      const input1 = String.fromCharCode(1) + String.fromCharCode(8);
      expect(encodeControlChars(input1)).toBe("&#1;&#8;");

      // Test 0x0B-0x0C range (excluding 0x09, 0x0A, 0x0D)
      const input2 = String.fromCharCode(11) + String.fromCharCode(12);
      expect(encodeControlChars(input2)).toBe("&#11;&#12;");

      // Test 0x0E-0x1F range
      const input3 = String.fromCharCode(14) + String.fromCharCode(31);
      expect(encodeControlChars(input3)).toBe("&#14;&#31;");
    });

    it("should not encode regular characters", () => {
      const input = "ABCabc123";
      const expected = "ABCabc123";
      expect(encodeControlChars(input)).toBe(expected);
    });

    it("should handle empty string", () => {
      expect(encodeControlChars("")).toBe("");
    });
  });

  describe("XmlStringBuilder", () => {
    it("should write XML declaration", () => {
      const builder = new XmlStringBuilder();
      builder.writeDeclaration();
      const xml = builder.toString();
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it("should write start and end elements", () => {
      const builder = new XmlStringBuilder();
      builder.writeStartElement("root");
      builder.writeEndElement("root");
      const xml = builder.toString();
      expect(xml).toContain("<root>");
      expect(xml).toContain("</root>");
    });

    it("should write elements with attributes", () => {
      const builder = new XmlStringBuilder();
      builder.writeStartElement("element", { id: "test", name: "value" });
      builder.writeEndElement("element");
      const xml = builder.toString();
      expect(xml).toContain('id="test"');
      expect(xml).toContain('name="value"');
    });

    it("should write self-closing elements", () => {
      const builder = new XmlStringBuilder();
      builder.writeStartElement("element", { id: "test" }, true);
      const xml = builder.toString();
      expect(xml).toContain('<element id="test"/>');
    });

    it("should write element with text content", () => {
      const builder = new XmlStringBuilder();
      builder.writeElementWithText("element", { id: "test" }, "Hello World");
      const xml = builder.toString();
      expect(xml).toContain('<element id="test">Hello World</element>');
    });

    it("should handle indentation correctly", () => {
      const builder = new XmlStringBuilder();
      builder.writeStartElement("root");
      builder.writeStartElement("child");
      builder.writeEndElement("child");
      builder.writeEndElement("root");
      const xml = builder.toString();
      const lines = xml.split('\n');
      expect(lines[0]).toBe("<root>");
      expect(lines[1]).toBe("  <child>");
      expect(lines[2]).toBe("  </child>");
      expect(lines[3]).toBe("</root>");
    });

    it("should escape XML special characters in attributes", () => {
      const builder = new XmlStringBuilder();
      builder.writeStartElement("element", { value: "<test & \"value\">" }, true);
      const xml = builder.toString();
      expect(xml).toContain('&lt;test &amp; &quot;value&quot;&gt;');
    });

    it("should escape XML special characters in text content", () => {
      const builder = new XmlStringBuilder();
      builder.writeElementWithText("element", undefined, "<test & value>");
      const xml = builder.toString();
      expect(xml).toContain('&lt;test &amp; value&gt;');
    });

    it("should NOT encode whitespace in attributes", () => {
      const builder = new XmlStringBuilder();
      const value = "test\nvalue\ttab";
      builder.writeStartElement("element", { content: value }, true);
      const xml = builder.toString();
      expect(xml).toContain('content="test\nvalue\ttab"');
    });

    it("should encode non-whitespace control characters in attributes", () => {
      const builder = new XmlStringBuilder();
      const value = "test" + String.fromCharCode(5) + "value";
      builder.writeStartElement("element", { content: value }, true);
      const xml = builder.toString();
      expect(xml).toContain('&#5;');
    });

    it("should encode non-whitespace control characters in text content", () => {
      const builder = new XmlStringBuilder();
      const text = "line1" + String.fromCharCode(5) + "line2";
      builder.writeElementWithText("element", undefined, text);
      const xml = builder.toString();
      expect(xml).toContain('&#5;');
    });

    it("should write nested structure with proper indentation", () => {
      const builder = new XmlStringBuilder();
      builder.writeDeclaration();
      builder.writeStartElement("root", { version: "1.0" });
      builder.writeStartElement("level1");
      builder.writeStartElement("level2");
      builder.writeElementWithText("level3", { id: "test" }, "content");
      builder.writeEndElement("level2");
      builder.writeEndElement("level1");
      builder.writeEndElement("root");
      const xml = builder.toString();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<root version="1.0">');
      expect(xml).toContain('  <level1>');
      expect(xml).toContain('    <level2>');
      expect(xml).toContain('      <level3 id="test">content</level3>');
      expect(xml).toContain('    </level2>');
      expect(xml).toContain('  </level1>');
      expect(xml).toContain('</root>');
    });
  });
});
