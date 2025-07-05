import { describe, expect, it } from "vitest";
import { Dataset, initXapi, NexaVersion, parse, write, XapiRoot, XplatformVersion } from "../src/index";

describe("Index Tests", () => {
	it("should export parse function", () => {
		expect(typeof parse).toBe("function");
	});

	it("should export write function", () => {
		expect(typeof write).toBe("function");
	});

	it("should export initXapi function", () => {
		expect(typeof initXapi).toBe("function");
	});

	it("should export XapiRoot class", () => {
		expect(XapiRoot).toBeDefined();
		const root = new XapiRoot();
		expect(root).toBeInstanceOf(XapiRoot);
	});

	it("should export Dataset class", () => {
		expect(Dataset).toBeDefined();
		const dataset = new Dataset("test");
		expect(dataset).toBeInstanceOf(Dataset);
	});

	it("should export version constants", () => {
		expect(NexaVersion).toBeDefined();
		expect(NexaVersion.xmlns).toBe("http://www.nexacroplatform.com/platform/dataset");
		expect(NexaVersion.version).toBe("4000");

		expect(XplatformVersion).toBeDefined();
		expect(XplatformVersion.xmlns).toBe("http://www.tobesoft.com/platform/Dataset");
		expect(XplatformVersion.version).toBe("4000");
	});

	it("should have working integration", async () => {
		const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <Root xmlns="http://www.tobesoft.com/platform/Dataset" ver="4000">
      <Parameters>
        <Parameter id="test">value</Parameter>
      </Parameters>
    </Root>`;

		// Test full workflow
		const xapiRoot = await parse(sampleXml);
		expect(xapiRoot.parameterSize()).toBe(1);
	});
});