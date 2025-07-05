import { describe, expect, it } from "vitest";
import { initXapi, parse, write } from "../src/handler";
import { NexaVersion, XapiOptions, XplatformVersion } from "../src/types";
import { Dataset, XapiRoot } from "../src/xapi-data";

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Parameters>
    <Parameter id="service">stock</Parameter>
    <Parameter id="method">search</Parameter>
  </Parameters>
  <Dataset id="output">
    <ColumnInfo>
      <ConstColumn id="market" size="10" type="STRING" value="kse" />
      <ConstColumn id="openprice" size="10" type="INT" value="15000" />
      <Column id="stockCode" size="5" type="STRING" />
      <Column id="currentprice" size="10" type="INT" />
    </ColumnInfo>
    <Rows>
      <Row>
        <Col id="stockCode">10001</Col>
        <Col id="currentprice">5700</Col>
      </Row>
      <Row>
        <Col id="stockCode">10002</Col>
        <Col id="currentprice">14500</Col>
      </Row>
    </Rows>
  </Dataset>
</Root>`;

const complexXml = `<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset" version="4000">
  <Parameters>
    <Parameter id="stringParam" type="STRING" value="testString" />
    <Parameter id="intParam" type="INT" value="123" />
    <Parameter id="floatParam" type="FLOAT" value="123.45" />
    <Parameter id="dateParam" type="DATE" value="20230615" />
    <Parameter id="datetimeParam" type="DATETIME" value="20230615143022" />
    <Parameter id="timeParam" type="TIME" value="143022" />
  </Parameters>
  <Dataset id="complexData">
    <ColumnInfo>
      <ConstColumn id="constString" size="10" type="STRING" value="const" />
      <ConstColumn id="constInt" size="10" type="INT" value="100" />
      <Column id="stringCol" size="50" type="STRING" />
      <Column id="intCol" size="10" type="INT" />
      <Column id="floatCol" size="10" type="FLOAT" />
      <Column id="decimalCol" size="10" type="DECIMAL" />
      <Column id="bigDecimalCol" size="10" type="BIGDECIMAL" />
      <Column id="dateCol" size="8" type="DATE" />
      <Column id="datetimeCol" size="14" type="DATETIME" />
      <Column id="timeCol" size="6" type="TIME" />
      <Column id="blobCol" size="100" type="BLOB" />
    </ColumnInfo>
    <Rows>
      <Row type="insert">
        <Col id="stringCol">test string</Col>
        <Col id="intCol">42</Col>
        <Col id="floatCol">3.14</Col>
        <Col id="decimalCol">99.99</Col>
        <Col id="bigDecimalCol">1234567890</Col>
        <Col id="dateCol">20230615</Col>
        <Col id="datetimeCol">20230615143022</Col>
        <Col id="timeCol">143022</Col>
        <Col id="blobCol">SGVsbG8gV29ybGQ=</Col>
        <OrgRow>
          <Col id="stringCol">old string</Col>
          <Col id="intCol">24</Col>
        </OrgRow>
      </Row>
      <Row type="update">
        <Col id="stringCol"></Col>
        <Col id="intCol" />
      </Row>
    </Rows>
  </Dataset>
</Root>`;

const emptyDatasetXml = `<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Dataset id="empty">
    <ColumnInfo>
    </ColumnInfo>
    <Rows>
    </Rows>
  </Dataset>
