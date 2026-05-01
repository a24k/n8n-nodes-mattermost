import { createHash } from "node:crypto";
import {
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  NodeApiError,
  NodeConnectionTypes,
  NodeOperationError,
} from "n8n-workflow";

interface AttachmentField {
  title: string;
  value: string;
  short: boolean;
}

interface Attachment {
  fallback: string;
  color?: string;
  text?: string;
  pretext?: string;
  title?: string;
  title_link?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  fields?: AttachmentField[];
  [key: string]: unknown;
}

interface FileUploadResponse {
  file_infos: Array<{ id: string }>;
}

interface PostResponse {
  id: string;
  channel_id: string;
  message: string;
  file_ids?: string[];
  create_at: number;
}

// Exceptions where subtype alone is not a usable file extension
const MIME_EXT_OVERRIDES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "text/plain": "txt",
};

/**
 * Appends a file extension derived from the MIME type when the filename has
 * none. Leaves the filename unchanged if it already contains a dot or if the
 * MIME type is `application/octet-stream` (indeterminate type).
 */
function withExtension(fileName: string, mimeType: string): string {
  if (fileName.includes(".")) return fileName;
  if (mimeType === "application/octet-stream") return fileName;
  const ext = MIME_EXT_OVERRIDES[mimeType] ?? mimeType.split("/")[1];
  return ext ? `${fileName}.${ext}` : fileName;
}

// SHA-256 of "${channelId}:${key}", first 20 bytes encoded as lowercase base32 (RFC 4648).
// Alphabet [a-z2-7] satisfies Mattermost's preference_name regex ^[a-z0-9]+([a-z\-\_0-9]+|(__)?)[a-z0-9]+$
// 20 bytes × 8 bits / 5 bits per char = 32 chars = 160 bits of entropy.
function threadPrefName(channelId: string, key: string): string {
  const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = createHash("sha256")
    .update(`${channelId}:${key}`)
    .digest()
    .subarray(0, 20);
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32[(value >> bits) & 31];
    }
  }
  return result;
}

