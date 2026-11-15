/**
 * Scalar conversion of the original XPLATFORM and Nexacro Java drivers.
 *
 * The drivers convert every scalar lexical through StringTypeConverter, in
 * both directions. These functions reproduce it and the Java toString forms of
 * the results.
 */

const JAVA_INTEGER = /^[+-]?\d+$/;
const JAVA_HEX_INT = /^[+-]?[0-9a-fA-F]+$/;
const JAVA_BIG_DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const JAVA_DOUBLE = /^[+-]?(?:NaN|Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?)$/;
const JAVA_HEX_DOUBLE = /^([+-]?)0[xX]([0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)[pP]([+-]?\d+)[fFdD]?$/;

function removeGroupingSeparator(value: string): string {
  return value.replace(/,/g, "");
}

/** Java String.trim: removes characters up to U+0020 at both ends. */
function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start++;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
  return value.slice(start, end);
}

/**
 * StringTypeConverter.needTrim: trims only when the value starts or ends with
 * a space, and then like String.trim.
 */
function javaTrimIfSpace(value: string): string {
  if (value === "" || value[0] !== " " && value[value.length - 1] !== " ") return value;
  return javaTrim(value);
}

/** Parses the BigDecimal(String) grammar into an unscaled value and a scale. */
function parseJavaBigDecimal(value: string): { unscaled: bigint; scale: number } | undefined {
  if (!JAVA_BIG_DECIMAL.test(value)) return undefined;
  let mantissa = value;
  let exponent = 0;
  const at = value.search(/[eE]/);
  if (at >= 0) {
    exponent = Number(value.slice(at + 1));
    if (!Number.isSafeInteger(exponent)) return undefined;
    mantissa = value.slice(0, at);
  }
  const dot = mantissa.indexOf(".");
  const integer = dot < 0 ? mantissa : mantissa.slice(0, dot);
  const fraction = dot < 0 ? "" : mantissa.slice(dot + 1);
  const digits = integer + fraction;
  const sign = digits[0] === "-" ? -1n : 1n;
  const body = digits.replace(/^[+-]/, "");
  if (body === "") return undefined;
  return { unscaled: sign * BigInt(body), scale: fraction.length - exponent };
}

/** StringTypeConverter.toInt (32 bits) or toLong (64 bits) as a decimal string. */
export function javaInteger(source: string, bits: 32 | 64): string {
  if (source === "") return "0";
  const value = removeGroupingSeparator(javaTrimIfSpace(source));
  if (!value.includes(".")) {
    if (bits === 32 && (value.startsWith("0x") || value.startsWith("0X"))) {
      const hex = value.slice(2);
      if (!JAVA_HEX_INT.test(hex)) return "0";
      const negative = hex[0] === "-";
      const parsed = BigInt(`0x${hex.replace(/^[+-]/, "")}`) * (negative ? -1n : 1n);
      return parsed < -2147483648n || parsed > 2147483647n ? "0" : parsed.toString();
    }
    if (!JAVA_INTEGER.test(value)) return "0";
    const parsed = BigInt(value.replace(/^\+/, ""));
    const limit = 1n << BigInt(bits - 1);
    return parsed < -limit || parsed >= limit ? "0" : parsed.toString();
  }
  const decimal = parseJavaBigDecimal(value);
  if (!decimal) return "0";
  // BigDecimal.intValue/longValue: truncate toward zero, keep the low bits.
  let integer = decimal.unscaled;
  if (decimal.scale > 0) integer /= 10n ** BigInt(decimal.scale);
  else if (decimal.scale < 0) integer *= 10n ** BigInt(-decimal.scale);
  return BigInt.asIntN(bits, integer).toString();
}

/**
 * StringTypeConverter.toBigDecimal followed by BigDecimal.toString;
 * undefined where the driver yields null.
 */
