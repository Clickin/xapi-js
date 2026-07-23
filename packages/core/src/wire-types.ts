export const wireProfiles = [
  "nexacro-json-1.0",
  "nexacro-xml-4000",
  "xplatform-xml-4000",
  "nexacro-ssv",
  "xplatform-ssv",
  "nexacro-binary-5000",
  "xplatform-binary-5000",
] as const;

export type WireProfile = (typeof wireProfiles)[number];
export type CellState = "value" | "missing" | "null" | "empty";
export type CanonicalRowType = "N" | "I" | "U" | "D" | "O";
export type SaveType = 0 | 1 | 2 | 3 | 4 | 5;

export interface CanonicalCell {
  state: CellState;
  lexical?: string;
}

export interface CanonicalParameter extends CanonicalCell {
  id: string;
  type: string;
  index?: number;
  wire?: Record<string, unknown>;
}

export interface CanonicalColumn {
  id: string;
  type: string;
  index: number;
  size?: string;
  encoding?: string;
  prop?: string;
  sumtext?: string;
}

export interface CanonicalConstColumn {
  id: string;
  type: string;
  index?: number;
  value?: CanonicalCell;
  size?: string;
  encoding?: string;
}

export interface CanonicalRow {
  type: CanonicalRowType;
  orgRow?: CanonicalRow | null;
  values: Record<string, CanonicalCell>;
}

export interface CanonicalDataset {
  id: string;
  columns: CanonicalColumn[];
  constColumns: CanonicalConstColumn[];
  rows: CanonicalRow[];
  saveType?: SaveType;
  wire?: Record<string, unknown>;
}

export interface CanonicalValue {
  parameters: CanonicalParameter[];
  datasets: CanonicalDataset[];
  saveType?: SaveType;
  wire?: Record<string, unknown>;
}

export interface WireLimits {
  payloadBytes?: number;
  datasets?: number;
  rows?: number;
  columns?: number;
  scalarBytes?: number;
  blobBytes?: number;
}

export interface WireCodecOptions {
  strict?: boolean;
  zlib?: boolean;
  base64Whitespace?: boolean;
  ssvUnitSeparator?: string;
  ssvRecordSeparator?: string;
  limits?: WireLimits;
}

export type WireErrorClass = "invalid-request" | "unsupported-operation" | "unsupported-profile" | "malformed-input" | "invalid-value" | "limit-exceeded" | "internal";

export class WireCodecError extends Error {
  readonly class: WireErrorClass;
  readonly path?: string;

  constructor(errorClass: WireErrorClass, message: string, path?: string) {
    super(message);
    this.name = "WireCodecError";
    this.class = errorClass;
    this.path = path;
  }
}
