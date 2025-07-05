import { XapiRoot } from '@xapi-js/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import { xapiFetch } from '../src';

const fetchMock = createFetchMock(vi);
fetchMock.enableMocks();

describe('xapiFetch', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('should send a POST request with the serialized XapiRoot and return a parsed XapiRoot', async () => {
    fetchMock.mockResponseOnce(`<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Parameters>
    <Parameter id="response" type="STRING" size="255">success</Parameter>
  </Parameters>
</Root>`);
    const xapi = new XapiRoot();
    xapi.addParameter({ id: 'test', value: 'value' });
    const responseXapi = await xapiFetch('http://localhost:3000/xapi/single-parameter', xapi);
    expect(responseXapi).toBeInstanceOf(XapiRoot);
    expect(responseXapi.getParameter('response')?.value).toBe('success');
  });

  it('should handle multiple parameters in the response', async () => {
    fetchMock.mockResponseOnce(`<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Parameters>
    <Parameter id="response1" type="STRING" size="255">success1</Parameter>
    <Parameter id="response2" type="STRING" size="255">success2</Parameter>
  </Parameters>
</Root>`);
    const xapi = new XapiRoot();
    xapi.addParameter({ id: 'test', value: 'value' });
    const responseXapi = await xapiFetch('http://localhost:3000/xapi/multiple-parameters', xapi);
    expect(responseXapi).toBeInstanceOf(XapiRoot);
    expect(responseXapi.getParameter('response1')?.value).toBe('success1');
    expect(responseXapi.getParameter('response2')?.value).toBe('success2');
  });

  it('should handle a dataset in the response', async () => {
    fetchMock.mockResponseOnce(`<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Dataset id="dataset1">
    <ColumnInfo>
      <Column id="response" type="STRING" size="255"/>
      <Column id="additionalInfo" type="STRING" size="255"/>
    </ColumnInfo>
    <Rows>
      <Row>
        <Col id="response">success</Col>
        <Col id="additionalInfo">info</Col>
      </Row>
    </Rows>
  </Dataset>
</Root>`);
    const xapi = new XapiRoot();
    xapi.addParameter({ id: 'test', value: 'value' });
    const responseXapi = await xapiFetch('http://localhost:3000/xapi/single-dataset', xapi);
    expect(responseXapi).toBeInstanceOf(XapiRoot);
    const dataset = responseXapi.getDataset('dataset1');
    expect(dataset).toBeDefined();
    expect(dataset?.getColumn(0, 'response')).toBe('success');
    expect(dataset?.getColumn(0, 'additionalInfo')).toBe('info');
  });
  it('if the response body is empty, it should throw an error', async () => {
    fetchMock.mockResponseOnce(undefined, { status: 404 });
    const xapi = new XapiRoot();
    xapi.addParameter({ id: 'test', value: 'value' });
    await expect(xapiFetch('http://localhost:3000/xapi/empty-response', xapi)).rejects.toThrow('Response body is empty');
  });
  it('should handle additional headers in the request', async () => {
    fetchMock.mockResponseOnce(`<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Parameters>
    <Parameter id="response" type="STRING" size="255">success</Parameter>
  </Parameters>
</Root>`);
    const xapi = new XapiRoot();
    xapi.addParameter({ id: 'test', value: 'value' });
    const responseXapi = await xapiFetch('http://localhost:3000/xapi/headers', xapi, {
      headers: {
        'Custom-Header': 'CustomValue',
      },
    });
    expect(responseXapi).toBeInstanceOf(XapiRoot);
    expect(responseXapi.getParameter('response')?.value).toBe('success');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/xapi/headers', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/xml',
        'Custom-Header': 'CustomValue',
      }),
    }));
  });
});
