import { Col, ColumnType, InvalidXmlError, NexaVersion, Parameter, RowType, XapiOptions, XapiValueType } from "./types";
import { _unescapeXml, convertToColumnType, convertToString, dateToString, normalizeColumnType, parseXml, uint8ArrayToBase64, XmlNode, XmlStringBuilder } from "./utils";
import { Dataset, XapiRoot } from "./xapi-data";

const defaultOptions: XapiOptions = {
  xapiVersion: NexaVersion,
  parseToTypes: true,
};

let _options: XapiOptions = { xapiVersion: defaultOptions.xapiVersion, parseToTypes: defaultOptions.parseToTypes };

export function initXapi(options: XapiOptions) {
  _options = { xapiVersion: options.xapiVersion, parseToTypes: options.parseToTypes };
}

export function parse(xml: string): XapiRoot {
  const parsedXml: XmlNode[] = parseXml(xml);
  const xapiRoot = new XapiRoot();
  let rootElement: XmlNode | undefined;
  for (let i = 0; i < parsedXml.length; i++) {
    if (parsedXml[i].tagName === "Root") {
      rootElement = parsedXml[i];
      break;
    }
  }
  if (rootElement === undefined) return xapiRoot;
  const rootChildren = rootElement.children;
  if (rootChildren) {
    for (let childIndex = 0; childIndex < rootChildren.length; childIndex++) {
      const child = rootChildren[childIndex];
      if (typeof child === "string") continue;
      if (child.tagName === "Parameters") parseParameters(child, xapiRoot);
      else if (child.tagName === "Datasets") {
        const datasets = child.children;
        if (!datasets) continue;
        for (let datasetIndex = 0; datasetIndex < datasets.length; datasetIndex++) {
          const datasetElement = datasets[datasetIndex];
          if (typeof datasetElement !== "string" && datasetElement.tagName === "Dataset") parseDataset(datasetElement, xapiRoot);
        }
      } else if (child.tagName === "Dataset") parseDataset(child, xapiRoot);
    }
  }
  return xapiRoot;
}

function parseDataset(child: XmlNode, xapiRoot: XapiRoot): void {
  if (!child.attributes?.id) throw new InvalidXmlError("Dataset element must have an 'id' attribute");
  const dataset = new Dataset(child.attributes.id);
  xapiRoot.addDataset(dataset);
  let columnInfoElement: XmlNode | string | undefined;
  let rowsElement: XmlNode | undefined;
  const datasetChildren = child.children;
  if (datasetChildren) {
    for (let childIndex = 0; childIndex < datasetChildren.length; childIndex++) {
      const datasetChild = datasetChildren[childIndex];
      if (typeof datasetChild === "string") continue;
      if (datasetChild.tagName === "ColumnInfo") columnInfoElement = datasetChild;
      else if (datasetChild.tagName === "Rows") rowsElement = datasetChild;
      if (columnInfoElement && rowsElement) break;
    }
  }
  parseColumnInfo(columnInfoElement, dataset);
  parseRows(rowsElement, dataset);
}

function parseValue(value?: string, type: ColumnType = "STRING"): XapiValueType {
  value = _unescapeXml(value);
  return _options.parseToTypes ? convertToColumnType(value, type) : value;
}

function parseColumnInfo(columnInfoElement: XmlNode | string | undefined, dataset: Dataset): void {
  if (!columnInfoElement || typeof columnInfoElement === "string") throw new InvalidXmlError("ColumnInfo element is missing in the dataset");
  const definitions = columnInfoElement.children;
  if (!definitions) return;
  for (let definitionIndex = 0; definitionIndex < definitions.length; definitionIndex++) {
    const colInfo = definitions[definitionIndex];
    if (typeof colInfo === "string") continue;
    const attrs = colInfo.attributes;
    const size = attrs?.size ? parseInt(attrs.size, 10) : 0;
    if (colInfo.tagName === "ConstColumn") {
      dataset.addConstColumn({ id: attrs?.id!!, size, type: normalizeColumnType(attrs?.type), value: parseValue(attrs?.value, attrs?.type as ColumnType), rawValue: attrs?.value });
    } else if (colInfo.tagName === "Column") {
      dataset.addColumn({ id: attrs?.id!!, size, type: normalizeColumnType(attrs?.type) });
    }
  }
}

