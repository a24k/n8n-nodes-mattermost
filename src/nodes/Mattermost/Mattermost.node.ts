import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

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

export class Mattermost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mattermost @a24k',
		name: 'mattermost',
		icon: 'file:mattermost.svg',
		group: ['output'],
		version: 1,
		subtitle: 'Post Message',
		description: 'Post messages to Mattermost with file and rich attachment support',
		defaults: {
			name: 'Mattermost',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'mattermostApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID of the channel to post to',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'The message body (Markdown supported)',
			},
			{
				displayName: 'Root Post ID',
				name: 'rootId',
				type: 'string',
				default: '',
				description: 'Parent post ID for thread replies',
			},
			{
				displayName: 'Files',
				name: 'files',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
					maxValue: 10,
				},
				default: {},
				description: 'Files to attach to the post (max 10)',
				options: [
					{
						name: 'file',
						displayName: 'File',
						values: [
							{
								displayName: 'Binary Property',
								name: 'binaryPropertyName',
								type: 'string',
								default: 'data',
								description: 'Name of the n8n binary data property containing the file',
							},
						],
					},
				],
			},
			{
				displayName: 'Attachments',
				name: 'attachments',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Rich message attachments (Slack-compatible format)',
				options: [
					{
						name: 'attachment',
						displayName: 'Attachment',
						values: [
							{
								displayName: 'Fallback',
								name: 'fallback',
								type: 'string',
								required: true,
								default: '',
								description:
									'Plain-text fallback for notifications and unsupported clients',
							},
							{
								displayName: 'Color',
								name: 'color',
								type: 'string',
								default: '',
								description:
									'Left border color: #hex value or good / warning / danger',
							},
							{
								displayName: 'Text',
								name: 'text',
								type: 'string',
								typeOptions: {
									rows: 3,
								},
								default: '',
								description: 'Attachment body (Markdown and @mention supported)',
							},
							{
								displayName: 'Attachment Options',
								name: 'options',
								type: 'collection',
								placeholder: 'Add Option',
								default: {},
								options: [
									{
										displayName: 'Author Icon',
										name: 'author_icon',
										type: 'string',
										default: '',
										description: 'Author icon URL (16×16px)',
									},
									{
										displayName: 'Author Link',
										name: 'author_link',
										type: 'string',
										default: '',
										description: 'URL for the author name',
									},
									{
										displayName: 'Author Name',
										name: 'author_name',
										type: 'string',
										default: '',
										description: 'Author display name',
									},
									{
										displayName: 'Footer',
										name: 'footer',
										type: 'string',
										default: '',
										description: 'Footer text',
									},
									{
										displayName: 'Footer Icon',
										name: 'footer_icon',
										type: 'string',
										default: '',
										description: 'Footer icon URL',
									},
									{
										displayName: 'Image URL',
										name: 'image_url',
										type: 'string',
										default: '',
										description: 'Image displayed below the body (max 400×300px)',
									},
									{
										displayName: 'Pretext',
										name: 'pretext',
										type: 'string',
										default: '',
										description: 'Text displayed above the attachment (@mention supported)',
									},
									{
										displayName: 'Thumb URL',
										name: 'thumb_url',
										type: 'string',
										default: '',
										description: 'Thumbnail displayed on the right side (75×75px)',
									},
									{
										displayName: 'Title',
										name: 'title',
										type: 'string',
										default: '',
										description: 'Title text',
									},
									{
										displayName: 'Title Link',
										name: 'title_link',
										type: 'string',
										default: '',
										description: 'URL for the title',
									},
								],
							},
							{
								displayName: 'Fields',
								name: 'fields',
								type: 'fixedCollection',
								typeOptions: {
									multipleValues: true,
								},
								default: {},
								description: 'Tabular information within the attachment',
								options: [
									{
										name: 'field',
										displayName: 'Field',
										values: [
											{
												displayName: 'Title',
												name: 'title',
												type: 'string',
												default: '',
												description: 'Column title',
											},
											{
												displayName: 'Value',
												name: 'value',
												type: 'string',
												default: '',
												description: 'Column value (Markdown and @mention supported)',
											},
											{
												displayName: 'Short',
												name: 'short',
												type: 'boolean',
												default: false,
												description:
													'Whether to render side-by-side with adjacent fields',
											},
										],
									},
								],
							},
							{
								displayName: 'Additional Fields',
								name: 'additionalFields',
								type: 'fixedCollection',
								typeOptions: {
									multipleValues: true,
								},
								default: {},
								description: 'Extra fields not covered above (key/value pairs)',
								options: [
									{
										name: 'field',
										displayName: 'Field',
										values: [
											{
												displayName: 'Key',
												name: 'key',
												type: 'string',
												default: '',
												description: 'Field name',
											},
											{
												displayName: 'Value',
												name: 'value',
												type: 'string',
												default: '',
												description: 'Field value',
											},
										],
									},
								],
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('mattermostApi');
		const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
		const accessToken = credentials.accessToken as string;
		const allowUnauthorizedCerts = credentials.allowUnauthorizedCerts as boolean;

		for (let i = 0; i < items.length; i++) {
			try {
				const channelId = this.getNodeParameter('channelId', i) as string;
				const message = this.getNodeParameter('message', i) as string;
				const rootId = this.getNodeParameter('rootId', i) as string;
				const filesParam = this.getNodeParameter('files', i) as {
					file?: Array<{ binaryPropertyName: string }>;
				};
				const attachmentsParam = this.getNodeParameter('attachments', i) as {
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
						additionalFields?: {
							field?: Array<{ key: string; value: string }>;
						};
					}>;
				};

				// Step 1: Upload files in parallel
				const fileItems = filesParam.file ?? [];
				const uploadedFileIds: string[] = [];

				if (fileItems.length > 0) {
					const uploadResults = await Promise.all(
						fileItems.map(async (fileItem) => {
							const binaryPropertyName = fileItem.binaryPropertyName;
							const binaryMeta = this.helpers.assertBinaryData(i, binaryPropertyName);
							const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

							const formData = new FormData();
							formData.append(
								'files',
								new Blob([buffer], { type: binaryMeta.mimeType ?? 'application/octet-stream' }),
								binaryMeta.fileName ?? 'file',
							);

							const response = (await this.helpers.httpRequest({
								method: 'POST',
								url: `${baseUrl}/api/v4/files?channel_id=${encodeURIComponent(channelId)}`,
								headers: {
									Authorization: `Bearer ${accessToken}`,
								},
								body: formData,
								json: true,
								skipSslCertificateValidation: allowUnauthorizedCerts,
							})) as FileUploadResponse;

							return response.file_infos[0].id;
						}),
					);
					uploadedFileIds.push(...uploadResults);
				}

				// Step 2: Build attachments
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

					const additionalFieldItems = att.additionalFields?.field ?? [];
					for (const extra of additionalFieldItems) {
						if (extra.key) {
							result[extra.key] = extra.value;
						}
					}

					return result;
				});

				// Step 3: Create post
				const postBody: IDataObject = {
					channel_id: channelId,
				};
				if (message) postBody.message = message;
				if (rootId) postBody.root_id = rootId;
				if (uploadedFileIds.length > 0) postBody.file_ids = uploadedFileIds;
				if (builtAttachments.length > 0) {
					postBody.props = { attachments: builtAttachments };
				}

				let postResponse: PostResponse;
				try {
					postResponse = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/v4/posts`,
						headers: {
							Authorization: `Bearer ${accessToken}`,
							'Content-Type': 'application/json',
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
							`Post failed after uploading files. uploaded_file_ids: ${uploadedFileIds.join(', ')}. Original error: ${(postError as Error).message}`,
							{ itemIndex: i },
						);
					}
					throw postError;
				}

				returnData.push({
					json: {
						post_id: postResponse.id,
						channel_id: postResponse.channel_id,
						message: postResponse.message,
						file_ids: postResponse.file_ids ?? [],
						create_at: postResponse.create_at,
					},
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
				if (error instanceof NodeApiError || error instanceof NodeOperationError) {
					throw error;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
