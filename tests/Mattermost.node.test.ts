import { createHash } from "crypto";
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
    getMode: () => string;
  }>,
): IExecuteFunctions {
  const defaults = {
    getInputData: () => [{ json: {} }] as INodeExecutionData[],
    getNodeParameter: (_paramName: string, _itemIndex: number) => {
      if (_paramName === "advancedOptions") return {};
      return "";
    },
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
    getMode: () => "manual",
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
    getMode: merged.getMode,
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

  it("has required properties channelId, message, rootId, files, attachments, advancedOptions", () => {
    const node = new Mattermost();
    const names = node.description.properties.map((p) => p.name);
    expect(names).toContain("channelId");
    expect(names).toContain("message");
    expect(names).toContain("rootId");
    expect(names).toContain("files");
    expect(names).toContain("attachments");
    expect(names).toContain("advancedOptions");
  });

  it("files is a plain string type (comma-separated input)", () => {
    const node = new Mattermost();
    const filesProp = node.description.properties.find(
      (p) => p.name === "files",
    );
    expect(filesProp?.type).toBe("string");
    expect(filesProp?.typeOptions?.multipleValues).toBeUndefined();
  });

  it("advancedOptions contains uploadFilesSequentially and extraBodyFields options", () => {
    const node = new Mattermost();
    const advProp = node.description.properties.find(
      (p) => p.name === "advancedOptions",
    );
    expect(advProp).toBeDefined();
    expect(advProp?.type).toBe("collection");
    const optionNames = (
      advProp?.options as Array<{ name: string }> | undefined
    )?.map((o) => o.name);
    expect(optionNames).toContain("uploadFilesSequentially");
    expect(optionNames).toContain("extraBodyFields");
  });

  it("uploadFilesSequentially defaults to false", () => {
    const node = new Mattermost();
    const advProp = node.description.properties.find(
      (p) => p.name === "advancedOptions",
    );
    const seqOpt = (
      advProp?.options as Array<{ name: string; default: unknown }> | undefined
    )?.find((o) => o.name === "uploadFilesSequentially");
    expect(seqOpt?.default).toBe(false);
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
        if (param === "advancedOptions") return {};
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
        if (param === "advancedOptions") return {};
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
        if (param === "advancedOptions") return {};
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
        if (param === "advancedOptions") return {};
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

  it("uploads multiple files in parallel when comma-separated names given", async () => {
    const uploadedUrls: string[] = [];
    let fileIdCounter = 0;
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-multi";
        if (param === "message") return "";
        if (param === "rootId") return "";
        if (param === "files") return "data, image, report";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return {};
        return "";
      },
      assertBinaryData: (_index: number, _prop: string) => ({
        fileName: `${_prop}.txt`,
        mimeType: "text/plain",
      }),
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string; method: string; body?: unknown };
        if (o.url.includes("/api/v4/files")) {
          uploadedUrls.push(o.url);
          return { file_infos: [{ id: `fid-${++fileIdCounter}` }] };
        }
        return {
          id: "post-multi",
          channel_id: "chan-multi",
          message: "",
          file_ids: ["fid-1", "fid-2", "fid-3"],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    // 3 parallel uploads + 1 post
    expect(uploadedUrls).toHaveLength(3);
    expect(uploadedUrls.every((u) => u.includes("channel_id=chan-multi"))).toBe(
      true,
    );
    const postFileIds = result[0][0].json.file_ids as string[];
    expect(postFileIds).toHaveLength(3);
    expect(postFileIds).toContain("fid-1");
    expect(postFileIds).toContain("fid-2");
    expect(postFileIds).toContain("fid-3");
  });

  it("surfaces uploaded_file_ids on post failure with continueOnFail", async () => {
    let _callCount = 0;
    const ctx = createMockExecuteFunctions({
      continueOnFail: () => true,
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "data";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return {};
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

describe("Mattermost execute — sequential upload", () => {
  it("uploads files one at a time in order when uploadFilesSequentially is true", async () => {
    const uploadOrder: string[] = [];
    let fileIdCounter = 0;
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-seq";
        if (param === "files") return "file1, file2, file3";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return { uploadFilesSequentially: true };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => ({
        fileName: `${prop}.txt`,
        mimeType: "text/plain",
      }),
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string; body?: unknown };
        if (o.url.includes("/api/v4/files")) {
          // Record which binary property was requested via URL
          uploadOrder.push(o.url);
          return { file_infos: [{ id: `seq-fid-${++fileIdCounter}` }] };
        }
        return {
          id: "post-seq",
          channel_id: "chan-seq",
          message: "",
          file_ids: ["seq-fid-1", "seq-fid-2", "seq-fid-3"],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    // 3 uploads + 1 post
    expect(uploadOrder).toHaveLength(3);
    // All uploads go to the correct channel
    expect(uploadOrder.every((u) => u.includes("channel_id=chan-seq"))).toBe(
      true,
    );
    // File IDs are passed to post in order
    expect(
      (result[0][0].json.file_ids as string[]).every((id) =>
        id.startsWith("seq-fid-"),
      ),
    ).toBe(true);
  });

  it("post body contains file_ids in upload order for sequential mode", async () => {
    const bodies: unknown[] = [];
    let callSeq = 0;
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-ord";
        if (param === "files") return "alpha, beta";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return { uploadFilesSequentially: true };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => ({
        fileName: `${prop}.png`,
        mimeType: "image/png",
      }),
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string; body?: unknown };
        if (o.url.includes("/api/v4/files")) {
          return { file_infos: [{ id: `id-${++callSeq}` }] };
        }
        bodies.push(o.body);
        return {
          id: "post-ord",
          channel_id: "chan-ord",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    const postBody = bodies[0] as Record<string, unknown>;
    // file_ids must be in the same order as the upload sequence
    expect(postBody.file_ids).toEqual(["id-1", "id-2"]);
  });

  it("surfaces uploaded_file_ids for mid-sequence failure with continueOnFail", async () => {
    let uploadCount = 0;
    const ctx = createMockExecuteFunctions({
      continueOnFail: () => true,
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-seq";
        if (param === "files") return "ok1, fail2, ok3";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return { uploadFilesSequentially: true };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => ({
        fileName: `${prop}.txt`,
        mimeType: "text/plain",
      }),
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        if (o.url.includes("/api/v4/files")) {
          uploadCount++;
          if (uploadCount === 1) {
            return { file_infos: [{ id: "ok-id-1" }] };
          }
          throw new Error("Upload failed at file 2");
        }
        return {
          id: "p",
          channel_id: "c",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    expect(result[0][0].json).toMatchObject({
      error: "Upload failed at file 2",
      uploaded_file_ids: ["ok-id-1"],
    });
  });

  it("throws with uploaded_file_ids on mid-sequence failure when continueOnFail is false", async () => {
    let uploadCount = 0;
    const ctx = createMockExecuteFunctions({
      continueOnFail: () => false,
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-seq";
        if (param === "files") return "ok1, fail2";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return { uploadFilesSequentially: true };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => ({
        fileName: `${prop}.txt`,
        mimeType: "text/plain",
      }),
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        if (o.url.includes("/api/v4/files")) {
          uploadCount++;
          if (uploadCount === 1) {
            return { file_infos: [{ id: "ok-id-1" }] };
          }
          throw new Error("Upload failed");
        }
        return {
          id: "p",
          channel_id: "c",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await expect(node.execute.call(ctx)).rejects.toThrow("ok-id-1");
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
        if (param === "advancedOptions") return {};
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

describe("Mattermost execute — extraBodyFields", () => {
  it("merges extra fields into post body", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({
              priority: { priority: "important" },
            }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
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
    expect((body.priority as Record<string, unknown>).priority).toBe(
      "important",
    );
  });

  it("UI channel_id always wins over JSON channel_id", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "ui-channel";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({ channel_id: "json-channel" }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
          channel_id: "ui-channel",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect((bodies[0] as Record<string, unknown>).channel_id).toBe(
      "ui-channel",
    );
  });

  it("UI message wins if non-empty; JSON message used if UI is empty", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "message") return ""; // UI empty
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({ message: "from json" }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
          channel_id: "chan-1",
          message: "from json",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect((bodies[0] as Record<string, unknown>).message).toBe("from json");

    // Now test UI wins when non-empty
    const bodies2: unknown[] = [];
    const ctx2 = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "message") return "ui message";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({ message: "json message" }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies2.push((opts as { body: unknown }).body);
        return {
          id: "p",
          channel_id: "chan-1",
          message: "ui message",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node2 = new Mattermost();
    await node2.execute.call(ctx2);
    expect((bodies2[0] as Record<string, unknown>).message).toBe("ui message");
  });

  it("concatenates file_ids: JSON first then uploaded", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "data";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({ file_ids: ["json-fid-1"] }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string; body?: unknown };
        if (o.url.includes("/api/v4/files")) {
          return { file_infos: [{ id: "uploaded-fid-1" }] };
        }
        bodies.push(o.body);
        return {
          id: "p",
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
    expect(body.file_ids).toEqual(["json-fid-1", "uploaded-fid-1"]);
  });

  it("concatenates props.attachments: JSON first then UI", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") {
          return {
            attachment: [{ fallback: "ui-att", options: {}, fields: {} }],
          };
        }
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({
              props: { attachments: [{ fallback: "json-att" }] },
            }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
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
    const attachments = (body.props as { attachments: Attachment[] })
      .attachments;
    expect(attachments).toHaveLength(2);
    expect(attachments[0].fallback).toBe("json-att"); // JSON first
    expect(attachments[1].fallback).toBe("ui-att"); // UI second
  });

  it("preserves other props keys from JSON during deep merge", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({
              props: {
                custom_key: "custom_value",
                attachments: [{ fallback: "json-att" }],
              },
            }),
          };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
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
    const props = body.props as Record<string, unknown>;
    expect(props.custom_key).toBe("custom_value");
    expect((props.attachments as Attachment[])[0].fallback).toBe("json-att");
  });

  it("accepts extraBodyFields.files as comma-separated string", async () => {
    const uploadedProps: string[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "ui-file";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({
              files: "json-file1, json-file2",
            }),
          };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => {
        uploadedProps.push(prop);
        return { fileName: `${prop}.txt`, mimeType: "text/plain" };
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        if (o.url.includes("/api/v4/files")) {
          return { file_infos: [{ id: `fid-${uploadedProps.length}` }] };
        }
        return {
          id: "p",
          channel_id: "chan-1",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    // JSON files first, then UI file
    expect(uploadedProps).toEqual(["json-file1", "json-file2", "ui-file"]);
  });

  it("accepts extraBodyFields.files as JSON array", async () => {
    const uploadedProps: string[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({
              files: ["arr-file1", "arr-file2"],
            }),
          };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => {
        uploadedProps.push(prop);
        return { fileName: `${prop}.txt`, mimeType: "text/plain" };
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        if (o.url.includes("/api/v4/files")) {
          return { file_infos: [{ id: `fid-${uploadedProps.length}` }] };
        }
        return {
          id: "p",
          channel_id: "chan-1",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect(uploadedProps).toEqual(["arr-file1", "arr-file2"]);
  });

  it("throws NodeOperationError for invalid JSON in extraBodyFields", async () => {
    const ctx = createMockExecuteFunctions({
      continueOnFail: () => false,
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return { extraBodyFields: "not-valid-json{{{" };
        return "";
      },
    });

    const node = new Mattermost();
    await expect(node.execute.call(ctx)).rejects.toThrow(
      "Extra Body Fields is not valid JSON",
    );
  });

  it("throws NodeOperationError when extraBodyFields is a JSON array", async () => {
    const ctx = createMockExecuteFunctions({
      continueOnFail: () => false,
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return { extraBodyFields: "[1, 2, 3]" };
        return "";
      },
    });

    const node = new Mattermost();
    await expect(node.execute.call(ctx)).rejects.toThrow(
      "Extra Body Fields must be a JSON object",
    );
  });

  it("caps total files at 10 when combining JSON and UI files", async () => {
    const uploadedProps: string[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        // 7 JSON files + 5 UI files = 12, should be capped at 10
        if (param === "files") return "u1, u2, u3, u4, u5";
        if (param === "attachments") return {};
        if (param === "advancedOptions")
          return {
            extraBodyFields: JSON.stringify({
              files: ["j1", "j2", "j3", "j4", "j5", "j6", "j7"],
            }),
          };
        return "";
      },
      assertBinaryData: (_index: number, prop: string) => {
        uploadedProps.push(prop);
        return { fileName: `${prop}.txt`, mimeType: "text/plain" };
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        if (o.url.includes("/api/v4/files")) {
          return { file_infos: [{ id: `fid-${uploadedProps.length}` }] };
        }
        return {
          id: "p",
          channel_id: "chan-1",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect(uploadedProps).toHaveLength(10);
    // JSON files first (j1..j7), then UI files until cap (u1..u3)
    expect(uploadedProps).toEqual([
      "j1",
      "j2",
      "j3",
      "j4",
      "j5",
      "j6",
      "j7",
      "u1",
      "u2",
      "u3",
    ]);
  });
});

describe("Mattermost execute — error handling", () => {
  it("rethrows error when continueOnFail is false", async () => {
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return {};
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
        if (param === "advancedOptions") return {};
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
        if (param === "advancedOptions") return {};
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

describe("Mattermost node description — testChannelId option", () => {
  it("advancedOptions contains testChannelId option", () => {
    const node = new Mattermost();
    const advProp = node.description.properties.find(
      (p) => p.name === "advancedOptions",
    );
    const optionNames = (
      advProp?.options as Array<{ name: string }> | undefined
    )?.map((o) => o.name);
    expect(optionNames).toContain("testChannelId");
  });

  it("testChannelId option is type string with empty default", () => {
    const node = new Mattermost();
    const advProp = node.description.properties.find(
      (p) => p.name === "advancedOptions",
    );
    const opt = (
      advProp?.options as
        | Array<{
            name: string;
            type: string;
            default: unknown;
          }>
        | undefined
    )?.find((o) => o.name === "testChannelId");
    expect(opt?.type).toBe("string");
    expect(opt?.default).toBe("");
  });
});

describe("Mattermost execute — testChannelId routing", () => {
  it("uses testChannelId for post body when mode is manual", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getMode: () => "manual",
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "prod-chan";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { testChannelId: "test-chan" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
          channel_id: "test-chan",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect((bodies[0] as Record<string, unknown>).channel_id).toBe("test-chan");
  });

  it("uses channelId for post body when mode is manual but testChannelId is empty", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getMode: () => "manual",
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "prod-chan";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { testChannelId: "" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
          channel_id: "prod-chan",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect((bodies[0] as Record<string, unknown>).channel_id).toBe("prod-chan");
  });

  it("uses channelId for post body when mode is trigger even if testChannelId is set", async () => {
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getMode: () => "trigger",
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "prod-chan";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { testChannelId: "test-chan" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        bodies.push((opts as { body: unknown }).body);
        return {
          id: "p",
          channel_id: "prod-chan",
          message: "",
          file_ids: [],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect((bodies[0] as Record<string, unknown>).channel_id).toBe("prod-chan");
  });

  it("uses testChannelId in file upload URL when mode is manual", async () => {
    const uploadUrls: string[] = [];
    const ctx = createMockExecuteFunctions({
      getMode: () => "manual",
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "prod-chan";
        if (param === "files") return "data";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { testChannelId: "test-chan" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        if (o.url.includes("/api/v4/files")) {
          uploadUrls.push(o.url);
          return { file_infos: [{ id: "fid-1" }] };
        }
        return {
          id: "p",
          channel_id: "test-chan",
          message: "",
          file_ids: ["fid-1"],
          create_at: 0,
        };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect(uploadUrls[0]).toContain("channel_id=test-chan");
    expect(uploadUrls[0]).not.toContain("prod-chan");
  });
});

function threadHash(channelId: string, key: string): string {
  return createHash("sha256")
    .update(`${channelId}:${key}`)
    .digest("base64url")
    .slice(0, 32);
}

const PREF_CATEGORY = "n8n_nodes_mattermost_threadmap";
const BASE_URL = "https://mattermost.example.com";

describe("Mattermost node description — threadGroupKey option", () => {
  it("advancedOptions contains threadGroupKey option", () => {
    const node = new Mattermost();
    const advProp = node.description.properties.find(
      (p) => p.name === "advancedOptions",
    );
    const optionNames = (
      advProp?.options as Array<{ name: string }> | undefined
    )?.map((o) => o.name);
    expect(optionNames).toContain("threadGroupKey");
  });

  it("threadGroupKey option is type string with empty default", () => {
    const node = new Mattermost();
    const advProp = node.description.properties.find(
      (p) => p.name === "advancedOptions",
    );
    const opt = (
      advProp?.options as Array<{ name: string; type: string; default: unknown }> | undefined
    )?.find((o) => o.name === "threadGroupKey");
    expect(opt?.type).toBe("string");
    expect(opt?.default).toBe("");
  });
});

describe("Mattermost execute — Thread Group Key", () => {
  it("Thread Group Key empty: no preferences calls, output unchanged", async () => {
    const urls: string[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { threadGroupKey: "" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string };
        urls.push(o.url);
        return { id: "p1", channel_id: "chan-1", message: "", file_ids: [], create_at: 0 };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/v4\/posts$/);
    expect(result[0][0].json).not.toHaveProperty("thread_group_key");
  });

  it("Thread Group Key + Root Post ID set: Root Post ID wins, no preferences calls", async () => {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "rootId") return "explicit-root-id";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { threadGroupKey: "my-key" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { url: string; body?: unknown };
        urls.push(o.url);
        bodies.push(o.body);
        return { id: "p1", channel_id: "chan-1", message: "", file_ids: [], create_at: 0 };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/v4\/posts$/);
    expect((bodies[0] as Record<string, unknown>).root_id).toBe("explicit-root-id");
  });

  it("Thread Group Key, no existing mapping (404): creates new post, saves preference, output has thread fields", async () => {
    const hash = threadHash("chan-1", "incident-42");
    const requests: Array<{ method: string; url: string; body?: unknown }> = [];

    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "message") return "first post";
        if (param === "rootId") return "";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { threadGroupKey: "incident-42" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { method: string; url: string; body?: unknown };
        requests.push({ method: o.method, url: o.url, body: o.body });
        if (o.method === "GET" && o.url.includes(PREF_CATEGORY)) {
          throw Object.assign(new Error("Not Found"), { httpCode: "404" });
        }
        if (o.method === "PUT" && o.url.includes("preferences")) {
          return {};
        }
        return { id: "new-post-id", channel_id: "chan-1", message: "first post", file_ids: [], create_at: 111 };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    // GET preferences, POST posts, PUT preferences
    expect(requests).toHaveLength(3);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe(`${BASE_URL}/api/v4/users/me/preferences/${PREF_CATEGORY}/${hash}`);
    expect(requests[1].method).toBe("POST");
    expect((requests[1].body as Record<string, unknown>).root_id).toBeUndefined();
    expect(requests[2].method).toBe("PUT");
    expect(requests[2].url).toBe(`${BASE_URL}/api/v4/users/me/preferences`);
    const prefBody = requests[2].body as Array<Record<string, unknown>>;
    expect(prefBody[0].category).toBe(PREF_CATEGORY);
    expect(prefBody[0].name).toBe(hash);
    expect(prefBody[0].value).toBe("new-post-id");

    expect(result[0][0].json).toMatchObject({
      post_id: "new-post-id",
      thread_group_key: "incident-42",
      thread_root_post_id: null,
    });
  });

  it("Thread Group Key, existing mapping (200): posts as thread reply, output has thread fields", async () => {
    const hash = threadHash("chan-1", "incident-42");
    const requests: Array<{ method: string; url: string; body?: unknown }> = [];

    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "message") return "reply post";
        if (param === "rootId") return "";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { threadGroupKey: "incident-42" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { method: string; url: string; body?: unknown };
        requests.push({ method: o.method, url: o.url, body: o.body });
        if (o.method === "GET" && o.url.includes(PREF_CATEGORY)) {
          return { user_id: "bot-user", category: PREF_CATEGORY, name: hash, value: "root-post-id" };
        }
        return { id: "reply-post-id", channel_id: "chan-1", message: "reply post", file_ids: [], create_at: 222 };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    // GET preferences, POST posts (no PUT)
    expect(requests).toHaveLength(2);
    expect(requests[0].method).toBe("GET");
    expect(requests[1].method).toBe("POST");
    expect((requests[1].body as Record<string, unknown>).root_id).toBe("root-post-id");

    expect(result[0][0].json).toMatchObject({
      post_id: "reply-post-id",
      thread_group_key: "incident-42",
      thread_root_post_id: "root-post-id",
    });
  });

  it("Preferences GET non-404 error: throws and respects continueOnFail", async () => {
    const ctx = createMockExecuteFunctions({
      continueOnFail: () => true,
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "rootId") return "";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { threadGroupKey: "my-key" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { method: string; url: string };
        if (o.method === "GET" && o.url.includes(PREF_CATEGORY)) {
          throw Object.assign(new Error("Internal Server Error"), { httpCode: "500" });
        }
        return { id: "p", channel_id: "chan-1", message: "", file_ids: [], create_at: 0 };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);
    expect(result[0][0].json).toHaveProperty("error");
  });

  it("Preferences PUT failure after successful post: silently ignored, post output returned normally", async () => {
    const ctx = createMockExecuteFunctions({
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "chan-1";
        if (param === "rootId") return "";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { threadGroupKey: "my-key" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { method: string; url: string };
        if (o.method === "GET" && o.url.includes(PREF_CATEGORY)) {
          throw Object.assign(new Error("Not Found"), { httpCode: "404" });
        }
        if (o.method === "PUT" && o.url.includes("preferences")) {
          throw new Error("Preferences write failed");
        }
        return { id: "new-post-id", channel_id: "chan-1", message: "", file_ids: [], create_at: 0 };
      },
    });

    const node = new Mattermost();
    const result = await node.execute.call(ctx);

    expect(result[0][0].json).toMatchObject({
      post_id: "new-post-id",
      thread_group_key: "my-key",
      thread_root_post_id: null,
    });
    expect(result[0][0].json).not.toHaveProperty("error");
  });

  it("Hash uses effectiveChannelId (testChannelId) when in manual mode", async () => {
    const hash = threadHash("test-chan", "my-key");
    const getUrls: string[] = [];

    const ctx = createMockExecuteFunctions({
      getMode: () => "manual",
      getNodeParameter: (param: string) => {
        if (param === "channelId") return "prod-chan";
        if (param === "rootId") return "";
        if (param === "files") return "";
        if (param === "attachments") return {};
        if (param === "advancedOptions") return { testChannelId: "test-chan", threadGroupKey: "my-key" };
        return "";
      },
      httpRequest: async (opts: unknown) => {
        const o = opts as { method: string; url: string };
        if (o.method === "GET") {
          getUrls.push(o.url);
          throw Object.assign(new Error("Not Found"), { httpCode: "404" });
        }
        if (o.method === "PUT") return {};
        return { id: "p", channel_id: "test-chan", message: "", file_ids: [], create_at: 0 };
      },
    });

    const node = new Mattermost();
    await node.execute.call(ctx);

    expect(getUrls[0]).toContain(hash);
    expect(getUrls[0]).not.toContain(threadHash("prod-chan", "my-key"));
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
