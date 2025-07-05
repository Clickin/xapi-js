import { XapiRoot, parse, writeString } from '@xapi-js/core';

/**
 * Sends an X-API request using the Fetch API and parses the XML response.
 *
 * @param url - The URL to send the request to.
 * @param xapi - The XapiRoot object to be serialized into the request body.
 * @param options - Optional Fetch API request initialization options.
 * @returns A Promise that resolves to an XapiRoot object parsed from the response.
 * @throws {Error} if the response body is empty.
 */
export async function xapiFetch(url: string, xapi: XapiRoot, options?: RequestInit): Promise<XapiRoot> {
  const xml = await writeString(xapi);

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