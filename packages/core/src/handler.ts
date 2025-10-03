import { StaxXmlWriterSync } from "stax-xml";
import * as txml from "txml";
import { Col, ColumnType, InvalidXmlError, NexaVersion, Parameter, RowType, XapiOptions, XapiValueType } from "./types";
import { _unescapeXml, convertToColumnType, convertToString, dateToString, makeWriterEntities, uint8ArrayToBase64 } from "./utils";
import { Dataset, XapiRoot } from "./xapi-data";

type tNodeObj = {
  tagName: string;
  attributes?: Record<string, string>;
  children?: tNode[];
};
type tNode = tNodeObj & string;


const defaultOptions: XapiOptions = {
  xapiVersion: NexaVersion,
  parseToTypes: true,
};

let _options: XapiOptions = {
  ...defaultOptions
};


/**
 * Initializes the X-API handler with the provided options.
 * @param options - The options to initialize the X-API handler.
 * @returns void
 */
export function initXapi(options: XapiOptions) {
  _options = {
    ...options
  };
}



/**
 * Parses an XML string into an XapiRoot object using txml.
 * @param xml - The string containing the XML data.
 * @returns A Promise that resolves to an XapiRoot object.
 */
export function parse(xml: string): XapiRoot {

  const parsedXml: tNodeObj[] = txml.parse(xml);
  const xapiRoot = new XapiRoot();

  let rootElement: tNodeObj | undefined;
  for (let i = 0; i < parsedXml.length; i++) {
    if (parsedXml[i].tagName === 'Root') {
      rootElement = parsedXml[i];
      break;
    }
  }
  if (rootElement === undefined) return xapiRoot;

  const rootChildren = rootElement.children;
  if (rootChildren && rootChildren.length > 0) {
    for (let i = 0; i < rootChildren.length; i++) {
      const child = rootChildren[i];
      const tagName = child.tagName;

      if (tagName === 'Parameters') {
        parseParameters(child, xapiRoot);
      } else if (tagName === 'Dataset') {
        if (!child.attributes || !child.attributes.id) {
          throw new InvalidXmlError("Dataset element must have an 'id' attribute");
        }
        const datasetId = child.attributes.id;
        const dataset = new Dataset(datasetId);
        xapiRoot.addDataset(dataset);

        const datasetChildren = child.children;
        let columnInfoElement: tNode | undefined;
        let rowsElement: tNode | undefined;
        if (datasetChildren) {
          for (let j = 0; j < datasetChildren.length; j++) {
            const datasetChild = datasetChildren[j];
            const childTagName = datasetChild.tagName;
            if (childTagName === 'ColumnInfo') {
              columnInfoElement = datasetChild;
            } else if (childTagName === 'Rows') {
              rowsElement = datasetChild;
            }
            // Early exit if both found
            if (columnInfoElement && rowsElement) break;
          }
        }

        parseColumnInfo(columnInfoElement, dataset);
        parseRows(rowsElement, dataset);
      }
    }
  }

  return xapiRoot;
}

function parseValue(value?: string, type: ColumnType = "STRING"): XapiValueType {
  // entity decoding
  value = _unescapeXml(value);
  return _options.parseToTypes ? convertToColumnType(value, type) : value;
}

function parseColumnInfo(columnInfoElement: tNodeObj | undefined, dataset: Dataset): void {
  if (!columnInfoElement) throw new InvalidXmlError("ColumnInfo element is missing in the dataset");
  const children = columnInfoElement.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const colInfo = children[i];
    const tagName = colInfo.tagName;

    if (tagName === 'ConstColumn') {
      const attrs = colInfo.attributes;
      const sizeStr = attrs?.size;
      dataset.addConstColumn({
        id: attrs?.id!!,
        size: sizeStr ? parseInt(sizeStr, 10) : 0,
        type: (attrs?.type as ColumnType) || "STRING",
        value: parseValue(attrs?.value, attrs?.type as ColumnType),
      });
    } else if (tagName === 'Column') {
      const attrs = colInfo.attributes;
      const sizeStr = attrs?.size;
      dataset.addColumn({
        id: attrs?.id!!,
        size: sizeStr ? parseInt(sizeStr, 10) : 0,
        type: (attrs?.type as ColumnType) || "STRING",
      });
    }
  }
}

function parseRows(rowsElement: tNodeObj | undefined, dataset: Dataset): void {
  const rows = rowsElement?.children;
  if (!rows) return;

  const datasetRows = dataset.rows;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tagName = r.tagName;

    if (tagName === 'Row') {
      const rowIndex = dataset.newRow();
      const currentRow = datasetRows[rowIndex];
      currentRow.type = (r.attributes?.type as RowType) || undefined;

      const cols = r.children;
      if (!cols) {
        continue;
      }
      for (let j = 0; j < cols.length; j++) {
        const col = cols[j];
        const colTagName = col.tagName;

        if (colTagName === 'Col') {
          const attrs = col.attributes;
          const colId = attrs?.id!!;
          const value = col.children?.[0] as string;
          const columnInfo = dataset.getColumnInfo(colId);
          if (!columnInfo) throw new InvalidXmlError(`Column with id ${colId} not found in dataset ${dataset.id}`);
          const castedValue = parseValue(value, columnInfo.type as ColumnType);
          currentRow.cols.push({ id: colId, value: castedValue });
        } else if (colTagName === 'OrgRow') {
          const orgRow: typeof currentRow.orgRow = [];
          currentRow.orgRow = orgRow;

          const orgCols = col.children;
          if (!orgCols) {
            continue;
          }
          for (let k = 0; k < orgCols.length; k++) {
            const orgCol = orgCols[k];
            if (orgCol.tagName === 'Col') {
              const orgAttrs = orgCol.attributes;
              const colId = orgAttrs?.id!!;
              const value = orgCol.children?.[0] as string;
              const columnInfo = dataset.getColumnInfo(colId)!!;
              const castedValue = parseValue(value, columnInfo.type as ColumnType);
              orgRow.push({ id: colId, value: castedValue });
            }
          }
        }
      }
    } else if (tagName === 'Col') {
      throw new InvalidXmlError("Row must be defined before Col");
    } else if (tagName === 'OrgRow') {
      throw new InvalidXmlError("Row must be defined before OrgRow");
    }
  }
}



