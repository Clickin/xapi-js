import { Dataset, XapiRoot } from "./xapi-data";
import { ColumnType, RowType, XapiValueType } from "./types";
import { convertToColumnType } from "./utils";

export type XapiTypeMap = {
  STRING: string;
  INT: number;
  LONG: number;
  FLOAT: number;
  DOUBLE: number;
  DECIMAL: number;
  BIGDECIMAL: number;
  BIG_DECIMAL: number;
  BOOLEAN: boolean;
  DATE: Date;
  DATETIME: Date;
  DATE_TIME: Date;
  TIME: Date;
  BLOB: Uint8Array;
};

export interface XapiColumnSchema<T extends ColumnType = ColumnType, Optional extends boolean = boolean> {
  readonly kind: "xapi-column";
  readonly type: T;
  readonly size: number;
  readonly optional: Optional;
}

export type XapiColumns = Record<string, XapiColumnSchema>;

export interface XapiDatasetSchema<Columns extends XapiColumns = XapiColumns> {
  readonly kind: "xapi-dataset";
  readonly columns: Columns;
}

export type XapiDatasets = Record<string, XapiDatasetSchema>;

export interface XapiRootSchema<
  Datasets extends XapiDatasets = XapiDatasets,
  Parameters extends XapiColumns = XapiColumns,
> {
  readonly kind: "xapi-root";
  readonly datasets: Datasets;
  readonly parameters: Parameters;
}

export interface XapiOperation<
  Request extends XapiRootSchema = XapiRootSchema,
  Response extends XapiRootSchema = XapiRootSchema,
> {
  readonly kind: "xapi-operation";
  readonly request: Request;
  readonly response: Response;
}

type RequiredColumnKeys<Columns extends XapiColumns> = {
  [Key in keyof Columns]-?: Columns[Key]["optional"] extends true ? never : Key;
}[keyof Columns];

type OptionalColumnKeys<Columns extends XapiColumns> = {
  [Key in keyof Columns]-?: Columns[Key]["optional"] extends true ? Key : never;
}[keyof Columns];

export type InferColumns<Columns extends XapiColumns> = {
  [Key in RequiredColumnKeys<Columns>]: XapiTypeMap[Columns[Key]["type"]];
} & {
  [Key in OptionalColumnKeys<Columns>]?: XapiTypeMap[Columns[Key]["type"]];
};

/**
 * A schema row remains assignable from the old plain object shape, while
 * retaining the Nexacro row metadata when an operation needs it.
 */
export type InferDatasetRow<Schema extends XapiDatasetSchema> = InferColumns<Schema["columns"]> & {
  $rowType?: RowType;
  $orgRow?: Partial<InferColumns<Schema["columns"]>>;
};

export type InferDataset<Schema extends XapiDatasetSchema> = InferDatasetRow<Schema>[];

type EncodedRow = Record<string, XapiValueType> & {
  $rowType?: RowType;
  $orgRow?: Record<string, XapiValueType>;
};

export type InferRoot<Schema extends XapiRootSchema> = {
  parameters: InferColumns<Schema["parameters"]>;
  datasets: {
    [Key in keyof Schema["datasets"]]: InferDataset<Schema["datasets"][Key]>;
  };
};

export type RequestOf<Operation extends XapiOperation> = InferRoot<Operation["request"]>;
export type ResponseOf<Operation extends XapiOperation> = InferRoot<Operation["response"]>;

type CompiledColumn = readonly [string, XapiColumnSchema];
type CompiledDatasetSchema = {
  id: string;
  columns: CompiledColumn[];
  columnMap: Map<string, XapiColumnSchema>;
};

type CompiledSchema = {
  parameters: CompiledColumn[];
  datasets: CompiledDatasetSchema[];
};

const schemaCache = new WeakMap<object, CompiledSchema>();

