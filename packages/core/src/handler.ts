import { StaxXmlWriter } from "stax-xml";
import * as txml from "txml";
import { Col, ColumnType, NexaVersion, Parameter, RowType, XapiOptions, XapiValueType } from "./types";
import { _unescapeXml, convertToColumnType, convertToString, dateToString, makeWriterEntities, StringWritableStream, uint8ArrayToBase64 } from "./utils";
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

  const rootElement = parsedXml.find((node) => {
    const rootNode = node as tNode;
    return rootNode.tagName === 'Root';
  });
  if (rootElement === undefined) return xapiRoot;
  const parametersElement = rootElement.children?.find((node) => node.tagName === 'Parameters');

  parseParameters(parametersElement, xapiRoot);
  const datasetsElements = rootElement.children?.filter((node: tNode) => node.tagName === 'Dataset');
  if (datasetsElements && datasetsElements?.length && datasetsElements.length > 0) {
    for (const datasetsElement of datasetsElements) {
      if (!datasetsElement.attributes || !datasetsElement.attributes.id) {
        throw new Error("Dataset element must have an 'id' attribute");
      }
      const datasetId = datasetsElement.attributes?.id!!;
      const dataset = new Dataset(datasetId);
      xapiRoot.addDataset(dataset);

      const columnInfoElement = datasetsElement.children?.find((node: tNode) => node.tagName === 'ColumnInfo');
      parseColumnInfo(columnInfoElement, dataset);

      const rowsElement = datasetsElement.children?.find((node: tNode) => node.tagName === 'Rows');
      parseRows(rowsElement, dataset);
    }
  }

  return xapiRoot;
}

function parseValue(value?: string, type: ColumnType = "STRING"): XapiValueType {
  // entity decoding
  value = _unescapeXml(value);
  if (type === undefined) {
    type = "STRING"; // Default type if not specified
  }
  return _options.parseToTypes ? convertToColumnType(value, type) : value;
}

function parseColumnInfo(columnInfoElement: tNodeObj | undefined, dataset: Dataset): void {
  if (!columnInfoElement) return;
  columnInfoElement.children?.forEach((colInfo: tNode) => {
    if (colInfo.tagName === 'ConstColumn') {
      dataset.addConstColumn({
        id: colInfo.attributes?.id!!,
        size: parseInt(colInfo.attributes?.size || "0", 10),
        type: (colInfo.attributes?.type as ColumnType) || "STRING",
        value: parseValue(colInfo.attributes?.value, colInfo.attributes?.type as ColumnType),
      });
    } else if (colInfo.tagName === 'Column') {
      dataset.addColumn({
        id: colInfo.attributes?.id!!,
        size: parseInt(colInfo.attributes?.size || "0", 10),
        type: (colInfo.attributes?.type as ColumnType) || "STRING",
      });
    }
  });
}

function parseRows(rowsElement: tNodeObj | undefined, dataset: Dataset): void {
  if (!rowsElement) return;
  rowsElement.children?.forEach((r: tNode) => {
    if (r.tagName === 'Row') {
      const rowIndex = dataset.newRow();
      dataset.rows[rowIndex].type = (r.attributes?.type as RowType) || undefined;

      r.children?.forEach((col: tNode) => {
        if (col.tagName === 'Col') {
          const colId = col.attributes?.id!!;
          const value = col.children?.[0] as string;
          const columnInfo = dataset.getColumnInfo(colId);
          if (!columnInfo) throw new Error(`Column with id ${colId} not found in dataset ${dataset.id}`);
          const castedValue = parseValue(value, columnInfo.type as ColumnType);
          dataset.rows[rowIndex].cols.push({ id: colId, value: castedValue });
        } else if (col.tagName === 'OrgRow') {
          dataset.rows[rowIndex].orgRow = [];
          col.children?.forEach((orgCol: tNode) => {
            if (orgCol.tagName === 'Col') {
              const colId = orgCol.attributes?.id!!;
              const value = orgCol.children?.[0] as string;
              const columnInfo = dataset.getColumnInfo(colId);
              if (!columnInfo) throw new Error(`Column with id ${colId} not found in dataset ${dataset.id}`);
              const castedValue = parseValue(value, columnInfo.type as ColumnType);
              if (dataset && dataset.rows && dataset.rows[rowIndex] && dataset.rows[rowIndex].orgRow) {
                dataset.rows[rowIndex].orgRow.push({ id: colId, value: castedValue });
              }
            }
          });
        }
      });
    }
    else if (r.tagName === 'Col') {
      throw new Error("Row must be defined before Col");
    }
    else if (r.tagName === 'OrgRow') {
      throw new Error("Row must be defined before OrgRow");
    }
  });
}



