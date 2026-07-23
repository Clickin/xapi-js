/**
 * @module @xapi-ts/core
 * @description Main entry point for the @xapi-ts/core library, providing core functionalities for X-API data handling.
 */
export { initXapi, parse, write } from './handler';
export * from './types';
export * from './utils';
export * from './schema';
export { Dataset, XapiRoot } from './xapi-data';
export * from './codec';
export * from './wire-types';
export * from './wire-common';
export * from './json-wire';
export * from './xml-wire';
export * from './ssv-wire';
export * from './binary-wire';
export * from './wire-codec';
