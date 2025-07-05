import { describe, it, expect, vi } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { XapiResponseInterceptor } from '../src/xapi-response-interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { XapiRoot, Dataset, Column, Row, Col } from '@xapi-js/core';

describe('XapiResponseInterceptor', () => {
  let interceptor: XapiResponseInterceptor;

  beforeEach(() => {
    interceptor = new XapiResponseInterceptor();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should serialize XapiRoot output to Nexacro XAPI XML string', async () => {
    const xapiRootOutput = new XapiRoot();
    const dataset = new Dataset('test');
    dataset.addColumn({ id: 'intCol', size: 10, type: 'INT' });
    dataset.addColumn({ id: 'stringCol', size: 50, type: 'STRING' });

    dataset.newRow();
    dataset.setColumn(0, 'intCol', 123);
    dataset.setColumn(0, 'stringCol', 'hello');

    dataset.newRow();
    dataset.setColumn(1, 'intCol', 456);
    dataset.setColumn(1, 'stringCol', 'world');

    xapiRootOutput.addDataset(dataset);

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as ExecutionContext;

    const mockCallHandler = {
      handle: () => of(xapiRootOutput),
    } as CallHandler;

    const observableResult = interceptor.intercept(mockContext, mockCallHandler);
    const result = await firstValueFrom(observableResult);
    expect(typeof result).toBe('string');
    expect(result).toContain('<Root xmlns="http://www.nexacroplatform.com/platform/dataset" version="4000">');
    expect(result).toContain('<Dataset id="test">');
    expect(result).toMatch(/<Column id="intCol" size="10" type="INT"\s*\/>/);
    expect(result).toMatch(/<Column id="stringCol" size="50" type="STRING"\s*\/>/);
    expect(result).toContain('<Rows>');
    expect(result).toContain('<Row>');
    expect(result).toContain('<Col id="intCol">123</Col>');
    expect(result).toContain('<Col id="stringCol">hello</Col>');
    expect(result).toContain('<Col id="intCol">456</Col>');
    expect(result).toContain('<Col id="stringCol">world</Col>');
    expect(result).toContain('</Row>');
    expect(result).toContain('</Rows>');
    expect(result).toContain('</Dataset>');
    expect(result).toContain('</Root>');
  });

  it('should throw an error if handler does not return XapiRoot', async () => {
    const nonXapiRootOutput = { message: 'hello' };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as ExecutionContext;

    const mockCallHandler = {
      handle: () => of(nonXapiRootOutput),
    } as CallHandler;

    const observableResult = interceptor.intercept(mockContext, mockCallHandler);
    await expect(firstValueFrom(observableResult)).rejects.toThrow('Handler did not return an XapiRoot instance');
  });
});