function parseParameters(parametersElement: tNodeObj | undefined, xapiRoot: XapiRoot): void {
  if (!parametersElement) return;
  parametersElement.children?.forEach((p: tNode) => {
    if (p.tagName === 'Parameter') {
      const id = p.attributes?.id!!;
      const type = (p.attributes?.type as ColumnType) || "STRING";
      const value = p.children?.[0] as string;
      xapiRoot.addParameter({
        id,
        type,
        value: parseValue(value, type),
      });
    }
  });
}

export async function writeString(root: XapiRoot): Promise<string> {
  const stringStream = new StringWritableStream();
  await write(stringStream, root);
  return stringStream.getResult();
}

export async function write(stream: WritableStream<Uint8Array>, root: XapiRoot): Promise<void> {
  const writer = new StaxXmlWriter(stream, {
    addEntities: makeWriterEntities(),
    encoding: "UTF-8",
    indentString: "  ",
    prettyPrint: true,
  });
  await writer.writeStartDocument("1.0", "UTF-8");
  await writer.writeStartElement("Root", { // Root
    attributes: {
      xmlns: _options.xapiVersion?.xmlns || NexaVersion.xmlns,
      version: _options.xapiVersion?.version || NexaVersion.version,
    }
  })
  if (root.parameterSize() > 0) {
    await writeParameters(writer, root.iterParameters());
  }
  if (root.datasetSize() > 0) {
    await writer.writeStartElement("Datasets");
    for (const dataset of root.iterDatasets()) {
      await writeDataset(writer, dataset);
    }
    await writer.writeEndElement(); // </Datasets>
  }
  await writer.writeEndElement();
}
async function writeParameters(writer: StaxXmlWriter, iterator: IterableIterator<Parameter>): Promise<void> {
  if (iterator) {
    await writer.writeStartElement("Parameters");
    for (const parameter of iterator) {
      await writer.writeStartElement("Parameter", { attributes: { id: parameter.id } })
      if (parameter.type !== undefined) {
        await writer.writeAttribute("type", parameter.type);
      }
      if (parameter.value !== undefined) {
        if (typeof parameter.value === "string") {
          await writer.writeAttribute("value", parameter.value);
        } else if (parameter.value instanceof Date) {
          await writer.writeAttribute("value", dateToString(parameter.value, parameter.type as Extract<ColumnType, "DATE" | "DATETIME" | "TIME">));
        } else if (parameter.value instanceof Uint8Array) {
          await writer.writeAttribute("value", uint8ArrayToBase64(parameter.value));
        } else {
          await writer.writeAttribute("value", String(parameter.value));
        }
      }
      await writer.writeEndElement();
    }
    await writer.writeEndElement();
  }
}
async function writeDataset(writer: StaxXmlWriter, dataset: Dataset): Promise<void> {
  await writer.writeStartElement("Dataset", { attributes: { id: dataset.id } });
  if (dataset.constColumnSize() > 0 || dataset.columnSize() > 0) {
    await writer.writeStartElement("ColumnInfo");
    for (const constCol of dataset.iterConstColumns()) {
      await writer.writeStartElement("ConstColumn", {
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
      await writer.writeStartElement("Column", {
        attributes: {
          id: col.id,
          size: String(col.size),
          type: col.type
        },
        selfClosing: true
      });
    }
    await writer.writeEndElement(); // </ColumnInfo>
  }
  await writer.writeStartElement("Rows");
  for (const row of dataset.iterRows()) {
    if (row.type) {
      await writer.writeStartElement("Row", { attributes: { type: row.type } });
    }
    else {
      await writer.writeStartElement("Row"); // no type 
    }
    for (const col of row.cols) {
      await writeColumn(writer, dataset, col);
    }
    if (row.orgRow && row.orgRow.length > 0) {
      await writer.writeStartElement("OrgRow");
      for (const orgCol of row.orgRow) {
        await writeColumn(writer, dataset, orgCol);
      }
      await writer.writeEndElement(); // </OrgRow>
    }
    await writer.writeEndElement(); // </Row>
  }
  await writer.writeEndElement(); // </Rows>
  await writer.writeEndElement(); // </Dataset>
}
async function writeColumn(writer: StaxXmlWriter, dataset: Dataset, col: Col): Promise<void> {
  if (col.value !== undefined && col.value !== null) {
    const colInfo = dataset.getColumnInfo(col.id);
    if (colInfo && colInfo.type) {
      await writer.writeStartElement("Col", { attributes: { id: col.id } });
      await writer.writeCharacters(convertToString(col.value, colInfo.type));
      await writer.writeEndElement();
    } else {
      throw new Error(`Column info for ${col.id} not found or type is undefined in dataset ${dataset.id}`);
    }
  }
  else {
    // If value is undefined or null, we still write the Col element with an empty value
    await writer.writeStartElement("Col", { attributes: { id: col.id }, selfClosing: true });
  }
}