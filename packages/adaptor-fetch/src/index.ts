import { StringWritableStream, XapiRoot, parse, write } from '@xapi-js/core';

export async function xapiFetch(url: string, xapi: XapiRoot, options?: RequestInit): Promise<XapiRoot> {
  const writer = new StringWritableStream();
  await write(writer, xapi);
  const xml = writer.getResult();

  const response = await fetch(url, {
    method: "POST", // Assuming POST is the default method for sending XAPI data
    ...options,
    headers: {
      'Content-Type': 'application/xml',
      ...options?.headers,
    },
    body: xml,
  });

  if (!response.body) {
    throw new Error('Response body is empty');
  }
  const retRoot = await parse(response.body);
  return retRoot;
}
