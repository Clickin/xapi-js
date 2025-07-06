/**
 * Represents the possible data types for X-API values.
 */
export type XapiValueType = string | number | Uint8Array | Date | undefined;

/**
 * Represents a column within a row of an X-API dataset.
 */
export interface Col {
  /** The ID of the column. */
  id: string;
  /** The value of the column. */
  value?: XapiValueType;
}

/**
 * Defines the possible types of rows in an X-API dataset (e.g., "insert", "update", "delete").
 */
export const rowType = ["insert", "update", "delete"] as const;

/**
 * Type representing the operation performed on a row.
 */
export type RowType = (typeof rowType)[number];

/**
 * Represents a row in an X-API dataset.
 */
export interface Row {
  /** An array of columns in the row. */
  cols: Col[];
  /** An optional array of original columns for update/delete operations. */
  orgRow?: Col[];
  /** The type of operation for the row (e.g., "insert", "update", "delete"). */
  type?: RowType;
}

/**
 * Represents a collection of rows in an X-API dataset.
 */
export interface Rows {
  /** An array of rows. */
  rows: Row[];
}

/**
 * Defines the possible data types for columns in an X-API dataset.
 */
export const columnType = ["STRING", "INT", "FLOAT", "DECIMAL", "BIGDECIMAL", "DATE", "DATETIME", "TIME", "BLOB"] as const;

/**
 * Type representing the data type of a column.
 */
export type ColumnType = (typeof columnType)[number];

/**
 * Represents a column definition in an X-API dataset.
 */
export interface Column {
  /** The ID of the column. */
  id: string;
  /** The size of the column. */
  size: number;
  /** The data type of the column. */
  type: ColumnType;
}

/**
 * Represents a constant column definition, extending a regular column with a default value.
 */
export type ConstColumn = Column & { value: XapiValueType };

/**
 * Represents the column information section of an X-API dataset.
 */
export interface ColumnInfo {
  /** Optional array of constant column definitions. */
  constCols?: ConstColumn[];
  /** Optional array of regular column definitions. */
  cols?: Column[];
}

/**
 * Represents a parameter in an X-API request/response.
 */
export interface Parameter {
  /** The ID of the parameter. */
  id: string;
  /** The data type of the parameter. */
  type?: ColumnType;
  /** The value of the parameter. */
  value?: XapiValueType;
}

/**
 * Represents a collection of parameters in an X-API request/response.
 */
export interface XapiParameters {
  /** An array of parameters. */
  params: Parameter[];
}

/**
 * Defines the XML namespace and version for X-API.
 */
export interface XapiVersion {
  /** The XML namespace URI. */
  xmlns: string;
  /** The version string. */
  version: string;
}

/**
 * Xplatform version definition for X-API XML.
 */
export const XplatformVersion = {
  xmlns: "http://www.tobesoft.com/platform/Dataset",
  version: "4000"
} as const;

/**
 * Nexacro version definition for X-API XML.
 */
export const NexaVersion = {
  xmlns: "http://www.nexacroplatform.com/platform/dataset",
  version: "4000"
} as const;

/**
 * Options for X-API processing.
 */
export interface XapiOptions {
  /** The X-API version to use (e.g., XplatformVersion or NexaVersion). */
  xapiVersion?: typeof XplatformVersion | typeof NexaVersion;
  /** Whether to parse values to their specific types (true) or keep them as strings (false). */
  parseToTypes?: boolean;
}

/**
 * Custom error class for column type related issues.
 */
export class ColumnTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColumnTypeError";
  }
}

export class InvalidXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidXmlError";
  }
}