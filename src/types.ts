export type XapiValueType = string | number | Blob | null;

export interface Col {
  id: string;
  value: XapiValueType;
}

export interface Row {
  cols: Col[];
  orgRow?: Col[];
}

export interface Rows {
  rows: Row[];
}

export type ColumnType = "STRING" | "INT" | "FLOAT" | "DECIMAL" | "BIGDECIMAL" | "DATE" | "DATETIME" | "TIME" | "BLOB";

export interface Column {
  id: string;
  size: number;
  type: ColumnType;
}

export type ConstColumn = Column & { value: XapiValueType };

export interface ColumnInfo {
  constCols?: ConstColumn[];
  cols?: Column[];
}

export interface Parameter {
  id: string;
  type?: ColumnType;
  value?: XapiValueType;
}

export interface Parameters {
  params: Parameter[];
}

export interface XapiVersion {
  xmlns: string;
  version: string;
}
export const XplatformVersion = {
  xmlns: "http://www.tobesoft.com/platform/Dataset",
  version: "4000"
} as const;

export const NexaVersion = {
  xmlns: "http://www.nexacroplatform.com/platform/dataset",
  version: "4000"
} as const;

export interface XapiOptions {
  xapiVersion?: typeof XplatformVersion | typeof NexaVersion;
  castToColumnType?: boolean; // If true, will cast values to their respective column types
}