export class Mattermost implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Mattermost @a24k",
    name: "mattermost",
    icon: "file:mattermost.svg",
    group: ["output"],
    version: 1,
    subtitle: "Post Message",
    description:
      "Post messages to Mattermost with file and rich attachment support",
    defaults: {
      name: "Mattermost",
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [
      {
        name: "mattermostApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Channel ID",
        name: "channelId",
        type: "string",
        required: true,
        default: "",
        description: "The ID of the channel to post to",
      },
      {
        displayName: "Message (optional)",
        name: "message",
        type: "string",
        typeOptions: {
          rows: 4,
        },
        default: "",
        description: "The message body (Markdown supported)",
      },
      {
        displayName: "Root Post ID (optional)",
        name: "rootId",
        type: "string",
        default: "",
        description: "Parent post ID for thread replies",
      },
      {
        displayName: "Files (optional)",
        name: "files",
        type: "string",
        default: "",
        placeholder: "data, attachment, image",
        description:
          "Comma-separated list of n8n binary property names containing the files to upload (max 10). Example: data, file2, image",
      },
      {
        displayName: "Attachments",
        name: "attachments",
        type: "fixedCollection",
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        description:
          "Rich message attachments (Slack-compatible format). Click Choose… to add an attachment.",
        options: [
          {
            name: "attachment",
            displayName: "Attachment",
            values: [
              {
                displayName: "Fallback",
                name: "fallback",
                type: "string",
                required: true,
                default: "",
                description:
                  "Plain-text fallback for notifications and unsupported clients",
              },
              {
                displayName: "Color (optional)",
                name: "color",
                type: "string",
                default: "",
                description:
                  "Left border color: #hex value or good / warning / danger",
              },
              {
                displayName: "Text (optional)",
                name: "text",
                type: "string",
                typeOptions: {
                  rows: 3,
                },
                default: "",
                description:
                  "Attachment body (Markdown and @mention supported)",
              },
              {
                displayName: "Attachment Options",
                name: "options",
                type: "collection",
                placeholder: "Add Option",
                default: {},
                options: [
                  {
                    displayName: "Author Icon",
                    name: "author_icon",
                    type: "string",
                    default: "",
                    description: "Author icon URL (16×16px)",
                  },
                  {
                    displayName: "Author Link",
                    name: "author_link",
                    type: "string",
                    default: "",
                    description: "URL for the author name",
                  },
                  {
                    displayName: "Author Name",
                    name: "author_name",
                    type: "string",
                    default: "",
                    description: "Author display name",
                  },
                  {
                    displayName: "Footer",
                    name: "footer",
                    type: "string",
                    default: "",
                    description: "Footer text",
                  },
                  {
                    displayName: "Footer Icon",
                    name: "footer_icon",
                    type: "string",
                    default: "",
                    description: "Footer icon URL",
                  },
                  {
                    displayName: "Image URL",
                    name: "image_url",
                    type: "string",
                    default: "",
                    description:
                      "Image displayed below the body (max 400×300px)",
                  },
                  {
                    displayName: "Pretext",
                    name: "pretext",
                    type: "string",
                    default: "",
                    description:
                      "Text displayed above the attachment (@mention supported)",
                  },
                  {
                    displayName: "Thumb URL",
                    name: "thumb_url",
                    type: "string",
                    default: "",
                    description:
                      "Thumbnail displayed on the right side (75×75px)",
                  },
                  {
                    displayName: "Title",
                    name: "title",
                    type: "string",
                    default: "",
                    description: "Title text",
                  },
                  {
                    displayName: "Title Link",
                    name: "title_link",
                    type: "string",
                    default: "",
                    description: "URL for the title",
                  },
                ],
              },
              {
                displayName: "Fields",
                name: "fields",
                type: "fixedCollection",
                typeOptions: {
                  multipleValues: true,
                },
                default: {},
                description:
                  "Tabular information within the attachment. Click Choose… to add a field.",
                options: [
                  {
                    name: "field",
                    displayName: "Field",
                    values: [
                      {
                        displayName: "Title",
                        name: "title",
                        type: "string",
                        default: "",
                        description: "Column title",
                      },
                      {
                        displayName: "Value",
                        name: "value",
                        type: "string",
                        default: "",
                        description:
                          "Column value (Markdown and @mention supported)",
                      },
                      {
                        displayName: "Short",
                        name: "short",
                        type: "boolean",
                        default: false,
                        description:
                          "Whether to render side-by-side with adjacent fields",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        displayName: "Advanced Options",
        name: "advancedOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        options: [
          {
            displayName: "Extra Body Fields",
            name: "extraBodyFields",
            type: "json",
            default: "{}",
            description:
              "JSON object merged into the Mattermost post body. Use this to set API fields not available in the UI (e.g. priority, custom props keys).",
          },
          {
            displayName: "Thread Group Key",
            name: "threadGroupKey",
            type: "string",
            default: "",
            description:
              "Logical identifier for a thread group. Posts with the same Thread Group Key and Channel ID are automatically linked as a Mattermost thread. Ignored if Root Post ID is also set.",
          },
          {
            displayName: "Channel ID for Test Run",
            name: "testChannelId",
            type: "string",
            default: "",
            description:
              "When set, posts are sent to this channel instead of Channel ID during test executions. Useful for routing test runs to a sandbox channel without modifying the main Channel ID.",
          },
          {
            displayName: "Upload Files Sequentially",
            name: "uploadFilesSequentially",
            type: "boolean",
            default: false,
            description:
              "When enabled, files are uploaded one at a time in the listed order. Use this to control the display order of files in the Mattermost post. Parallel upload (default) is faster but does not guarantee order.",
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("mattermostApi");
    const baseUrl = (credentials.baseUrl as string).replace(/\/$/, "");
    const accessToken = credentials.accessToken as string;
    const allowUnauthorizedCerts =
      credentials.allowUnauthorizedCerts as boolean;

    for (let i = 0; i < items.length; i++) {
      try {
        const channelId = this.getNodeParameter("channelId", i) as string;
        const message = this.getNodeParameter("message", i) as string;
        const rootId = this.getNodeParameter("rootId", i) as string;
        const uiFilesParam = (this.getNodeParameter("files", i, "") as string)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const attachmentsParam = this.getNodeParameter("attachments", i) as {
          attachment?: Array<{
            fallback: string;
            color?: string;
            text?: string;
            options?: {
              pretext?: string;
              title?: string;
              title_link?: string;
              author_name?: string;
              author_link?: string;
              author_icon?: string;
              image_url?: string;
              thumb_url?: string;
              footer?: string;
              footer_icon?: string;
            };
            fields?: {
              field?: Array<{ title: string; value: string; short: boolean }>;
            };
          }>;
        };

        // Parse Advanced Options
        const advancedOptionsRaw = this.getNodeParameter(
          "advancedOptions",
          i,
          {},
        ) as unknown;
        const advancedOptions: IDataObject =
          typeof advancedOptionsRaw === "object" &&
          advancedOptionsRaw !== null &&
          !Array.isArray(advancedOptionsRaw)
            ? (advancedOptionsRaw as IDataObject)
            : {};

        const uploadFilesSequentially =
          (advancedOptions.uploadFilesSequentially as boolean) ?? false;

        const testChannelId = (advancedOptions.testChannelId as string) ?? "";
        const effectiveChannelId =
          testChannelId && this.getMode() === "manual"
            ? testChannelId
            : channelId;

        const threadGroupKey = (advancedOptions.threadGroupKey as string) ?? "";

        // Parse extraBodyFields
        let extraBodyFields: IDataObject = {};
        const rawExtra = advancedOptions.extraBodyFields;
        if (rawExtra !== undefined && rawExtra !== null && rawExtra !== "") {
          let parsed: unknown;
          if (typeof rawExtra === "string" && rawExtra.trim() !== "{}") {
            try {
              parsed = JSON.parse(rawExtra as string);
            } catch {
              throw new NodeOperationError(
                this.getNode(),
                "Extra Body Fields is not valid JSON",
                { itemIndex: i },
              );
            }
          } else if (typeof rawExtra !== "string") {
            parsed = rawExtra;
          }
          if (parsed !== undefined) {
            if (
              typeof parsed !== "object" ||
              parsed === null ||
              Array.isArray(parsed)
            ) {
              throw new NodeOperationError(
                this.getNode(),
                "Extra Body Fields must be a JSON object",
                { itemIndex: i },
              );
            }
            extraBodyFields = parsed as IDataObject;
          }
        }

        // Build file list: extraBodyFields.files first, then UI files (cap at 10)
        let ebfFilePropNames: string[] = [];
        const rawEbfFiles = extraBodyFields.files;
        if (rawEbfFiles !== undefined && rawEbfFiles !== null) {
          if (typeof rawEbfFiles === "string") {
            ebfFilePropNames = rawEbfFiles
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
          } else if (Array.isArray(rawEbfFiles)) {
            ebfFilePropNames = (rawEbfFiles as unknown[])
              .map((f) => String(f).trim())
              .filter((s) => s.length > 0);
          }
        }
        const allFilePropNames = [...ebfFilePropNames, ...uiFilesParam].slice(
          0,
          10,
        );

        // Helper: upload a single file and return its file_id
        const uploadSingleFile = async (
          binaryPropertyName: string,
        ): Promise<string> => {
          const binaryMeta = this.helpers.assertBinaryData(
            i,
            binaryPropertyName,
          );
          const buffer = await this.helpers.getBinaryDataBuffer(
            i,
            binaryPropertyName,
          );
          const mimeType = binaryMeta.mimeType ?? "application/octet-stream";
          const fileName = withExtension(
            binaryMeta.fileName ?? "file",
            mimeType,
          );
          const formData = new FormData();
          formData.append(
            "files",
            new Blob([buffer], { type: mimeType }),
            fileName,
          );
          const response = (await this.helpers.httpRequest({
            method: "POST",
            url: `${baseUrl}/api/v4/files?channel_id=${encodeURIComponent(effectiveChannelId)}`,
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
            json: true,
            skipSslCertificateValidation: allowUnauthorizedCerts,
          })) as FileUploadResponse;
          return response.file_infos[0].id;
        };

        // Step 1: Upload files (sequential or parallel)
        const uploadedFileIds: string[] = [];
        let skipItem = false;

        if (allFilePropNames.length > 0) {
          if (uploadFilesSequentially) {
            for (const propName of allFilePropNames) {
              try {
                uploadedFileIds.push(await uploadSingleFile(propName));
              } catch (uploadError) {
                if (uploadedFileIds.length > 0 && this.continueOnFail()) {
                  returnData.push({
                    json: {
                      error: (uploadError as Error).message,
                      uploaded_file_ids: uploadedFileIds,
                    },
                    pairedItem: { item: i },
                  });
                  skipItem = true;
                  break;
                }
                if (uploadedFileIds.length > 0) {
                  throw new NodeOperationError(
                    this.getNode(),
                    `File upload failed after uploading some files. uploaded_file_ids: ${uploadedFileIds.join(", ")}. Original error: ${(uploadError as Error).message}`,
                    { itemIndex: i },
                  );
                }
                throw uploadError;
              }
            }
          } else {
            const results = await Promise.all(
              allFilePropNames.map(uploadSingleFile),
            );
            uploadedFileIds.push(...results);
          }
        }

        if (skipItem) continue;

        // Step 2: Resolve thread group key → root_id via Mattermost Preferences API
        const PREF_CATEGORY = "n8n_nodes_mattermost_threadmap";
        let threadRootPostId: string | null = null;
        const useThreadGroupKey = threadGroupKey && !rootId;

        if (useThreadGroupKey) {
          const prefName = threadPrefName(effectiveChannelId, threadGroupKey);
          const prefUrl = `${baseUrl}/api/v4/users/me/preferences/${PREF_CATEGORY}/name/${prefName}`;
          try {
            const pref = (await this.helpers.httpRequest({
              method: "GET",
              url: prefUrl,
              headers: { Authorization: `Bearer ${accessToken}` },
              json: true,
              skipSslCertificateValidation: allowUnauthorizedCerts,
            })) as { value: string };
            threadRootPostId = pref.value;
          } catch (prefErr) {
            const httpCode = (prefErr as Record<string, unknown>).httpCode;
            if (httpCode !== "404") throw prefErr;
          }
        }

        // Step 3: Build attachments
        const attachmentItems = attachmentsParam.attachment ?? [];
        const builtAttachments: Attachment[] = attachmentItems.map((att) => {
          const result: Attachment = {
            fallback: att.fallback,
          };

          if (att.color) result.color = att.color;
          if (att.text) result.text = att.text;

          const opts = att.options ?? {};
          if (opts.pretext) result.pretext = opts.pretext;
          if (opts.title) result.title = opts.title;
          if (opts.title_link) result.title_link = opts.title_link;
          if (opts.author_name) result.author_name = opts.author_name;
          if (opts.author_link) result.author_link = opts.author_link;
          if (opts.author_icon) result.author_icon = opts.author_icon;
          if (opts.image_url) result.image_url = opts.image_url;
          if (opts.thumb_url) result.thumb_url = opts.thumb_url;
          if (opts.footer) result.footer = opts.footer;
          if (opts.footer_icon) result.footer_icon = opts.footer_icon;

          const fieldItems = att.fields?.field ?? [];
          if (fieldItems.length > 0) {
            result.fields = fieldItems.map((f) => ({
              title: f.title,
              value: f.value,
              short: f.short,
            }));
          }

          return result;
        });

        // Step 3: Build post body
        // Destructure specially-handled keys from extraBodyFields
        const {
          files: _ebfFiles,
          file_ids: ebfFileIds,
          props: ebfProps,
          channel_id: _ebfChannelId,
          message: ebfMessage,
          root_id: ebfRootId,
          ...ebfRest
        } = extraBodyFields;

        // Start with remaining extra fields as base (Pass 1)
        const postBody: IDataObject = { ...ebfRest };

        // UI wins on channel_id (always); testChannelId overrides when in test mode
        postBody.channel_id = effectiveChannelId;

        // message: UI wins if non-empty, else JSON value
        if (message) {
          postBody.message = message;
        } else if (ebfMessage) {
          postBody.message = ebfMessage;
        }

        // root_id: UI wins if non-empty, else thread group key lookup, else JSON value
        if (rootId) {
          postBody.root_id = rootId;
        } else if (threadRootPostId) {
          postBody.root_id = threadRootPostId;
        } else if (ebfRootId) {
          postBody.root_id = ebfRootId;
        }

        // file_ids: JSON first, then uploaded
        const jsonFileIdsList = Array.isArray(ebfFileIds)
          ? (ebfFileIds as string[])
          : [];
        const allFileIds = [...jsonFileIdsList, ...uploadedFileIds];
        if (allFileIds.length > 0) postBody.file_ids = allFileIds;

        // props: deep merge (JSON props first, UI attachments appended)
        const ebfPropsObj =
          typeof ebfProps === "object" &&
          ebfProps !== null &&
          !Array.isArray(ebfProps)
            ? (ebfProps as IDataObject)
            : {};
        const ebfAttachments = Array.isArray(ebfPropsObj.attachments)
          ? (ebfPropsObj.attachments as Attachment[])
          : [];
        const { attachments: _ebfAttachments, ...ebfPropsRest } = ebfPropsObj;
        const allAttachments = [...ebfAttachments, ...builtAttachments];

        if (allAttachments.length > 0 || Object.keys(ebfPropsRest).length > 0) {
          const finalProps: IDataObject = { ...(ebfPropsRest as IDataObject) };
          if (allAttachments.length > 0) {
            finalProps.attachments = allAttachments;
          }
          postBody.props = finalProps;
        }

        // Step 4: Create post
        let postResponse: PostResponse;
        try {
          postResponse = (await this.helpers.httpRequest({
            method: "POST",
            url: `${baseUrl}/api/v4/posts`,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: postBody as unknown as Record<string, unknown>,
            json: true,
            skipSslCertificateValidation: allowUnauthorizedCerts,
          })) as PostResponse;
        } catch (postError) {
          // Post failed after successful file uploads — surface file IDs for cleanup
          if (uploadedFileIds.length > 0) {
            if (this.continueOnFail()) {
              returnData.push({
                json: {
                  error: (postError as Error).message,
                  uploaded_file_ids: uploadedFileIds,
                },
                pairedItem: { item: i },
              });
              continue;
            }
            throw new NodeOperationError(
              this.getNode(),
              `Post failed after uploading files. uploaded_file_ids: ${uploadedFileIds.join(", ")}. Original error: ${(postError as Error).message}`,
              { itemIndex: i },
            );
          }
          throw postError;
        }

        // Step 5: Save thread mapping when a new root post was created
        if (useThreadGroupKey && threadRootPostId === null) {
          const prefName = threadPrefName(effectiveChannelId, threadGroupKey);
          try {
            await this.helpers.httpRequest({
              method: "PUT",
              url: `${baseUrl}/api/v4/users/me/preferences`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: [
                {
                  user_id: "me",
                  category: PREF_CATEGORY,
                  name: prefName,
                  value: postResponse.id,
                },
              ] as unknown as Record<string, unknown>,
              json: true,
              skipSslCertificateValidation: allowUnauthorizedCerts,
            });
          } catch {
            // Silently ignored: post succeeded but mapping not saved.
            // Next invocation with the same key will create a new thread.
          }
        }

        const output: IDataObject = {
          post_id: postResponse.id,
          channel_id: postResponse.channel_id,
          message: postResponse.message,
          file_ids: postResponse.file_ids ?? [],
          create_at: postResponse.create_at,
        };
        if (useThreadGroupKey) {
          output.thread_group_key = threadGroupKey;
          output.thread_root_post_id = threadRootPostId;
        }

        returnData.push({
          json: output,
          pairedItem: { item: i },
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: (error as Error).message,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        if (
          error instanceof NodeApiError ||
          error instanceof NodeOperationError
        ) {
          throw error;
        }
        throw new NodeOperationError(this.getNode(), error as Error, {
          itemIndex: i,
        });
      }
    }

    return [returnData];
  }
}
