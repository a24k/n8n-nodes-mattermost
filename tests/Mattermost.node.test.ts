import { describe, expect, it } from "bun:test";
import type { IExecuteFunctions, INodeExecutionData } from "n8n-workflow";
import { Mattermost } from "../src/nodes/Mattermost/Mattermost.node";

// Minimal mock factory for IExecuteFunctions
function createMockExecuteFunctions(
	overrides: Partial<{
		getInputData: () => INodeExecutionData[];
		getNodeParameter: (paramName: string, itemIndex: number) => unknown;
		getCredentials: () => Promise<Record<string, unknown>>;
		httpRequest: (...args: unknown[]) => Promise<unknown>;
		assertBinaryData: (
			index: number,
			prop: string,
		) => { fileName: string; mimeType: string };
		getBinaryDataBuffer: (index: number, prop: string) => Promise<Buffer>;
		continueOnFail: () => boolean;
	}>,
): IExecuteFunctions {
	const defaults = {
		getInputData: () => [{ json: {} }] as INodeExecutionData[],
		getNodeParameter: (_paramName: string, _itemIndex: number) => "",
		getCredentials: async () => ({
			baseUrl: "https://mattermost.example.com",
			accessToken: "test-token",
			allowUnauthorizedCerts: false,
		}),
		httpRequest: async () => ({
			id: "post-id-1",
			channel_id: "chan-1",
			message: "hello",
			file_ids: [],
			create_at: 1234567890000,
		}),
		assertBinaryData: (_index: number, _prop: string) => ({
			fileName: "test.txt",
			mimeType: "text/plain",
		}),
		getBinaryDataBuffer: async () => Buffer.from("file content"),
		continueOnFail: () => false,
	};

	const merged = { ...defaults, ...overrides };

	return {
		getInputData: merged.getInputData,
		getNodeParameter:
			merged.getNodeParameter as IExecuteFunctions["getNodeParameter"],
		getCredentials:
			merged.getCredentials as IExecuteFunctions["getCredentials"],
		getNode: () => ({
			name: "Mattermost",
			type: "mattermost",
			typeVersion: 1,
			position: [0, 0],
			id: "node-1",
			parameters: {},
		}),
		continueOnFail: merged.continueOnFail,
		helpers: {
			httpRequest:
				merged.httpRequest as IExecuteFunctions["helpers"]["httpRequest"],
			assertBinaryData:
				merged.assertBinaryData as IExecuteFunctions["helpers"]["assertBinaryData"],
			getBinaryDataBuffer:
				merged.getBinaryDataBuffer as IExecuteFunctions["helpers"]["getBinaryDataBuffer"],
		},
	} as unknown as IExecuteFunctions;
}

describe("Mattermost node description", () => {
	it("has correct name and display name", () => {
		const node = new Mattermost();
		expect(node.description.name).toBe("mattermost");
		expect(node.description.displayName).toBe("Mattermost @a24k");
	});

	it("sets usableAsTool to true", () => {
		const node = new Mattermost();
		expect(node.description.usableAsTool).toBe(true);
	});

	it("uses mattermostApi credential", () => {
		const node = new Mattermost();
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === "mattermostApi")).toBe(true);
	});

	it("has required properties channelId, message, rootId, files, attachments", () => {
		const node = new Mattermost();
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain("channelId");
		expect(names).toContain("message");
		expect(names).toContain("rootId");
		expect(names).toContain("files");
		expect(names).toContain("attachments");
	});

	it("files is a plain string type (comma-separated input)", () => {
		const node = new Mattermost();
		const filesProp = node.description.properties.find(
			(p) => p.name === "files",
		);
		expect(filesProp?.type).toBe("string");
		expect(filesProp?.typeOptions?.multipleValues).toBeUndefined();
	});
});

describe("Mattermost execute — plain post", () => {
	it("posts a plain message and returns normalized output", async () => {
		const requests: unknown[] = [];
		const ctx = createMockExecuteFunctions({
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "message") return "Hello world";
				if (param === "rootId") return "";
				if (param === "files") return "";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async (opts: unknown) => {
				requests.push(opts);
				return {
					id: "post-1",
					channel_id: "chan-1",
					message: "Hello world",
					file_ids: [],
					create_at: 111,
				};
			},
		});

		const node = new Mattermost();
		const result = await node.execute.call(ctx);

		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json).toEqual({
			post_id: "post-1",
			channel_id: "chan-1",
			message: "Hello world",
			file_ids: [],
			create_at: 111,
		});
		expect(requests).toHaveLength(1); // only the POST /posts call
	});

	it("strips trailing slash from baseUrl", async () => {
		const urls: string[] = [];
		const ctx = createMockExecuteFunctions({
			getCredentials: async () => ({
				baseUrl: "https://mm.example.com/",
				accessToken: "tok",
				allowUnauthorizedCerts: false,
			}),
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-x";
				if (param === "files") return "";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async (opts: unknown) => {
				urls.push((opts as { url: string }).url);
				return {
					id: "p",
					channel_id: "chan-x",
					message: "",
					file_ids: [],
					create_at: 0,
				};
			},
		});

		const node = new Mattermost();
		await node.execute.call(ctx);
		expect(urls[0]).toBe("https://mm.example.com/api/v4/posts");
	});

	it("includes root_id in post body when set", async () => {
		const bodies: unknown[] = [];
		const ctx = createMockExecuteFunctions({
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "message") return "reply";
				if (param === "rootId") return "parent-post-id";
				if (param === "files") return "";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async (opts: unknown) => {
				bodies.push((opts as { body: unknown }).body);
				return {
					id: "p2",
					channel_id: "chan-1",
					message: "reply",
					file_ids: [],
					create_at: 0,
				};
			},
		});

		const node = new Mattermost();
		await node.execute.call(ctx);
		expect((bodies[0] as Record<string, unknown>).root_id).toBe(
			"parent-post-id",
		);
	});
});