function compileSchema(schema: XapiRootSchema): CompiledSchema {
  const cached = schemaCache.get(schema);
  if (cached) return cached;
  const parameterIds = Object.keys(schema.parameters);
  const parameters = new Array<CompiledColumn>(parameterIds.length);
  for (let index = 0; index < parameterIds.length; index++) {
    const id = parameterIds[index];
    parameters[index] = [id, schema.parameters[id]];
  }
  const datasetIds = Object.keys(schema.datasets);
  const datasets = new Array<CompiledDatasetSchema>(datasetIds.length);
  for (let datasetIndex = 0; datasetIndex < datasetIds.length; datasetIndex++) {
    const id = datasetIds[datasetIndex];
    const sourceColumns = schema.datasets[id].columns;
    const columnIds = Object.keys(sourceColumns);
    const columns = new Array<CompiledColumn>(columnIds.length);
    const columnMap = new Map<string, XapiColumnSchema>();
    for (let columnIndex = 0; columnIndex < columnIds.length; columnIndex++) {
      const columnId = columnIds[columnIndex];
      const column = sourceColumns[columnId];
      columns[columnIndex] = [columnId, column];
      columnMap.set(columnId, column);
    }
    datasets[datasetIndex] = { id, columns, columnMap };
  }
  const compiled: CompiledSchema = { parameters, datasets };
  schemaCache.set(schema, compiled);
  return compiled;
}

const defaultSizes: Record<ColumnType, number> = {
  STRING: 256,
  INT: 10,
  LONG: 19,
  FLOAT: 20,
  DOUBLE: 20,
  DECIMAL: 20,
  BIGDECIMAL: 30,
  BIG_DECIMAL: 30,
  BOOLEAN: 5,
  DATE: 8,
  DATETIME: 17,
  DATE_TIME: 17,
  TIME: 6,
  BLOB: 1000,
};

type ColumnOptions<Optional extends boolean> = {
  size?: number;
  optional?: Optional;
};

function column<const Type extends ColumnType, const Optional extends boolean = false>(
  type: Type,
  options: ColumnOptions<Optional> = {},
): XapiColumnSchema<Type, Optional> {
  return {
    kind: "xapi-column",
    type,
    size: options.size ?? defaultSizes[type],
    optional: (options.optional ?? false) as Optional,
  };
}

export function defineDataset<const Columns extends XapiColumns>(columns: Columns): XapiDatasetSchema<Columns> {
  return { kind: "xapi-dataset", columns };
}

export function defineRoot<
  const Datasets extends XapiDatasets,
  const Parameters extends XapiColumns = Record<never, never>,
>(definition: { datasets: Datasets; parameters?: Parameters }): XapiRootSchema<Datasets, Parameters> {
  return {
    kind: "xapi-root",
    datasets: definition.datasets,
    parameters: definition.parameters ?? ({} as Parameters),
  };
}

export function defineOperation<
  const Request extends XapiRootSchema,
  const Response extends XapiRootSchema,
>(definition: { request: Request; response: Response }): XapiOperation<Request, Response> {
  return { kind: "xapi-operation", request: definition.request, response: definition.response };
}

export const xapi = {
  string: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("STRING", options),
  int: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("INT", options),
  long: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("LONG", options),
  float: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("FLOAT", options),
  double: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("DOUBLE", options),
  decimal: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("DECIMAL", options),
  bigdecimal: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("BIGDECIMAL", options),
  bigDecimal: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("BIG_DECIMAL", options),
  boolean: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("BOOLEAN", options),
  date: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("DATE", options),
  datetime: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("DATETIME", options),
  dateTime: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("DATE_TIME", options),
  time: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("TIME", options),
  blob: <const Optional extends boolean = false>(options?: ColumnOptions<Optional>) => column("BLOB", options),
  dataset: defineDataset,
  root: defineRoot,
  operation: defineOperation,
} as const;

