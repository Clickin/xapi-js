import {
  decodeRoot,
  encodeRoot,
  parse,
  RequestOf,
  ResponseOf,
  write,
  XapiOperation,
  XapiRoot,
} from '@xapi-js/core';

/**
 * Sends an X-API request using the Fetch API and parses the XML response.
 *
 * @param url - The URL to send the request to.
 * @param xapi - The XapiRoot object to be serialized into the request body.
 * @param options - Optional Fetch API request initialization options.
 * @returns A Promise that resolves to an XapiRoot object parsed from the response.
 * @throws {Error} if the response body is empty.
 */
export function xapiFetch(url: string, xapi: XapiRoot, options?: RequestInit): Promise<XapiRoot>;
export function xapiFetch<Operation extends XapiOperation>(
  url: string,
  operation: Operation,
  request: RequestOf<Operation>,
  options?: RequestInit,
): Promise<ResponseOf<Operation>>;
export async function xapiFetch(
  url: string,
  input: XapiRoot | XapiOperation,
  requestOrOptions?: unknown,
  operationOptions?: RequestInit,
): Promise<XapiRoot | ResponseOf<XapiOperation>> {
  const operation = input instanceof XapiRoot ? undefined : input;
  const requestRoot: XapiRoot = operation
    ? encodeRoot(operation.request, requestOrOptions as RequestOf<typeof operation>)
    : input as XapiRoot;
  const options = operation ? operationOptions : requestOrOptions as RequestInit | undefined;
  const xml = write(requestRoot);

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
  const text = await response.text();
  const retRoot = parse(text);
  return operation ? decodeRoot(operation.response, retRoot) : retRoot;
}