export function javaBigDecimal(source: string): string | undefined {
  if (source === "") return undefined;
  const decimal = parseJavaBigDecimal(removeGroupingSeparator(source));
  if (!decimal) return undefined;
  const { unscaled, scale } = decimal;
  const sign = unscaled < 0n ? "-" : "";
  const digits = (unscaled < 0n ? -unscaled : unscaled).toString();
  const adjusted = -scale + digits.length - 1;
  if (scale === 0) return sign + digits;
  if (scale > 0 && adjusted >= -6) {
    if (digits.length <= scale) return `${sign}0.${"0".repeat(scale - digits.length)}${digits}`;
    return `${sign}${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  }
  let out = sign + digits[0];
  if (digits.length > 1) out += `.${digits.slice(1)}`;
  return `${out}E${adjusted >= 0 ? "+" : ""}${adjusted}`;
}

/** Parses a Java hexadecimal floating-point literal. */
function parseHexDouble(match: RegExpExecArray): number {
  const [, sign, mantissa, exponentText] = match;
  const dot = mantissa.indexOf(".");
  const hex = mantissa.replace(".", "") || "0";
  const fractionDigits = dot < 0 ? 0 : mantissa.length - dot - 1;
  const magnitude = Number(BigInt(`0x${hex}`)) * 2 ** (Number(exponentText) - 4 * fractionDigits);
  return sign === "-" ? -magnitude : magnitude;
}

/**
 * StringTypeConverter.toDouble (64 bits) or toFloat (32 bits) followed by
 * Double.toString or Float.toString.
 */
export function javaFloating(source: string, bits: 32 | 64): string {
  const value = javaTrim(removeGroupingSeparator(source));
  let x: number;
  if (JAVA_DOUBLE.test(value)) {
    const text = value.replace(/[fFdD]$/, "");
    if (text.endsWith("Infinity")) x = text.startsWith("-") ? -Infinity : Infinity;
    else if (text.endsWith("NaN")) x = NaN;
    else x = Number(text);
  } else {
    const hex = JAVA_HEX_DOUBLE.exec(value);
    if (!hex) return javaFloatString(0, bits);
    x = parseHexDouble(hex);
  }
  return javaFloatString(bits === 32 ? Math.fround(x) : x, bits);
}

/** The shortest digits that identify x as a double or a float, and the decimal exponent. */
function shortestDigits(x: number, bits: 32 | 64): { digits: string; exponent: number } {
  let text = x.toExponential();
  if (bits === 32) {
    for (let precision = 1; precision <= 9; precision++) {
      const candidate = x.toExponential(precision - 1);
      if (Math.fround(Number(candidate)) === x) {
        text = candidate;
        break;
      }
    }
  }
  const [mantissa, exponent] = text.split("e");
  return { digits: mantissa.replace(".", ""), exponent: Number(exponent) };
}

/**
 * Formats like Double.toString (64 bits) or Float.toString (32 bits) on JDK 19
 * and later, which print the shortest uniquely identifying digits.
 */
export function javaFloatString(value: number, bits: 32 | 64): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
  const sign = value < 0 ? "-" : "";
  const x = Math.abs(value);
  const { digits, exponent } = shortestDigits(x, bits);
  if (x >= 1e-3 && x < 1e7) {
    if (exponent >= 0) {
      if (digits.length <= exponent + 1) return `${sign}${digits}${"0".repeat(exponent + 1 - digits.length)}.0`;
      return `${sign}${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`;
    }
    return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
  }
  return `${sign}${digits[0]}.${digits.length > 1 ? digits.slice(1) : "0"}E${exponent}`;
}

/**
 * StringTypeConverter.toDate/toTime/toDateTime as epoch milliseconds (UTC):
 * the length picks the layout (17 yyyyMMddHHmmssSSS, 14 yyyyMMddHHmmss,
 * 8 yyyyMMdd, 9 HHmmssSSS, 6 HHmmss; anything else is null), each field is
 * read as (char - '0') arithmetic, and a lenient calendar normalizes overflow.
 * DATE drops the time, TIME moves to 1970-01-01. A time-only lexical read as
 * DATE or DATETIME lands on the driver's current date, which is not
 * reproducible; 1970-01-01 is used.
 */
export function javaDate(value: string, type: string): number | undefined {
  const field = (offset: number, length: number): number => {
    let n = 0;
    for (let index = offset; index < offset + length; index++) n = n * 10 + value.charCodeAt(index) - 48;
    return n;
  };
  let year = 1970, month = 1, day = 1, hour = 0, minute = 0, second = 0, millis = 0;
  switch (value.length) {
    case 17:
      year = field(0, 4); month = field(4, 2); day = field(6, 2);
      hour = field(8, 2); minute = field(10, 2); second = field(12, 2); millis = field(14, 3);
      break;
    case 14:
      year = field(0, 4); month = field(4, 2); day = field(6, 2);
      hour = field(8, 2); minute = field(10, 2); second = field(12, 2);
      break;
    case 8:
      year = field(0, 4); month = field(4, 2); day = field(6, 2);
      break;
    case 9:
      hour = field(0, 2); minute = field(2, 2); second = field(4, 2); millis = field(6, 3);
      break;
    case 6:
      hour = field(0, 2); minute = field(2, 2); second = field(4, 2);
      break;
    default:
      return undefined;
  }
  const date = new Date(0);
  // setUTCFullYear keeps years 0-99 as they are, unlike Date.UTC.
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millis);
  const upper = type.toUpperCase();
  if (upper === "DATE") date.setUTCHours(0, 0, 0, 0);
  else if (upper === "TIME") {
    const clock = date.getTime() - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    date.setTime(0);
    date.setUTCFullYear(1970, 0, 1);
    date.setTime(date.getTime() + clock);
  }
  return date.getTime();
}

function pad(value: number, width: number): string {
  const text = String(Math.abs(value)).padStart(width, "0");
  return value < 0 ? `-${text.slice(1).padStart(width - 1, "0")}` : text;
}

/** Formats epoch milliseconds (UTC) like DatetimeFormat for the type; the year is never cut. */
export function formatJavaDate(millis: number, type: string): string {
  const date = new Date(millis);
  const datePart = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`;
  const clock = `${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}${pad(date.getUTCMilliseconds(), 3)}`;
  const upper = type.toUpperCase();
  if (upper === "DATE") return datePart;
  if (upper === "TIME") return clock;
  return datePart + clock;
}

/** A date lexical as the driver reads and writes it; undefined where the driver yields null. */
export function javaDateLexical(value: string, type: string): string | undefined {
  const millis = javaDate(value, type);
  return millis === undefined ? undefined : formatJavaDate(millis, type);
}

/** The values the drivers read as a true BOOLEAN. */
export function sourceBoolean(value: string): boolean {
  switch (value) {
    case "true": case "True": case "TRUE":
    case "yes": case "Yes": case "YES":
    case "y": case "Y":
    case "on": case "On": case "ON":
    case "1":
      return true;
    default:
      return false;
  }
}
