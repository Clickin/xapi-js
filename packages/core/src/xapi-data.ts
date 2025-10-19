import { Column, ConstColumn, Parameter, Row, XapiParameters, XapiValueType } from "./types";

/**
 * Represents the root of an X-API XML structure, containing datasets and parameters.
 */
export class XapiRoot {
  /** An array of datasets within the X-API root. */
  datasets: Dataset[] = [];
  /** Parameters associated with the X-API root. */
  parameters: XapiParameters = { params: [] };

  /**
   * Creates an instance of XapiRoot.
   * @param datasets - Initial array of datasets.
   * @param parameters - Initial parameters.
   */
  constructor(datasets: Dataset[] = [], parameters: XapiParameters = { params: [] }) {
    this.datasets = datasets;
    this.parameters = parameters;
  }

  /**
   * Adds a dataset to the X-API root.
   * @param dataset - The dataset to add.
   */
  addDataset(dataset: Dataset): void {
    this.datasets.push(dataset);
  }

  /**
   * Retrieves a dataset by its ID.
   * @param id - The ID of the dataset to retrieve.
   * @returns The Dataset object, or undefined if not found.
   */
  getDataset(id: string): Dataset | undefined {
    return this.datasets.find(dataset => dataset.id === id);
  }

  /**
   * Adds a parameter to the X-API root.
   * @param parameter - The parameter to add.
   */
  addParameter(parameter: Parameter): void {
    this.parameters.params.push(parameter);
  }

  /**
   * Retrieves a parameter by its ID.
   * @param id - The ID of the parameter to retrieve.
   * @returns The Parameter object, or undefined if not found.
   */
  getParameter(id: string): Parameter | undefined {
    return this.parameters.params.find(param => param.id === id);
  }

  /**
   * Sets all parameters for the X-API root.
   * @param parameters - The XapiParameters object to set.
   */
  setParameters(parameters: XapiParameters): void {
    this.parameters = parameters;
  }

  /**
   * Sets the value of a specific parameter, or adds it if it doesn't exist.
   * @param id - The ID of the parameter.
   * @param value - The value to set for the parameter.
   */
  setParameter(id: string, value: XapiValueType): void {
    const param = this.parameters.params.find(p => p.id === id);
    if (param) {
      param.value = value;
    } else {
      this.addParameter({ id, value });
    }
  }

  /**
   * Returns the number of parameters.
   * @returns The count of parameters.
   */
  parameterSize(): number {
    return this.parameters.params.length;
  }

  /**
   * Returns the number of datasets.
   * @returns The count of datasets.
   */
  datasetSize(): number {
    return this.datasets.length;
  }

  /**
   * Returns all parameters as an array.
   * @returns An array of parameters.
   */
  getParameters(): Parameter[] {
    return this.parameters.params;
  }

  /**
   * Returns all datasets as an array.
   * @returns An array of datasets.
   */
  getDatasets(): Dataset[] {
    return this.datasets;
  }
}

/**
 * Represents a dataset within an X-API XML structure.
 */
export class Dataset {
  /** The ID of the dataset. */
  id: string;
  private constColumns: ConstColumn[] = [];
  private columns: Column[] = [];
  /** An array of rows in the dataset. */
  rows: Row[] = [];
  private _columnIndexMap: Map<string, number> = new Map();

  /**
   * Creates an instance of Dataset.
   * @param id - The ID of the dataset.
   * @param constColumns - Initial array of constant columns.
   * @param columns - Initial array of columns.
   * @param rows - Initial array of rows.
   */
  constructor(id: string, constColumns: ConstColumn[] = [], columns: Column[] = [], rows: Row[] = []) {
    this.id = id;
    this.constColumns = constColumns;
    this.columns = columns;
    this.rows = rows;
  }

  /**
   * Adds a column definition to the dataset.
   * @param column - The column definition to add.
   */
  addColumn(column: Column): void {
    this.columns.push(column);
    this._columnIndexMap.set(column.id, this.columns.length - 1);
  }

  /**
   * Adds a constant column definition to the dataset.
   * @param column - The constant column definition to add.
   */
  addConstColumn(column: ConstColumn): void {
    this.constColumns.push(column);
  }

  /**
   * Creates a new empty row and adds it to the dataset.
   * @returns The index of the newly created row.
   */
  newRow(): number {
    this.rows.push({ cols: [] });
    return this.rows.length - 1;
  }

