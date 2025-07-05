import { XapiRoot } from '@xapi-js/core';
import { NextFunction } from 'express';
import { createRequest, createResponse } from 'node-mocks-http';
import { describe, expect, it, vi } from 'vitest';
import { xapiExpress } from '../src/index';

describe('xapiExpress middleware', () => {
  let next: NextFunction = vi.fn();

  it('should process a valid request and send back a response', async () => {
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
    const reqHeaders = new Headers();
    reqHeaders.set('content-type', 'application/xml');
    const mockReq = createRequest({
      method: "POST",
      body: sampleXml,
      headers: {
        "content-type": "application/xml",
      },
    });
    const mockHandlerRes = new XapiRoot();
    const mockHandler = vi.fn();
    mockHandler.mockImplementation(async (xapi: XapiRoot) => {
      const ret = new XapiRoot();
      ret.addParameter({ id: 'response', value: 'success' });
      return ret;
    })
    const middleware = xapiExpress(mockHandler);
    const mockRes = createResponse();

    // Response 메서드들을 spy로 설정
    const setHeaderSpy = vi.spyOn(mockRes, 'setHeader');
    const writeSpy = vi.spyOn(mockRes, 'write');
    const endSpy = vi.spyOn(mockRes, 'end');

    await middleware(mockReq, mockRes, next);

    expect(mockHandler).toHaveBeenCalled();
    expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'application/xml');
    expect(writeSpy).toHaveBeenCalled(); // Assert write was called
    expect(endSpy).toHaveBeenCalled();   // Assert end was called
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next if content-type is not application/xml', async () => {
    const mockReq = createRequest({
      method: "POST",
      body: "some plain text",
      headers: {
        "content-type": "text/plain",
      },
    });
    const mockHandler = vi.fn();
    const middleware = xapiExpress(mockHandler);
    const mockRes = createResponse();

    await middleware(mockReq, mockRes, next);

    expect(mockHandler).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should call next with an error if XML parsing fails', async () => {
    const mockReq = createRequest({
      method: "POST",
      body: "invalid xml",
      headers: {
        "content-type": "application/xml",
      },
    });
    const mockHandler = vi.fn();
    const middleware = xapiExpress(mockHandler);
    const mockRes = createResponse();

    await middleware(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});