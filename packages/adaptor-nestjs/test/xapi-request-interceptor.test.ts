import { describe, it, expect, vi } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { XapiRequestInterceptor } from '../src/xapi-request-interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { XapiRoot } from '@xapi-js/core';

describe('XapiRequestInterceptor', () => {
  let interceptor: XapiRequestInterceptor;

  beforeEach(() => {
    interceptor = new XapiRequestInterceptor();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should deserialize Nexacro XAPI XML input to XapiRoot object', async () => {
    const nexacroXmlInput = `<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Dataset id="test">
    <ColumnInfo>
      <Column id="intCol" size="10" type="INT" />
      <Column id="stringCol" size="50" type="STRING" />
    </ColumnInfo>
    <Rows>
      <Row>
        <Col id="intCol">123</Col>
        <Col id="stringCol">hello</Col>
      </Row>
      <Row>
        <Col id="intCol">456</Col>
        <Col id="stringCol">world</Col>
      </Row>
    </Rows>
  </Dataset>
</Root>`;

    const mockRequest = {
      body: nexacroXmlInput,
      headers: { 'content-type': 'application/xml' },
    };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
      }),
    } as ExecutionContext;

    const mockCallHandler = {
      handle: () => of({}), // Mock a successful handler call
    } as CallHandler;

    const observableResult = await interceptor.intercept(mockContext, mockCallHandler);
    await firstValueFrom(observableResult);
    const request = mockContext.switchToHttp().getRequest();

    expect(request.body).toBeInstanceOf(XapiRoot);
    expect(request.body.datasets).toBeDefined();
    expect(request.body.getDataset('test')).toBeDefined();
    const dataset = request.body.getDataset('test');
    expect(dataset.rows).toBeDefined();
    expect(dataset.rows.length).toBe(2);
    expect(dataset.getColumn(0, 'intCol')).toBe(123);
    expect(dataset.getColumn(0, 'stringCol')).toBe('hello');
    expect(dataset.getColumn(1, 'intCol')).toBe(456);
    expect(dataset.getColumn(1, 'stringCol')).toBe('world');
  });

  it('should not deserialize non-XML input', async () => {
    const jsonInput = `{ "data": "test" }`;
    const mockRequest = {
      body: jsonInput,
      headers: { 'content-type': 'application/json' },
    };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
      }),
    } as ExecutionContext;

    const mockCallHandler = {
      handle: () => of({}),
    } as CallHandler;

    const observableResult = await interceptor.intercept(mockContext, mockCallHandler);
    await firstValueFrom(observableResult);
    const request = mockContext.switchToHttp().getRequest();
    expect(request.body).toBe(jsonInput);
    expect(request.body).not.toBeInstanceOf(XapiRoot);
  });

  it('should pass through if no body is present', async () => {
    const mockRequest = {
      headers: { 'content-type': 'application/xml' },
    };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
      }),
    } as ExecutionContext;

    const mockCallHandler = {
      handle: () => of({}),
    } as CallHandler;

    const observableResult = await interceptor.intercept(mockContext, mockCallHandler);
    await firstValueFrom(observableResult);
    const request = mockContext.switchToHttp().getRequest();
    expect(request.body).toBeUndefined();
  });
});

