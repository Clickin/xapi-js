import { CdataEvent, CharactersEvent, EndElementEvent, StartElementEvent, StaxXmlParser, StaxXmlWriter, XmlEventType } from "stax-xml";
import { Col, ColumnType, NexaVersion, Parameter, RowType, XapiOptions, XapiValueType } from "./types";
import { base64ToUint8Array, dateToString, makeParseEntities, makeWriterEntities, stringToDate, StringWritableStream, uint8ArrayToBase64 } from "./utils";
import { Dataset, XapiRoot } from "./xapi-data";

const defaultOptions: XapiOptions = {
  xapiVersion: NexaVersion,
  parseToTypes: true,
};

let _options: XapiOptions = {
  ...defaultOptions
};


export function initXapi(options: XapiOptions) {
  // Initialize the XAPI with the provided options
  // Here you would typically set up the environment, load necessary libraries, etc.
  // how to set added options to _options
  _options = {
    ...options
  };
}


export async function parse(reader: ReadableStream | string): Promise<XapiRoot> {
  // Implement your parsing logic here
  let _stream: ReadableStream;
  if (typeof reader === "string") {
    // If the reader is a string, convert it to a ReadableStream
    _stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(reader));
        controller.close();
      }
    });
  }
  else {
    _stream = reader;
  }
  const xmlParser = new StaxXmlParser(_stream, {
    addEntities: makeParseEntities(),
    encoding: "UTF-8",
  });
  const xapiRoot = new XapiRoot();
  for await (const event of xmlParser) {
    if (event.type === XmlEventType.START_ELEMENT) {
      const startEvent = event as StartElementEvent;
      switch (startEvent.localName) {
        case "Parameter":
          let paramValue: XapiValueType = undefined;
          const charEvent = (await xmlParser.next()).value;
          if (charEvent.type === XmlEventType.CDATA) {
            paramValue = (charEvent as CdataEvent).value;
          }
          else if (charEvent.type === XmlEventType.CHARACTERS) {
            paramValue = (charEvent as CharactersEvent).value;
          }
          xapiRoot.addParameter({
            id: startEvent.attributes["id"],
            type: startEvent.attributes["type"] as ColumnType || "STRING",
            value: _options.parseToTypes ? convertToColumnType(paramValue, startEvent.attributes["type"] as ColumnType || "STRING") : paramValue,
          });
          break;
        case "Dataset":
          xapiRoot.addDataset(await parseDataset(startEvent, xmlParser));
          break;
      }
    }
  }
  return xapiRoot;
}

async function parseDataset(initEvent: StartElementEvent, xmlParser: StaxXmlParser): Promise<Dataset> {
  const dataset = new Dataset(initEvent.attributes["id"]);
  let currentRowIndex = -1;
  for await (const event of xmlParser) {
    if (event.type === XmlEventType.END_ELEMENT && (event as EndElementEvent).localName === "Dataset") { // </Dataset>
      // End of dataset parsing
      break;
    } else if (event.type === XmlEventType.START_ELEMENT) {
      const startEvent = event as StartElementEvent;
      switch (startEvent.localName) {
        case "ConstColumn":
          dataset.addConstColumn({
            id: startEvent.attributes["id"],
            size: parseInt(startEvent.attributes["size"] || "0", 10),
            type: startEvent.attributes["type"] as ColumnType || "STRING",
            value: startEvent.attributes["value"] || ""
          });
          break;
        case "Column":
          dataset.addColumn({
            id: startEvent.attributes["id"],
            size: parseInt(startEvent.attributes["size"] || "0", 10),
            type: startEvent.attributes["type"] as ColumnType || "STRING"
          });
          break;
        case "Row":
          currentRowIndex = dataset.newRow();
          dataset.rows[currentRowIndex].type = startEvent.attributes["type"] as RowType || undefined;
          break;
        case "Col": {
          await parseCol(xmlParser, startEvent, dataset, currentRowIndex, false);
          break;
        }
        case "OrgRow":
          if (currentRowIndex < 0) {
            throw new Error("Row must be defined before OrgRow");
          }
          dataset.rows[currentRowIndex].orgRow = [];
          for await (const orgRowEvent of xmlParser) {
            if (orgRowEvent.type === XmlEventType.END_ELEMENT && (orgRowEvent as EndElementEvent).localName === "OrgRow") {
              break; // Exit when we reach the end of OrgRow
            }
            if (orgRowEvent.type === XmlEventType.START_ELEMENT && (orgRowEvent as StartElementEvent).localName === "Col") {
              const orgColEvent = orgRowEvent as StartElementEvent;
              await parseCol(xmlParser, orgColEvent, dataset, currentRowIndex, true);
            }
          }
      }
    }
  }
  return dataset;
}