function parseRows(rowsElement: XmlNode | undefined, dataset: Dataset): void {
  const rows = rowsElement?.children;
  if (!rows) return;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const sourceRow = rows[rowIndex];
    if (typeof sourceRow === "string") continue;
    if (sourceRow.tagName === "Col") throw new InvalidXmlError("Row must be defined before Col");
    if (sourceRow.tagName === "OrgRow") throw new InvalidXmlError("Row must be defined before OrgRow");
    if (sourceRow.tagName !== "Row") continue;
    const targetRowIndex = dataset.newRow();
    const row = dataset.rows[targetRowIndex];
    row.type = (sourceRow.attributes?.type as RowType) || undefined;
    const sourceColumns = sourceRow.children;
    if (!sourceColumns) continue;
    for (let columnIndex = 0; columnIndex < sourceColumns.length; columnIndex++) {
      const child = sourceColumns[columnIndex];
      if (typeof child === "string") continue;
      if (child.tagName === "Col") {
        const id = child.attributes?.id!!;
        const value = child.children?.[0] as string;
        const column = dataset.getColumnInfo(id);
        if (!column) throw new InvalidXmlError(`Column with id ${id} not found in dataset ${dataset.id}`);
        row.cols.push({ id, value: parseValue(value, column.type), rawValue: value });
      } else if (child.tagName === "OrgRow") {
        row.orgRow = [];
        const originalColumns = child.children;
        if (!originalColumns) continue;
        for (let originalIndex = 0; originalIndex < originalColumns.length; originalIndex++) {
          const orgCol = originalColumns[originalIndex];
          if (typeof orgCol === "string" || orgCol.tagName !== "Col") continue;
          const id = orgCol.attributes?.id!!;
          const value = orgCol.children?.[0] as string;
          const column = dataset.getColumnInfo(id)!!;
          row.orgRow.push({ id, value: parseValue(value, column.type), rawValue: value });
        }
      }
    }
  }
}

function parseParameters(parametersElement: XmlNode, xapiRoot: XapiRoot): void {
  const parameters = parametersElement.children;
  if (!parameters) return;
  for (let index = 0; index < parameters.length; index++) {
    const source = parameters[index];
    if (typeof source === "string" || source.tagName !== "Parameter") continue;
    const type = (source.attributes?.type as ColumnType) || "STRING";
    const value = (source.children?.[0] as string | undefined) ?? source.attributes?.value;
    xapiRoot.addParameter({ id: source.attributes?.id!!, type: normalizeColumnType(type), value: parseValue(value, type), rawValue: value });
  }
}

export function write(root: XapiRoot): string {
  const builder = new XmlStringBuilder();
  builder.writeDeclaration("1.0", "UTF-8");
  builder.writeStartElement("Root", { xmlns: _options.xapiVersion?.xmlns || NexaVersion.xmlns, version: _options.xapiVersion?.version || NexaVersion.version });
  if (root.parameterSize() > 0) writeParameters(builder, root.getParameters());
  if (root.datasetSize() > 0) {
    builder.writeStartElement("Datasets");
    const datasets = root.getDatasets();
    for (let index = 0; index < datasets.length; index++) writeDataset(builder, datasets[index]);
    builder.writeEndElement("Datasets");
  }
  builder.writeEndElement("Root");
  return builder.toString();
}

function writeParameters(builder: XmlStringBuilder, parameters: Parameter[]): void {
  builder.writeStartElement("Parameters");
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    let value: string | undefined;
    if (typeof parameter.value === "string") value = parameter.value;
    else if (parameter.value instanceof Date) value = dateToString(parameter.value, parameter.type as Extract<ColumnType, "DATE" | "DATETIME" | "TIME">);
    else if (parameter.value instanceof Uint8Array) value = uint8ArrayToBase64(parameter.value);
    else if (parameter.value !== undefined) value = String(parameter.value);
    builder.writeStartElement("Parameter", { id: parameter.id, type: parameter.type !== undefined ? normalizeColumnType(parameter.type) : undefined, value }, true);
  }
  builder.writeEndElement("Parameters");
}

function writeDataset(builder: XmlStringBuilder, dataset: Dataset): void {
  builder.writeStartElement("Dataset", { id: dataset.id });
  if (dataset.constColumnSize() > 0 || dataset.columnSize() > 0) {
    builder.writeStartElement("ColumnInfo");
    const constants = dataset.getConstColumns();
    for (let index = 0; index < constants.length; index++) {
      const column = constants[index];
      builder.writeStartElement("ConstColumn", { id: column.id, size: String(column.size), type: normalizeColumnType(column.type), value: column.value !== undefined ? String(column.value) : "" }, true);
    }
    const columns = dataset.getColumns();
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      builder.writeStartElement("Column", { id: column.id, size: String(column.size), type: normalizeColumnType(column.type) }, true);
    }
    builder.writeEndElement("ColumnInfo");
  }
  builder.writeStartElement("Rows");
  const rows = dataset.getRows();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    builder.writeStartElement("Row", { type: row.type || undefined });
    for (let columnIndex = 0; columnIndex < row.cols.length; columnIndex++) writeColumn(builder, dataset, row.cols[columnIndex]);
    if (row.orgRow?.length) {
      builder.writeStartElement("OrgRow");
      for (let columnIndex = 0; columnIndex < row.orgRow.length; columnIndex++) writeColumn(builder, dataset, row.orgRow[columnIndex]);
      builder.writeEndElement("OrgRow");
    }
    builder.writeEndElement("Row");
  }
  builder.writeEndElement("Rows");
  builder.writeEndElement("Dataset");
}

function writeColumn(builder: XmlStringBuilder, dataset: Dataset, col: Col): void {
  if (col.value !== undefined && col.value !== null) {
    builder.writeElementWithText("Col", { id: col.id }, convertToString(col.value, dataset.getColumnInfo(col.id)!!.type));
  } else builder.writeStartElement("Col", { id: col.id }, true);
}
