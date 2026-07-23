import { deflate, inflate } from "pako";
import { decodeBinaryWire, encodeBinaryWire } from "./binary-wire";
import { decodeJsonWire, encodeJsonWire } from "./json-wire";
import { decodeSsvWire, encodeSsvWire } from "./ssv-wire";
import type { CanonicalValue, WireCodecOptions, WireProfile } from "./wire-types";
import { WireCodecError } from "./wire-types";
import { decodeXmlWire, encodeXmlWire } from "./xml-wire";

function unpackTransport(source: Uint8Array): Uint8Array {
  if (source[0] !== 0xff || source[1] !== 0xad) return source;
  try {
    return inflate(source.subarray(2));
  } catch (error) {
    throw new WireCodecError("malformed-input", error instanceof Error ? error.message : String(error), "wire");
  }
}

export function decodeWire(source: Uint8Array, profile: WireProfile, options: WireCodecOptions = {}): CanonicalValue {
  const bytes = unpackTransport(source);
  if (profile === "nexacro-binary-5000" || profile === "xplatform-binary-5000") return decodeBinaryWire(bytes, profile);
  if (profile === "nexacro-ssv" || profile === "xplatform-ssv") return decodeSsvWire(bytes, profile, options);
  const text = new TextDecoder().decode(bytes);
  if (profile === "nexacro-json-1.0") return decodeJsonWire(text, options);
  return decodeXmlWire(text, profile, options);
}

export function encodeWire(value: CanonicalValue, profile: WireProfile, options: WireCodecOptions = {}): Uint8Array {
  let bytes: Uint8Array;
  if (profile === "nexacro-binary-5000" || profile === "xplatform-binary-5000") bytes = encodeBinaryWire(value, profile);
  else if (profile === "nexacro-ssv" || profile === "xplatform-ssv") bytes = encodeSsvWire(value, profile);
  else {
    const text = profile === "nexacro-json-1.0" ? encodeJsonWire(value) : encodeXmlWire(value, profile);
    bytes = new TextEncoder().encode(text);
  }
  if (!options.zlib) return bytes;
  const compressed = deflate(bytes);
  const output = new Uint8Array(compressed.length + 2);
  output[0] = 0xff;
  output[1] = 0xad;
  output.set(compressed, 2);
  return output;
}

export function roundtripWire(source: Uint8Array, profile: WireProfile, options: WireCodecOptions = {}): { value: CanonicalValue; output: Uint8Array } {
  const value = decodeWire(source, profile, options);
  return { value, output: encodeWire(value, profile, options) };
}