  /**
   * Adds an existing row to the dataset.
   * @param row - The row to add.
   */
  addRow(row: Row): void {
    this.rows.push(row);
  }

  /**
   * Retrieves the index of a column by its ID.
   * @param columnId - The ID of the column.
   * @returns The index of the column, or undefined if not found.
   */
  getColumnIndex(columnId: string): number | undefined {
    return this._columnIndexMap.get(columnId);
  }

  /**
   * Retrieves the column definition by its ID.
   * @param columnId - The ID of the column.
   * @returns The Column object, or undefined if not found.
   */
  getColumnInfo(columnId: string): Column | undefined {
    const colIndex = this.getColumnIndex(columnId);
    if (colIndex !== undefined) {
      return this.columns[colIndex];
    }
    return undefined;
  }

  /**
   * Retrieves the constant column definition by its ID.
   * @param columnId - The ID of the constant column.
   * @returns The ConstColumn object, or undefined if not found.
   */
  getConstColumnInfo(columnId: string): ConstColumn | undefined {
    return this.constColumns.find(col => col.id === columnId);
  }

  /**
   * Retrieves the value of a column in a specific row.
   * @param rowIdx - The index of the row.
   * @param columnId - The ID of the column.
   * @returns The value of the column, or undefined if the row or column is not found.
   * @throws {Error} if the column ID is not found in the dataset.
   */
  getColumn(rowIdx: number, columnId: string): XapiValueType | undefined {
    if (rowIdx < this.rows.length) {
      const colIndex = this.getColumnIndex(columnId);
      if (colIndex === undefined) {
        throw new Error(`Column with id ${columnId} not found in dataset ${this.id}`);
      }
      const col = this.rows[rowIdx].cols[colIndex];
      return col?.value;
    }
    return undefined;
  }

  /**
   * Retrieves the original value of a column in a specific row (for OrgRow).
   * @param rowIdx - The index of the row.
   * @param columnId - The ID of the column.
   * @returns The original value of the column, or undefined if the row or column is not found.
   * @throws {Error} if the column ID is not found in the dataset.
   */
  getOrgColumn(rowIdx: number, columnId: string): XapiValueType | undefined {
    if (rowIdx < this.rows.length) {
      const colIndex = this.getColumnIndex(columnId);
      if (colIndex === undefined) {
        throw new Error(`Column with id ${columnId} not found in dataset ${this.id}`);
      }
      const col = this.rows[rowIdx].orgRow?.[colIndex];
      return col?.value;
    }
    return undefined;
  }

  /**
   * Sets the value of a column in a specific row.
   * @param rowIdx - The index of the row.
   * @param columnId - The ID of the column.
   * @param value - The value to set.
   * @throws {Error} if the row index is out of bounds or the column ID is not found.
   */
  setColumn(rowIdx: number, columnId: string, value: XapiValueType): void {
    if (rowIdx < this.rows.length) {
      const colIndex = this.getColumnIndex(columnId);
      if (colIndex === undefined) {
        throw new Error(`Column with id ${columnId} not found in dataset ${this.id}`);
      }
      this.rows[rowIdx].cols[colIndex] = { id: columnId, value };
    } else {
      throw new Error(`Row index ${rowIdx} out of bounds in dataset ${this.id}`);
    }
  }

  /**
   * Returns all constant column definitions as an array.
   * @returns An array of constant columns.
   */
  getConstColumns(): ConstColumn[] {
    return this.constColumns;
  }

  /**
   * Returns all column definitions as an array.
   * @returns An array of columns.
   */
  getColumns(): Column[] {
    return this.columns;
  }

  /**
   * Returns all rows in the dataset as an array.
   * @returns An array of rows.
   */
  getRows(): Row[] {
    return this.rows;
  }

  /**
   * Returns the number of column definitions.
   * @returns The count of columns.
   */
  columnSize(): number {
    return this.columns.length;
  }

  /**
   * Returns the number of constant column definitions.
   * @returns The count of constant columns.
   */
  constColumnSize(): number {
    return this.constColumns.length;
  }

  /**
   * Returns the number of rows in the dataset.
   * @returns The count of rows.
   */
  rowSize(): number {
    return this.rows.length;
  }
}