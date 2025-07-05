# @xapi-ts/core

This package provides core utilities and types for working with X-API data.

## Installation

```bash
# npm
npm install @xapi-ts/core

# yarn
yarn add @xapi-ts/core

# pnpm
pnpm add @xapi-ts/core

# bun
bun add @xapi-ts/core

# deno
deno add @xapi-ts/core
```

## Usage

`@xapi-ts/core` provides the fundamental classes and functions for working with X-API data.

### Parsing X-API XML

You can parse an X-API XML string into an `XapiRoot` object:

```typescript
import { parse, XapiRoot } from '@xapi-ts/core';

const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Parameters>
    <Parameter id="service">stock</Parameter>
    <Parameter id="method">search</Parameter>
  </Parameters>
</Root>`;

async function parseXapi() {
  const xapi = await parse(xmlString);
  console.log('Service:', xapi.getParameter('service')?.value);
  console.log('Method:', xapi.getParameter('method')?.value);
}

parseXapi();
```

### Creating and Manipulating XapiRoot

You can create an `XapiRoot` object and add parameters and datasets programmatically:

```typescript
import { XapiRoot, Dataset } from '@xapi-ts/core';

const xapi = new XapiRoot();

// Add parameters
xapi.addParameter({ id: 'resultCode', value: '0' });
xapi.addParameter({ id: 'resultMsg', value: 'SUCCESS' });

// Create and add a dataset
const usersDataset = new Dataset('users');
usersDataset.addColumn({ id: 'id', type: 'INT' });
usersDataset.addColumn({ id: 'name', type: 'STRING' });

usersDataset.newRow();
usersDataset.setColumn(0, 'id', 1);
usersDataset.setColumn(0, 'name', 'Alice');

usersDataset.newRow();
usersDataset.setColumn(1, 'id', 2);
usersDataset.setColumn(1, 'name', 'Bob');

xapi.addDataset(usersDataset);

console.log('XapiRoot created:', xapi);
```

### Serializing XapiRoot to XML

You can serialize an `XapiRoot` object back into an X-API XML string:

```typescript
import { write, XapiRoot, Dataset } from '@xapi-ts/core';

const xapi = new XapiRoot();
xapi.addParameter({ id: 'status', value: 'OK' });

const productsDataset = new Dataset('products');
productsDataset.addColumn({ id: 'productId', type: 'STRING' });
productsDataset.addColumn({ id: 'price', type: 'INT' });
productsDataset.newRow();
productsDataset.setColumn(0, 'productId', 'P001');
productsDataset.setColumn(0, 'price', 1000);
xapi.addDataset(productsDataset);

async function writeXapi() {
  const xmlOutput = await write(xapi);
  console.log('Generated XML:\n', xmlOutput);
}

writeXapi();
```

---

# @xapi-ts/core

이 패키지는 X-API 데이터를 다루기 위한 핵심 유틸리티 및 타입을 제공합니다.

## 설치

```bash
# npm
npm install @xapi-ts/core

# yarn
yarn add @xapi-ts/core

# pnpm
pnpm add @xapi-ts/core

# bun
bun add @xapi-ts/core

# deno
deno add @xapi-ts/core
```

## 사용법

`@xapi-ts/core`는 X-API 데이터를 다루기 위한 기본적인 클래스와 함수를 제공합니다.

### X-API XML 파싱

X-API XML 문자열을 `XapiRoot` 객체로 파싱할 수 있습니다:

```typescript
import { parse, XapiRoot } from '@xapi-ts/core';

const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
  <Parameters>
    <Parameter id="service">stock</Parameter>
    <Parameter id="method">search</Parameter>
  </Parameters>
</Root>`;

async function parseXapi() {
  const xapi = await parse(xmlString);
  console.log('서비스:', xapi.getParameter('service')?.value);
  console.log('메서드:', xapi.getParameter('method')?.value);
}

parseXapi();
```

### XapiRoot 생성 및 조작

`XapiRoot` 객체를 생성하고 매개변수 및 데이터셋을 프로그래밍 방식으로 추가할 수 있습니다:

```typescript
import { XapiRoot, Dataset } from '@xapi-ts/core';

const xapi = new XapiRoot();

// 매개변수 추가
xapi.addParameter({ id: 'resultCode', value: '0' });
xapi.addParameter({ id: 'resultMsg', value: 'SUCCESS' });

// 데이터셋 생성 및 추가
const usersDataset = new Dataset('users');
usersDataset.addColumn({ id: 'id', type: 'INT' });
usersDataset.addColumn({ id: 'name', type: 'STRING' });
let rowIdx: number;
rowIdx = usersDataset.newRow();
usersDataset.setColumn(rowIdx, 'id', 1);
usersDataset.setColumn(rowIdx, 'name', 'Alice');

rowIdx = usersDataset.newRow();
usersDataset.setColumn(rowIdx, 'id', 2);
usersDataset.setColumn(rowIdx, 'name', 'Bob');

xapi.addDataset(usersDataset);

console.log('XapiRoot 생성됨:', xapi);
```

### XapiRoot를 XML로 직렬화

`XapiRoot` 객체를 X-API XML 문자열로 다시 직렬화할 수 있습니다:

```typescript
import { write, XapiRoot, Dataset } from '@xapi-ts/core';

const xapi = new XapiRoot();
xapi.addParameter({ id: 'status', value: 'OK' });

const productsDataset = new Dataset('products');
productsDataset.addColumn({ id: 'productId', type: 'STRING' });
productsDataset.addColumn({ id: 'price', type: 'INT' });
productsDataset.newRow();
productsDataset.setColumn(0, 'productId', 'P001');
productsDataset.setColumn(0, 'price', 1000);
xapi.addDataset(productsDataset);

async function writeXapi() {
  const xmlOutput = await write(xapi);
  console.log('생성된 XML:\n', xmlOutput);
}

writeXapi();
```