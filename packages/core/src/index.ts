/**
 * @module @xapi-ts/core
 * @description Main entry point for the @xapi-ts/core library, providing core functionalities for X-API data handling.
 */
export { initXapi, parse, write, writeString } from './handler';
export * from './types';
export * from './utils';
export { Dataset, XapiRoot } from './xapi-data';