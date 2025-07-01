import { describe, expect, it } from "bun:test";
import { Column, ConstColumn, Parameter, Row } from "../src/types";
import { Dataset, XapiRoot } from "../src/xapi-data";

describe("XapiData Tests", () => {
  describe("XapiRoot", () => {
    it("should create empty XapiRoot", () => {
      const root = new XapiRoot();
      expect(root.datasets).toEqual([]);
      expect(root.parameters.params).toEqual([]);
      expect(root.parameterSize()).toBe(0);
      expect(root.datasetSize()).toBe(0);
    });

    it("should create XapiRoot with initial data", () => {
      const dataset = new Dataset("test");
      const parameters = { params: [{ id: "test", value: "value" }] };
      const root = new XapiRoot([dataset], parameters);

      expect(root.datasets.length).toBe(1);
      expect(root.parameters.params.length).toBe(1);
      expect(root.parameterSize()).toBe(1);
      expect(root.datasetSize()).toBe(1);
    });

    it("should add dataset", () => {
      const root = new XapiRoot();
      const dataset = new Dataset("test");
      root.addDataset(dataset);

      expect(root.datasetSize()).toBe(1);
      expect(root.datasets[0]).toBe(dataset);
    });

    it("should add parameter", () => {
      const root = new XapiRoot();
      const parameter: Parameter = { id: "test", value: "value" };
      root.addParameter(parameter);

      expect(root.parameterSize()).toBe(1);
      expect(root.parameters.params[0]).toBe(parameter);
    });

    it("should set parameters", () => {
      const root = new XapiRoot();
      const parameters = { params: [{ id: "test1", value: "value1" }, { id: "test2", value: "value2" }] };
      root.setParameters(parameters);

      expect(root.parameterSize()).toBe(2);
      expect(root.parameters).toBe(parameters);
    });

    it("should set parameter - update existing", () => {
      const root = new XapiRoot();
      root.addParameter({ id: "test", value: "oldValue" });
      root.setParameter("test", "newValue");

      expect(root.parameterSize()).toBe(1);
      expect(root.parameters.params[0].value).toBe("newValue");
    });

    it("should set parameter - add new", () => {
      const root = new XapiRoot();
      root.setParameter("test", "value");

      expect(root.parameterSize()).toBe(1);
      expect(root.parameters.params[0].id).toBe("test");
      expect(root.parameters.params[0].value).toBe("value");
    });

    it("should iterate parameters", () => {
      const root = new XapiRoot();
      const param1 = { id: "test1", value: "value1" };
      const param2 = { id: "test2", value: "value2" };
      root.addParameter(param1);
      root.addParameter(param2);

      const parameters = Array.from(root.iterParameters());
      expect(parameters).toEqual([param1, param2]);
    });

    it("should iterate datasets", () => {
      const root = new XapiRoot();
      const dataset1 = new Dataset("test1");
      const dataset2 = new Dataset("test2");
      root.addDataset(dataset1);
      root.addDataset(dataset2);

      const datasets = Array.from(root.iterDatasets());
      expect(datasets).toEqual([dataset1, dataset2]);
    });
  });

  describe("Dataset", () => {
    it("should create empty dataset", () => {
      const dataset = new Dataset("test");
      expect(dataset.id).toBe("test");
      expect(dataset.constColumns).toEqual([]);
      expect(dataset.columns).toEqual([]);
      expect(dataset.rows).toEqual([]);
      expect(dataset.constColumnSize()).toBe(0);
      expect(dataset.columnSize()).toBe(0);
      expect(dataset.rowSize()).toBe(0);
    });

    it("should create dataset with initial data", () => {
      const constColumns: ConstColumn[] = [{ id: "const1", size: 10, type: "STRING", value: "test" }];
      const columns: Column[] = [{ id: "col1", size: 10, type: "STRING" }];
      const rows: Row[] = [{ cols: [{ id: "col1", value: "value1" }] }];

      const dataset = new Dataset("test", constColumns, columns, rows);
      expect(dataset.constColumns).toBe(constColumns);
      expect(dataset.columns).toBe(columns);
      expect(dataset.rows).toBe(rows);
    });

    it("should add column and update index map", () => {
      const dataset = new Dataset("test");
      const column: Column = { id: "col1", size: 10, type: "STRING" };
      dataset.addColumn(column);

      expect(dataset.columnSize()).toBe(1);
      expect(dataset.columns[0]).toBe(column);
      expect(dataset.getColumnIndex("col1")).toBe(0);
    });

    it("should add const column", () => {
      const dataset = new Dataset("test");
      const constColumn: ConstColumn = { id: "const1", size: 10, type: "STRING", value: "test" };
      dataset.addConstColumn(constColumn);

      expect(dataset.constColumnSize()).toBe(1);
      expect(dataset.constColumns[0]).toBe(constColumn);
    });

    it("should create new row and return index", () => {
      const dataset = new Dataset("test");
      const rowIndex = dataset.newRow();

      expect(rowIndex).toBe(0);
      expect(dataset.rowSize()).toBe(1);
      expect(dataset.rows[0]).toEqual({ cols: [] });
    });

    it("should add row", () => {
      const dataset = new Dataset("test");
      const row: Row = { cols: [{ id: "col1", value: "value1" }] };
      dataset.addRow(row);

      expect(dataset.rowSize()).toBe(1);
      expect(dataset.rows[0]).toBe(row);
    });

    it("should get column index", () => {
      const dataset = new Dataset("test");
      dataset.addColumn({ id: "col1", size: 10, type: "STRING" });

      expect(dataset.getColumnIndex("col1")).toBe(0);
      expect(dataset.getColumnIndex("nonexistent")).toBeUndefined();
    });

    it("should get column info", () => {
      const dataset = new Dataset("test");
      const column: Column = { id: "col1", size: 10, type: "STRING" };
      dataset.addColumn(column);

      expect(dataset.getColumnInfo("col1")).toBe(column);
      expect(dataset.getColumnInfo("nonexistent")).toBeUndefined();
    });

    it("should get column value", () => {
      const dataset = new Dataset("test");
      dataset.addColumn({ id: "col1", size: 10, type: "STRING" });
      dataset.newRow();
      dataset.rows[0].cols.push({ id: "col1", value: "testValue" });

      expect(dataset.getColumn(0, "col1")).toBe("testValue");
      expect(dataset.getColumn(1, "col1")).toBeUndefined(); // row doesn't exist
      expect(dataset.getColumn(0, "nonexistent")).toBeUndefined(); // column doesn't exist
    });

    it("should set column value", () => {
      const dataset = new Dataset("test");
      dataset.addColumn({ id: "col1", size: 10, type: "STRING" });
      dataset.newRow();
      dataset.rows[0].cols.push({ id: "col1", value: "oldValue" });

      dataset.setColumn(0, "col1", "newValue");
      expect(dataset.rows[0].cols[0].value).toBe("newValue");
    });

    it("should throw error when setting non-existent column", () => {
      const dataset = new Dataset("test");
      dataset.newRow();

      expect(() => {
        dataset.setColumn(0, "nonexistent", "value");
      }).toThrow("Column with id nonexistent not found in dataset test");
    });

    it("should iterate const columns", () => {
      const dataset = new Dataset("test");
      const constCol1: ConstColumn = { id: "const1", size: 10, type: "STRING", value: "test1" };
      const constCol2: ConstColumn = { id: "const2", size: 10, type: "STRING", value: "test2" };
      dataset.addConstColumn(constCol1);
      dataset.addConstColumn(constCol2);

      const constColumns = Array.from(dataset.iterConstColumns());
      expect(constColumns).toEqual([constCol1, constCol2]);
    });

    it("should iterate columns", () => {
      const dataset = new Dataset("test");
      const col1: Column = { id: "col1", size: 10, type: "STRING" };
      const col2: Column = { id: "col2", size: 10, type: "INT" };
      dataset.addColumn(col1);
      dataset.addColumn(col2);

      const columns = Array.from(dataset.iterColumns());
      expect(columns).toEqual([col1, col2]);
    });

    it("should iterate rows", () => {
      const dataset = new Dataset("test");
      const row1: Row = { cols: [{ id: "col1", value: "value1" }] };
      const row2: Row = { cols: [{ id: "col1", value: "value2" }] };
      dataset.addRow(row1);
      dataset.addRow(row2);

      const rows = Array.from(dataset.iterRows());
      expect(rows).toEqual([row1, row2]);
    });
  });
});