function parseParameters(parametersElement: tNodeObj | undefined, xapiRoot: XapiRoot): void {
  if (!parametersElement) return;
  const children = parametersElement.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const p = children[i];
    if (p.tagName === 'Parameter') {
      const attrs = p.attributes;
      const id = attrs?.id!!;
      const type = (attrs?.type as ColumnType) || "STRING";
      const value = p.children?.[0] as string;
      xapiRoot.addParameter({
        id,
        type,
        value: parseValue(value, type),
      });
    }
  }
}

export function write(root: XapiRoot): string {
  const writer = new StaxXmlWriterSync({
    addEntities: makeWriterEntities(),
    encoding: "UTF-8",
    indentString: "  ",
    prettyPrint: true,
  });
  writer.writeStartDocument("1.0", "UTF-8");
  writer.writeStartElement("Root", {
    attributes: {
      xmlns: _options.xapiVersion?.xmlns || NexaVersion.xmlns,
      version: _options.xapiVersion?.version || NexaVersion.version,
    }
  })
  if (root.parameterSize() > 0) {
    writeParameters(writer, root.iterParameters());
  }
  if (root.datasetSize() > 0) {
    writer.writeStartElement("Datasets");
    for (const dataset of root.iterDatasets()) {
      writeDataset(writer, dataset);
    }
    writer.writeEndElement(); // </Datasets>
  }
  writer.writeEndElement();
  return writer.getXmlString();
}
function writeParameters(writer: StaxXmlWriterSync, iterator: IterableIterator<Parameter>): void {
  if (iterator) {
    writer.writeStartElement("Parameters");
    for (const parameter of iterator) {
      writer.writeStartElement("Parameter", { attributes: { id: parameter.id } })
      if (parameter.type !== undefined) {
        writer.writeAttribute("type", parameter.type);
      }
      if (parameter.value !== undefined) {
        if (typeof parameter.value === "string") {
          writer.writeAttribute("value", parameter.value);
        } else if (parameter.value instanceof Date) {
          writer.writeAttribute("value", dateToString(parameter.value, parameter.type as Extract<ColumnType, "DATE" | "DATETIME" | "TIME">));
        } else if (parameter.value instanceof Uint8Array) {
          writer.writeAttribute("value", uint8ArrayToBase64(parameter.value));
        } else {
          writer.writeAttribute("value", String(parameter.value));
        }
      }
      writer.writeEndElement();
    }
    writer.writeEndElement();
  }
}
function writeDataset(writer: StaxXmlWriterSync, dataset: Dataset): void {
  writer.writeStartElement("Dataset", { attributes: { id: dataset.id } });
  if (dataset.constColumnSize() > 0 || dataset.columnSize() > 0) {
    writer.writeStartElement("ColumnInfo");
    for (const constCol of dataset.iterConstColumns()) {
      writer.writeStartElement("ConstColumn", {
        attributes: {
          id: constCol.id,
          size: String(constCol.size),
          type: constCol.type,
          value: constCol.value !== undefined ? String(constCol.value) : ""
        },
        selfClosing: true
      });
    }
    for (const col of dataset.iterColumns()) {
      writer.writeStartElement("Column", {
        attributes: {
          id: col.id,
          size: String(col.size),
          type: col.type
        },
        selfClosing: true
      });
    }
    writer.writeEndElement(); // </ColumnInfo>
  }
  writer.writeStartElement("Rows");
  for (const row of dataset.iterRows()) {
    if (row.type) {
      writer.writeStartElement("Row", { attributes: { type: row.type } });
    }
    else {
      writer.writeStartElement("Row"); // no type
    }
    for (const col of row.cols) {
      writeColumn(writer, dataset, col);
    }
    if (row.orgRow && row.orgRow.length > 0) {
      writer.writeStartElement("OrgRow");
      for (const orgCol of row.orgRow) {
        writeColumn(writer, dataset, orgCol);
      }
      writer.writeEndElement(); // </OrgRow>
    }
    writer.writeEndElement(); // </Row>
  }
  writer.writeEndElement(); // </Rows>
  writer.writeEndElement(); // </Dataset>
}
function writeColumn(writer: StaxXmlWriterSync, dataset: Dataset, col: Col): void {
  if (col.value !== undefined && col.value !== null) {
    const colInfo = dataset.getColumnInfo(col.id);
    writer.writeStartElement("Col", { attributes: { id: col.id } });
    writer.writeCharacters(convertToString(col.value, colInfo!!.type));
    writer.writeEndElement();
  }
  else {
    // If value is undefined or null, we still write the Col element with an empty value
    writer.writeStartElement("Col", { attributes: { id: col.id }, selfClosing: true });
  }
}
