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

type CompiledDatasetSchema = {
  columns: Map<string, XapiColumnSchema>;
};

type CompiledSchema = {
  parameters: Map<string, XapiColumnSchema>;
  datasets: Map<string, CompiledDatasetSchema>;
};

const schemaCache = new WeakMap<object, CompiledSchema>();

function compileSchema(schema: XapiRootSchema): CompiledSchema {
  const cached = schemaCache.get(schema);
  if (cached) return cached;

  const compiled: CompiledSchema = {
    parameters: new Map(Object.entries(schema.parameters)),
    datasets: new Map(Object.entries(schema.datasets).map(([id, dataset]) => [id, {
      columns: new Map(Object.entries(dataset.columns)),
    }])),
  };
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
  return { kind: "xapi-operation", ...definition };
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

  for (const [id, parameterSchema] of compiled.parameters) {
    const parameterValue = value.parameters[id as keyof typeof value.parameters] as XapiValueType;
    if (parameterValue !== undefined || !parameterSchema.optional) {
      root.addParameter({ id, type: parameterSchema.type, value: parameterValue });
    }
  }

  for (const [datasetId, datasetDefinition] of compiled.datasets) {
    const dataset = new Dataset(datasetId);
    for (const [id, columnSchema] of datasetDefinition.columns) {
      dataset.addColumn({ id, type: columnSchema.type, size: columnSchema.size });
    }

    const rows = value.datasets[datasetId as keyof typeof value.datasets] as EncodedRow[];
    const columnIds = [...datasetDefinition.columns.keys()];
    for (const row of rows) {
      const rowIndex = dataset.newRow();
      dataset.rows[rowIndex].type = row.$rowType;
      for (const id of columnIds) {
        dataset.setColumn(rowIndex, id, row[id]);
      }
      if (row.$orgRow) {
        dataset.rows[rowIndex].orgRow = Object.entries(row.$orgRow).map(([id, value]) => ({ id, value }));
      }
    }
    root.addDataset(dataset);
  }

  return root;
}

export function decodeRoot<Schema extends XapiRootSchema>(schema: Schema, root: XapiRoot): InferRoot<Schema> {
  const compiled = compileSchema(schema);
  const parameters: Record<string, XapiValueType> = {};
  for (const [id, parameterSchema] of compiled.parameters) {
    const parameter = root.getParameter(id);
    const value = parameter?.rawValue !== undefined ? parameter.rawValue : parameter?.value;
    if (value !== undefined) parameters[id] = convertToColumnType(value, parameterSchema.type);
  }

  const datasets: Record<string, EncodedRow[]> = {};
  for (const [datasetId, datasetDefinition] of compiled.datasets) {
    const schemaColumns = datasetDefinition.columns;
    const dataset = root.getDataset(datasetId);
    if (!dataset) {
      datasets[datasetId] = [];
      continue;
    }

    const constants = Object.fromEntries(dataset.getConstColumns().map(({ id, value }) => [id, value]));
    datasets[datasetId] = dataset.getRows().map(row => {
      const value: EncodedRow = { ...constants };
      for (const column of row.cols) {
        const columnSchema = schemaColumns.get(column.id);
        if (columnSchema) {
          const rawValue = column.rawValue !== undefined ? column.rawValue : column.value;
          value[column.id] = rawValue === undefined ? undefined : convertToColumnType(rawValue, columnSchema.type);
        }
      }
      if (row.type) value.$rowType = row.type;
      if (row.orgRow) {
        value.$orgRow = Object.fromEntries(row.orgRow.flatMap(column => {
          const columnSchema = schemaColumns.get(column.id);
          if (!columnSchema) return [];
          const rawValue = column.rawValue !== undefined ? column.rawValue : column.value;
          return [[column.id, rawValue === undefined ? undefined : convertToColumnType(rawValue, columnSchema.type)]];
        }));
      }
      return value;
    });
  }

  return { parameters, datasets } as InferRoot<Schema>;
}
