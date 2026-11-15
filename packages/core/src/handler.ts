import { ColumnType, InvalidXmlError, NexaVersion, RowType, XapiOptions, XapiValueType } from "./types";
import { _unescapeXml, convertToColumnType, normalizeColumnType, parseXml, XmlNode } from "./utils";
import { Dataset, XapiRoot } from "./xapi-data";
import { encodeXapiWire } from "./xapi-wire";

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

/**
 * Writes X-API XML as the original drivers do, byte for byte. A TOBESOFT
 * namespace writes like the XPLATFORM driver (ver 5000 unless the version is
 * "4000"), any other like the Nexacro driver. Row types, original rows and
 * deleted rows are written (saveType ALL).
 */
export function write(root: XapiRoot): string {
  const version = _options.xapiVersion || NexaVersion;
  const xplatform = version.xmlns.toLowerCase().includes("tobesoft");
  const profile = !xplatform ? "nexacro-xml-4000" : version.version === "4000" ? "xplatform-xml-4000" : "xplatform-xml-5000";
  return new TextDecoder().decode(encodeXapiWire(root, profile));
}