async function parseCol(xmlParser: StaxXmlParser, startEvent: StartElementEvent, dataset: Dataset, currentRowIndex: number, isOrgRow: boolean): Promise<void> {
  if (currentRowIndex < 0) {
    throw new Error("Row must be defined before Col");
  }
  const colId = startEvent.attributes["id"];
  const colIndex = dataset.getColumnIndex(colId);
  if (colIndex === undefined || colIndex < 0) {
    throw new Error(`Column with id ${colId} not found in dataset ${dataset.id}`);
  }
  const colCharEvent = (await xmlParser.next()).value;
  let value;
  if (colCharEvent.type === XmlEventType.CDATA) {
    value = (colCharEvent as CdataEvent).value;
  }
  else if (colCharEvent.type === XmlEventType.CHARACTERS) {
    value = (colCharEvent as CharactersEvent).value;
  }
  let castedValue: XapiValueType = value;
  if (_options.parseToTypes) {
    const colType = dataset.getColumnInfo(colId)?.type;
    if (!colType) {
      throw new Error(`Column type for ${colId} not found in dataset ${dataset.id}`);
    }
    castedValue = convertToColumnType(value, colType);
  }
  if (!isOrgRow) {
    dataset.rows[currentRowIndex].cols.push({ id: colId, value: castedValue });
  } else {
    // If it's an OrgRow, we push the column with the value
    dataset.rows[currentRowIndex].orgRow!.push({ id: colId, value: castedValue });
  }
}


function convertToColumnType(value: XapiValueType, type: ColumnType): XapiValueType {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  switch (type) {
    case "INT":
    case "BIGDECIMAL":
      const intValue = parseInt(value as string, 10);
      return isNaN(intValue) ? value : intValue;
    case "FLOAT":
      const floatValue = parseFloat(value as string);
      return isNaN(floatValue) ? value : floatValue;
    case "DECIMAL":
      const decimalValue = parseFloat(value as string);
      return isNaN(decimalValue) ? value : decimalValue;
    case "DATE":
    case "DATETIME":
    case "TIME":
      return stringToDate(value as string) || value;
    case "BLOB":
      try {
        return base64ToUint8Array(value as string);
      } catch {
        return value;
      }
    default:
      return value; // Default to string
  }
}

function convertToString(value: XapiValueType, type: ColumnType): string {
  if (value === undefined || value === null) {
    return "";
  }
  switch (type) {
    case "INT":
    case "BIGDECIMAL":
    case "FLOAT":
    case "DECIMAL":
      return String(value);
    case "DATE":
    case "DATETIME":
    case "TIME":
      return dateToString(value as Date, type);
    case "BLOB":
      return uint8ArrayToBase64(value as Uint8Array);
    default:
      return String(value); // Default to string
  }
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
      if (parameter.type) {
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
    const colInfo = dataset.getColumnInfo(col.id)!;
    await writer.writeStartElement("Col", { attributes: { id: col.id } });
    await writer.writeCharacters(convertToString(col.value, colInfo.type));
    await writer.writeEndElement();
  }
  else {
    // If value is undefined or null, we still write the Col element with an empty value
    await writer.writeStartElement("Col", { attributes: { id: col.id }, selfClosing: true });
  }
}