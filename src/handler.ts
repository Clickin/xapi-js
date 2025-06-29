import { StaxXmlParser } from "stax-xml";
import { XapiRoot } from "./xapi-data";


async function parse(reader: ReadableStream | string): Promise<XapiRoot> {
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
  const xmlParser = new StaxXmlParser(_stream,);
  return new XapiRoot();
}