describe("Mattermost execute — file upload", () => {
	it("uploads files then creates post with file_ids", async () => {
		const requests: Array<{
			url: string;
			method: string;
			body?: unknown;
			formData?: unknown;
		}> = [];
		const ctx = createMockExecuteFunctions({
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "message") return "with file";
				if (param === "rootId") return "";
				if (param === "files") return "data";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async (opts: unknown) => {
				const o = opts as {
					url: string;
					method: string;
					body?: unknown;
					formData?: unknown;
				};
				requests.push(o);
				if (o.url.includes("/api/v4/files")) {
					return { file_infos: [{ id: "file-id-1" }] };
				}
				return {
					id: "post-1",
					channel_id: "chan-1",
					message: "with file",
					file_ids: ["file-id-1"],
					create_at: 0,
				};
			},
		});

		const node = new Mattermost();
		const result = await node.execute.call(ctx);

		// 1 upload + 1 post
		expect(requests).toHaveLength(2);
		expect(requests[0].url).toMatch(/\/api\/v4\/files\?channel_id=chan-1/);
		expect((requests[1].body as Record<string, unknown>).file_ids).toEqual([
			"file-id-1",
		]);
		expect(result[0][0].json.file_ids).toEqual(["file-id-1"]);
	});

	it("surfaces uploaded_file_ids on post failure with continueOnFail", async () => {
		let _callCount = 0;
		const ctx = createMockExecuteFunctions({
			continueOnFail: () => true,
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "files") return "data";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async (opts: unknown) => {
				_callCount++;
				const o = opts as { url: string };
				if (o.url.includes("/api/v4/files")) {
					return { file_infos: [{ id: "file-id-orphan" }] };
				}
				throw new Error("Post failed");
			},
		});

		const node = new Mattermost();
		const result = await node.execute.call(ctx);

		expect(result[0][0].json).toMatchObject({
			error: "Post failed",
			uploaded_file_ids: ["file-id-orphan"],
		});
	});
});

describe("Mattermost execute — attachments", () => {
	it("builds attachment props correctly", async () => {
		const bodies: unknown[] = [];
		const ctx = createMockExecuteFunctions({
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "message") return "";
				if (param === "rootId") return "";
				if (param === "files") return "";
				if (param === "attachments") {
					return {
						attachment: [
							{
								fallback: "Fallback text",
								color: "#ff0000",
								text: "Body text",
								options: {
									title: "My Title",
									title_link: "https://example.com",
									author_name: "Author",
								},
								fields: {
									field: [{ title: "Status", value: "OK", short: true }],
								},
							},
						],
					};
				}
				return "";
			},
			httpRequest: async (opts: unknown) => {
				bodies.push((opts as { body: unknown }).body);
				return {
					id: "p3",
					channel_id: "chan-1",
					message: "",
					file_ids: [],
					create_at: 0,
				};
			},
		});

		const node = new Mattermost();
		await node.execute.call(ctx);

		const body = bodies[0] as Record<string, unknown>;
		const props = body.props as { attachments: Attachment[] };
		expect(props).toBeDefined();
		expect(props.attachments).toHaveLength(1);

		const att = props.attachments[0];
		expect(att.fallback).toBe("Fallback text");
		expect(att.color).toBe("#ff0000");
		expect(att.text).toBe("Body text");
		expect(att.title).toBe("My Title");
		expect(att.title_link).toBe("https://example.com");
		expect(att.author_name).toBe("Author");
		expect(att.fields).toEqual([{ title: "Status", value: "OK", short: true }]);
	});
});

describe("Mattermost execute — error handling", () => {
	it("rethrows error when continueOnFail is false", async () => {
		const ctx = createMockExecuteFunctions({
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "files") return "";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async () => {
				throw new Error("Network error");
			},
			continueOnFail: () => false,
		});

		const node = new Mattermost();
		await expect(node.execute.call(ctx)).rejects.toThrow();
	});

	it("returns error json when continueOnFail is true", async () => {
		const ctx = createMockExecuteFunctions({
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "files") return "";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async () => {
				throw new Error("Upstream error");
			},
			continueOnFail: () => true,
		});

		const node = new Mattermost();
		const result = await node.execute.call(ctx);
		expect(result[0][0].json.error).toBe("Upstream error");
	});

	it("processes multiple items independently", async () => {
		let callIndex = 0;
		const ctx = createMockExecuteFunctions({
			getInputData: () =>
				[{ json: { n: 1 } }, { json: { n: 2 } }] as INodeExecutionData[],
			getNodeParameter: (param: string) => {
				if (param === "channelId") return "chan-1";
				if (param === "message") return `msg-${callIndex++}`;
				if (param === "files") return "";
				if (param === "attachments") return {};
				return "";
			},
			httpRequest: async (opts: unknown) => {
				const body = (opts as { body: Record<string, unknown> }).body;
				return {
					id: `post-${body.message}`,
					channel_id: "chan-1",
					message: body.message,
					file_ids: [],
					create_at: 0,
				};
			},
		});

		const node = new Mattermost();
		const result = await node.execute.call(ctx);
		expect(result[0]).toHaveLength(2);
	});
});

// Type used in tests
interface Attachment {
	fallback: string;
	color?: string;
	text?: string;
	title?: string;
	title_link?: string;
	author_name?: string;
	fields?: Array<{ title: string; value: string; short: boolean }>;
	[key: string]: unknown;
}