</Root>`;

class StringWritableStream extends WritableStream<Uint8Array> {
  private result: string = '';

  constructor() {
    const decoder = new TextDecoder();
    super({
      write: (chunk: Uint8Array) => {
        this.result += decoder.decode(chunk, { stream: true });
      },
      close: () => {
        this.result += decoder.decode();
      }
    });
  }

  getResult(): string {
    return this.result;
  }
}

describe("Xapi Handler Tests", () => {
  it("should parse XML to XapiRoot", async () => {
    const xapiRoot = await parse(sampleXml);
    expect(xapiRoot).toBeInstanceOf(XapiRoot);
    expect(xapiRoot.parameterSize()).toBe(2);
    expect(xapiRoot.datasetSize()).toBe(1);

    const dataset = xapiRoot.datasets[0];
    expect(dataset.id).toBe("output");
    expect(dataset.constColumnSize()).toBe(2);
    expect(dataset.columnSize()).toBe(2);
    expect(dataset.rows.length).toBe(2);
  });

  it("should write XapiRoot to XML", async () => {
    const xapiRoot = await parse(sampleXml);
    const writer = new StringWritableStream();
    await write(writer, xapiRoot);
    const xmlOutput = writer.getResult();
    expect(xmlOutput).toContain('<Dataset id="output">');
  });

  it("should initialize XAPI with options", () => {
    const options: XapiOptions = {
      xapiVersion: NexaVersion,
      parseToTypes: false
    };

    // Should not throw an error
    expect(() => initXapi(options)).not.toThrow();
  });

  it("should parse ReadableStream input", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sampleXml));
        controller.close();
      }
    });

    const xapiRoot = await parse(stream);
    expect(xapiRoot).toBeInstanceOf(XapiRoot);
    expect(xapiRoot.parameterSize()).toBe(2);
  });

  it("should parse complex XML with different data types", async () => {
    // Initialize with parseToTypes enabled
    initXapi({ parseToTypes: true });

    const xapiRoot = await parse(complexXml);
    expect(xapiRoot.parameterSize()).toBe(6);
    expect(xapiRoot.datasetSize()).toBe(1);

    const dataset = xapiRoot.datasets[0];
    expect(dataset.id).toBe("complexData");
    expect(dataset.constColumnSize()).toBe(2);
    expect(dataset.columnSize()).toBe(9);
    expect(dataset.rows.length).toBe(2);

    // Test row with type
    const firstRow = dataset.rows[0];
    expect(firstRow.type).toBe("insert");
    expect(firstRow.orgRow).toBeDefined();
    expect(firstRow.orgRow?.length).toBe(2);

    // Test second row type
    const secondRow = dataset.rows[1];
    expect(secondRow.type).toBe("update");
  });

  it("should parse empty dataset", async () => {
    const xapiRoot = await parse(emptyDatasetXml);
    expect(xapiRoot.datasetSize()).toBe(1);

    const dataset = xapiRoot.datasets[0];
    expect(dataset.id).toBe("empty");
    expect(dataset.constColumnSize()).toBe(0);
    expect(dataset.columnSize()).toBe(0);
    expect(dataset.rows.length).toBe(0);
  });

  it("should throw error when Col is defined before Row", async () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="invalid">
        <ColumnInfo>
          <Column id="test" size="10" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Col id="test">value</Col>
        </Rows>
      </Dataset>
    </Root>`;

    await expect(parse(invalidXml)).rejects.toThrow("Row must be defined before Col");
  });

  it("should throw error when OrgRow is defined before Row", async () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="invalid">
        <ColumnInfo>
          <Column id="test" size="10" type="STRING" />
        </ColumnInfo>
        <Rows>
          <OrgRow>
            <Col id="test">value</Col>
          </OrgRow>
        </Rows>
      </Dataset>
    </Root>`;

    await expect(parse(invalidXml)).rejects.toThrow("Row must be defined before OrgRow");
  });

  it("should throw error when column not found in dataset", async () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="invalid">
        <ColumnInfo>
          <Column id="validCol" size="10" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="invalidCol">value</Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    await expect(parse(invalidXml)).rejects.toThrow("Column with id invalidCol not found in dataset invalid");
  });

  it("should write complex data types correctly", async () => {
    const root = new XapiRoot();

    // Add parameters with different types
    root.addParameter({ id: "stringParam", type: "STRING", value: "test" });
    root.addParameter({ id: "intParam", type: "INT", value: 123 });
    root.addParameter({ id: "dateParam", type: "DATE", value: new Date(2023, 5, 15) });
    root.addParameter({ id: "blobParam", type: "BLOB", value: new Uint8Array([72, 101, 108, 108, 111]) });

    // Add dataset
    const dataset = new Dataset("test");
    dataset.addColumn({ id: "testCol", size: 10, type: "STRING" });
    dataset.newRow();
    dataset.rows[0].cols.push({ id: "testCol", value: "testValue" });
    root.addDataset(dataset);

    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('id="stringParam"');
    expect(xmlOutput).toContain('value="test"');
    expect(xmlOutput).toContain('id="intParam"');
    expect(xmlOutput).toContain('value="123"');
    expect(xmlOutput).toContain('id="dateParam"');
    expect(xmlOutput).toContain('value="20230615"');
    expect(xmlOutput).toContain('id="blobParam"');
    expect(xmlOutput).toContain('<Dataset id="test">');
  });

  it("should write empty root without parameters or datasets", async () => {
    const root = new XapiRoot();
    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('<Root');
    expect(xmlOutput).not.toContain('<Parameters>');
    expect(xmlOutput).not.toContain('<Datasets>');
  });

  it("should write dataset with rows containing orgRow", async () => {
    const root = new XapiRoot();
    const dataset = new Dataset("test");

    dataset.addColumn({ id: "col1", size: 10, type: "STRING" });
    dataset.addColumn({ id: "col2", size: 10, type: "INT" });

    const rowIndex = dataset.newRow();
    dataset.rows[rowIndex].type = "update";
    dataset.rows[rowIndex].cols.push({ id: "col1", value: "newValue" });
    dataset.rows[rowIndex].cols.push({ id: "col2", value: 100 });
    dataset.rows[rowIndex].orgRow = [
      { id: "col1", value: "oldValue" },
      { id: "col2", value: 50 }
    ];

    root.addDataset(dataset);

    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('<Row type="update">');
    expect(xmlOutput).toContain('<OrgRow>');
    expect(xmlOutput).toContain('oldValue');
    expect(xmlOutput).toContain('newValue');
  });

  it("should write column with undefined value as self-closing", async () => {
    const root = new XapiRoot();
    const dataset = new Dataset("test");

    dataset.addColumn({ id: "col1", size: 10, type: "STRING" });
    const rowIndex = dataset.newRow();
    dataset.rows[rowIndex].cols.push({ id: "col1", value: undefined });

    root.addDataset(dataset);

    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('<Col id="col1"');
    expect(xmlOutput).toContain('/>'); // self-closing tag
  });

  it("should handle parameters with undefined values", async () => {
    const root = new XapiRoot();
    root.addParameter({ id: "undefinedParam" }); // no value

    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('id="undefinedParam"');
    expect(xmlOutput).not.toContain('value=');
  });

  it("should handle type conversion with parseToTypes disabled", async () => {
    initXapi({ parseToTypes: false });

    const xmlWithTypes = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="intCol" size="10" type="INT" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="intCol">123</Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithTypes);
    const dataset = xapiRoot.datasets[0];
    const colValue = dataset.getColumn(0, "intCol");

    // Should remain as string when parseToTypes is false
    expect(typeof colValue).toBe("string");
    expect(colValue).toBe("123");
  });

  it("should handle orgRow parsing with type='update' and parseToTypes enabled", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithOrgRow = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="intCol" size="10" type="INT" />
        </ColumnInfo>
        <Rows>
          <Row type="update">
            <Col id="intCol">123</Col>
            <OrgRow>
              <Col id="intCol">456</Col>
            </OrgRow>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithOrgRow);
    const dataset = xapiRoot.datasets[0];
    const row = dataset.rows[0];

    expect(row.type).toBe("update");
    expect(row.orgRow).toBeDefined();
    expect(row.orgRow?.length).toBe(1);
    expect(row.orgRow?.[0].value).toBe(456); // Should be parsed as number
  });

  it("should handle empty column values", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithEmptyCol = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="intCol" size="10" type="INT" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="intCol"></Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithEmptyCol);
    const dataset = xapiRoot.getDataset("test");
    expect(dataset).toBeDefined();
    expect(dataset?.rowSize()).toBe(1);
    const colValue = dataset?.getColumn(0, "intCol");

    expect(colValue).toBeUndefined();
  });

  it("should use custom XapiVersion in write", async () => {
    initXapi({ xapiVersion: XplatformVersion });

    const root = new XapiRoot();
    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('xmlns="http://www.tobesoft.com/platform/Dataset"');
    expect(xmlOutput).toContain('version="4000"');
  });

  it("should handle CDATA values in columns", async () => {
    initXapi({ parseToTypes: false });

    const xmlWithCdata = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="textCol" size="100" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="textCol"><![CDATA[<script>alert('test')</script>]]></Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithCdata);
    const dataset = xapiRoot.datasets[0];
    const colValue = dataset.getColumn(0, "textCol");

    expect(colValue).toBe("<script>alert('test')</script>");
  });

  it("should handle CDATA values in columns with parseToTypes enabled", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithCdata = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="intCol" size="10" type="INT" />
          <Column id="textCol" size="100" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="intCol"><![CDATA[123]]></Col>
            <Col id="textCol"><![CDATA[<script>alert('test')</script>]]></Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithCdata);
    const dataset = xapiRoot.datasets[0];
    const intColValue = dataset.getColumn(0, "intCol");
    const textColValue = dataset.getColumn(0, "textCol");

    expect(intColValue).toBe(123); // Should be parsed as number
    expect(textColValue).toBe("<script>alert('test')</script>");
  });

  it("should handle plain text values in columns with parseToTypes enabled", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithPlainText = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="intCol" size="10" type="INT" />
          <Column id="textCol" size="100" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="intCol">456</Col>
            <Col id="textCol">plain&#32;text&#32;value</Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithPlainText);
    const dataset = xapiRoot.datasets[0];
    const intColValue = dataset.getColumn(0, "intCol");
    const textColValue = dataset.getColumn(0, "textCol");

    expect(intColValue).toBe(456); // Should be parsed as number
    expect(textColValue).toBe("plain text value");
  });

  it("should handle self-closing Col tags resulting in undefined value for non-string types", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithSelfClosingCol = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="nullIntCol" size="10" type="INT" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="nullIntCol" />
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithSelfClosingCol);
    const dataset = xapiRoot.datasets[0];
    const colValue = dataset.getColumn(0, "nullIntCol");

    expect(colValue).toBeUndefined();
  });

  it("should handle self-closing Col tags in OrgRow resulting in undefined value", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithOrgRowSelfClosing = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="testCol" size="10" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row type="update">
            <Col id="testCol">newValue</Col>
            <OrgRow>
              <Col id="testCol" />
            </OrgRow>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithOrgRowSelfClosing);
    const dataset = xapiRoot.datasets[0];
    const row = dataset.rows[0];

    expect(row.orgRow).toBeDefined();
    expect(row.orgRow?.length).toBe(1);
    expect(row.orgRow?.[0].value).toBeUndefined();
  });

  it("should handle empty character data in Col tags", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithEmptyCharCol = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="emptyCharCol" size="10" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="emptyCharCol"></Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithEmptyCharCol);
    const dataset = xapiRoot.datasets[0];
    const colValue = dataset.getColumn(0, "emptyCharCol");

    expect(colValue).toBeUndefined();
  });

  

  it("should handle invalid type conversions gracefully", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithInvalidTypes = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="intCol" size="10" type="INT" />
          <Column id="floatCol" size="10" type="FLOAT" />
          <Column id="dateCol" size="8" type="DATE" />
          <Column id="blobCol" size="100" type="BLOB" />
        </ColumnInfo>
        <Rows>
          <Row>
            <Col id="intCol">not_a_number</Col>
            <Col id="floatCol">not_a_float</Col>
            <Col id="dateCol">invalid_date</Col>
            <Col id="blobCol">invalid_base64!</Col>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithInvalidTypes);
    const dataset = xapiRoot.datasets[0];

    // Invalid conversions should return the original string value
    expect(dataset.getColumn(0, "intCol")).toBe("not_a_number");
    expect(dataset.getColumn(0, "floatCol")).toBe("not_a_float");
    expect(dataset.getColumn(0, "dateCol")).toBe("invalid_date");
    expect(dataset.getColumn(0, "blobCol")).toBe("invalid_base64!");
  });

  it("should handle OrgRow with self-closing Col tags", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithOrgRowSelfClosing = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="testCol" size="10" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row type="update">
            <Col id="testCol">newValue</Col>
            <OrgRow>
              <Col id="testCol" />
            </OrgRow>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithOrgRowSelfClosing);
    const dataset = xapiRoot.datasets[0];
    const row = dataset.rows[0];

    expect(row.orgRow).toBeDefined();
    expect(row.orgRow?.length).toBe(1);
    expect(row.orgRow?.[0].value).toBeUndefined();
  });

  it("should handle parameter with Date value in write", async () => {
    const root = new XapiRoot();
    root.addParameter({
      id: "timeParam",
      type: "TIME",
      value: new Date(2023, 5, 15, 14, 30, 22)
    });

    const writer = new StringWritableStream();
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('id="timeParam"');
    expect(xmlOutput).toContain('type="TIME"');
    expect(xmlOutput).toContain('value="143022"');
  });

  it("should handle CDATA values in OrgRow with parseToTypes enabled", async () => {
    initXapi({ parseToTypes: true });

    const xmlWithOrgRowCdata = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Dataset id="test">
        <ColumnInfo>
          <Column id="textCol" size="100" type="STRING" />
        </ColumnInfo>
        <Rows>
          <Row type="update">
            <Col id="textCol">newValue</Col>
            <OrgRow>
              <Col id="textCol"><![CDATA[original_cdata_value]]></Col>
            </OrgRow>
          </Row>
        </Rows>
      </Dataset>
    </Root>`;

    const xapiRoot = await parse(xmlWithOrgRowCdata);
    const dataset = xapiRoot.datasets[0];
    const row = dataset.rows[0];

    expect(row.orgRow).toBeDefined();
    expect(row.orgRow?.length).toBe(1);
    expect(row.orgRow?.[0].value).toBe("original_cdata_value");
  });

  it("should handle unknown column type gracefully", async () => {
    initXapi({ parseToTypes: true });

    const root = new XapiRoot();
    const dataset = new Dataset("test");
    dataset.addColumn({ id: "unknownCol", size: 10, type: "UNKNOWN" as any });
    dataset.newRow();
    dataset.rows[0].cols.push({ id: "unknownCol", value: "testValue" });
    root.addDataset(dataset);

    const writer = new StringWritableStream();
    // Should not throw an error
    await write(writer, root);
    const xmlOutput = writer.getResult();

    expect(xmlOutput).toContain('type="UNKNOWN"');
    expect(xmlOutput).toContain('testValue');
  });
});