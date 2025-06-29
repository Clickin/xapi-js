import { NexaVersion, XapiOptions } from "./types";

const defaultOptions: XapiOptions = {
  xapiVersion: NexaVersion,
  castToColumnType: true // Default to true for casting values to their respective column types
};

export let _options: XapiOptions = {
  ...defaultOptions
};


export function initXapi(options: XapiOptions) {
  // Initialize the XAPI with the provided options
  console.log("Initializing XAPI with options:", options);
  // Here you would typically set up the environment, load necessary libraries, etc.
  // how to set added options to _options
  _options = {
    ...options
  };
}