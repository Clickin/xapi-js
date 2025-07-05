import { Column, ConstColumn, Parameter, Row, XapiParameters, XapiValueType } from "./types";


export class XapiRoot {
  datasets: Dataset[] = [];
  parameters: XapiParameters = { params: [] };

  constructor(datasets: Dataset[] = [], parameters: XapiParameters = { params: [] }) {
    this.datasets = datasets;
    this.parameters = parameters;
  }

  addDataset(dataset: Dataset): void {
    this.datasets.push(dataset);
  }

  getDataset(id: string): Dataset | undefined {
    return this.datasets.find(dataset => dataset.id === id);
  }

  addParameter(parameter: Parameter): void {
    this.parameters.params.push(parameter);
  }

  getParameter(id: string): Parameter | undefined {
    return this.parameters.params.find(param => param.id === id);
  }

  setParameters(parameters: XapiParameters): void {
    this.parameters = parameters;
  }

  setParameter(id: string, value: XapiValueType): void {
    const param = this.parameters.params.find(p => p.id === id);
    if (param) {
      param.value = value;
    } else {
      this.addParameter({ id, value });
    }
  }

  parameterSize(): number {
    return this.parameters.params.length;
  }
  datasetSize(): number {
    return this.datasets.length;
  }

  *iterParameters(): IterableIterator<Parameter> {
    for (const param of this.parameters.params) {
      yield param;
    }
  }

  *iterDatasets(): IterableIterator<Dataset> {
    for (const dataset of this.datasets) {
      yield dataset;
    }
  }




}

export class Dataset {
  id: string;
  // addColumn, addConstColumn을 사용해서만 추가할 수 있도록(_columnIndexMap을 사용하기 위해)
  private constColumns: ConstColumn[] = [];
  private columns: Column[] = [];
  rows: Row[] = [];
  private _columnIndexMap: Map<string, number> = new Map();
  constructor(id: string, constColumns: ConstColumn[] = [], columns: Column[] = [], rows: Row[] = []) {
    this.id = id;
    this.constColumns = constColumns;
    this.columns = columns;
    this.rows = rows;
  }

  addColumn(column: Column): void {
    this.columns.push(column);
    this._columnIndexMap.set(column.id, this.columns.length - 1);
  }
  addConstColumn(column: ConstColumn): void {
    this.constColumns.push(column);
    // ConstColumn은 row가 없으므로 row index map에 추가하지 않습니다.
  }
  newRow(): number {
    this.rows.push({ cols: [] });
    return this.rows.length - 1;
  }
  addRow(row: Row): void {
    this.rows.push(row);
  }
  getColumnIndex(columnId: string): number | undefined {
    return this._columnIndexMap.get(columnId);
  }

  getColumnInfo(columnId: string): Column | undefined {
    const colIndex = this.getColumnIndex(columnId);
    if (colIndex !== undefined) {
      return this.columns[colIndex];
    }
    return undefined;
  }
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

  *iterConstColumns(): IterableIterator<ConstColumn> {
    for (const column of this.constColumns) {
      yield column;
    }
  }
  *iterColumns(): IterableIterator<Column> {
    for (const column of this.columns) {
      yield column;
    }
  }
  *iterRows(): IterableIterator<Row> {
    for (const row of this.rows) {
      yield row;
    }
  }

  columnSize(): number {
    return this.columns.length;
  }

  constColumnSize(): number {
    return this.constColumns.length;
  }

  rowSize(): number {
    return this.rows.length;
  }


}