export function encodeRoot<Schema extends XapiRootSchema>(schema: Schema, value: InferRoot<Schema>): XapiRoot {
  const root = new XapiRoot();
  const compiled = compileSchema(schema);

  for (let parameterIndex = 0; parameterIndex < compiled.parameters.length; parameterIndex++) {
    const parameter = compiled.parameters[parameterIndex];
    const id = parameter[0];
    const parameterSchema = parameter[1];
    const parameterValue = value.parameters[id as keyof typeof value.parameters] as XapiValueType;
    if (parameterValue !== undefined || !parameterSchema.optional) root.addParameter({ id, type: parameterSchema.type, value: parameterValue, rawValue: undefined });
  }

  for (let datasetIndex = 0; datasetIndex < compiled.datasets.length; datasetIndex++) {
    const datasetDefinition = compiled.datasets[datasetIndex];
    const datasetId = datasetDefinition.id;
    const dataset = new Dataset(datasetId);
    for (let columnIndex = 0; columnIndex < datasetDefinition.columns.length; columnIndex++) {
      const definition = datasetDefinition.columns[columnIndex];
      const columnSchema = definition[1];
      dataset.addColumn({ id: definition[0], type: columnSchema.type, size: columnSchema.size });
    }

    const rows = value.datasets[datasetId as keyof typeof value.datasets] as EncodedRow[];
    for (let sourceRowIndex = 0; sourceRowIndex < rows.length; sourceRowIndex++) {
      const sourceRow = rows[sourceRowIndex];
      const rowIndex = dataset.newRow();
      dataset.rows[rowIndex].type = sourceRow.$rowType;
      for (let columnIndex = 0; columnIndex < datasetDefinition.columns.length; columnIndex++) {
        const id = datasetDefinition.columns[columnIndex][0];
        dataset.setColumn(rowIndex, id, sourceRow[id]);
      }
      if (sourceRow.$orgRow) {
        const originalIds = Object.keys(sourceRow.$orgRow);
        const original = new Array(originalIds.length);
        for (let columnIndex = 0; columnIndex < originalIds.length; columnIndex++) {
          const id = originalIds[columnIndex];
          original[columnIndex] = { id, value: sourceRow.$orgRow[id], rawValue: undefined };
        }
        dataset.rows[rowIndex].orgRow = original;
      }
    }
    root.addDataset(dataset);
  }

  return root;
}

export function decodeRoot<Schema extends XapiRootSchema>(schema: Schema, root: XapiRoot): InferRoot<Schema> {
  const compiled = compileSchema(schema);
  const parameters: Record<string, XapiValueType> = {};
  for (let parameterIndex = 0; parameterIndex < compiled.parameters.length; parameterIndex++) {
    const definition = compiled.parameters[parameterIndex];
    const id = definition[0];
    const parameter = root.getParameter(id);
    const value = parameter?.rawValue !== undefined ? parameter.rawValue : parameter?.value;
    if (value !== undefined) parameters[id] = convertToColumnType(value, definition[1].type);
  }

  const datasets: Record<string, EncodedRow[]> = {};
  for (let datasetIndex = 0; datasetIndex < compiled.datasets.length; datasetIndex++) {
    const datasetDefinition = compiled.datasets[datasetIndex];
    const datasetId = datasetDefinition.id;
    const dataset = root.getDataset(datasetId);
    if (!dataset) {
      datasets[datasetId] = [];
      continue;
    }

    const constants: Record<string, XapiValueType> = {};
    const sourceConstants = dataset.getConstColumns();
    for (let columnIndex = 0; columnIndex < sourceConstants.length; columnIndex++) constants[sourceConstants[columnIndex].id] = sourceConstants[columnIndex].value;
    const sourceRows = dataset.getRows();
    const rows = new Array<EncodedRow>(sourceRows.length);
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex++) {
      const row = sourceRows[rowIndex];
      const value: EncodedRow = { ...constants };
      for (let columnIndex = 0; columnIndex < row.cols.length; columnIndex++) {
        const column = row.cols[columnIndex];
        const columnSchema = datasetDefinition.columnMap.get(column.id);
        if (columnSchema) {
          const rawValue = column.rawValue !== undefined ? column.rawValue : column.value;
          value[column.id] = rawValue === undefined ? undefined : convertToColumnType(rawValue, columnSchema.type);
        }
      }
      if (row.type) value.$rowType = row.type;
      if (row.orgRow) {
        const original: Record<string, XapiValueType> = {};
        for (let columnIndex = 0; columnIndex < row.orgRow.length; columnIndex++) {
          const column = row.orgRow[columnIndex];
          const columnSchema = datasetDefinition.columnMap.get(column.id);
          if (!columnSchema) continue;
          const rawValue = column.rawValue !== undefined ? column.rawValue : column.value;
          original[column.id] = rawValue === undefined ? undefined : convertToColumnType(rawValue, columnSchema.type);
        }
        value.$orgRow = original;
      }
      rows[rowIndex] = value;
    }
    datasets[datasetId] = rows;
  }

  return { parameters, datasets } as InferRoot<Schema>;
}
