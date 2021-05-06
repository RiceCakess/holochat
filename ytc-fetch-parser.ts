const convertTimestampUsec = (timestampUsec: string) => {
	timestampUsec = `${timestampUsec}`;
	const timestamp = +timestampUsec.substr(0, timestampUsec.length - 3);
	return new Date(timestamp).toISOString();
};

const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()!@:%_\+.~#?&\/\/=]*)/;
const getNavigationEndpointUrl = (navigationEndpoint: string | NavigationEndpoint): string | undefined => {
	if (!navigationEndpoint) return;
	if (typeof navigationEndpoint === "string") {
		if (urlRegex.test(navigationEndpoint)) return navigationEndpoint;
		return;
	}
	if (typeof navigationEndpoint !== "object") return;
	if (navigationEndpoint?.watchEndpoint && navigationEndpoint?.watchEndpoint?.videoId) {
		return `https://www.youtube.com/watch?v=${navigationEndpoint.watchEndpoint.videoId}`;
	}
	if (navigationEndpoint?.urlEndpoint?.url) {
		return navigationEndpoint?.urlEndpoint?.url;
	}
	return Object.values(navigationEndpoint).find(element => getNavigationEndpointUrl(element));
};

const toMessage = (message: LiveChatSimpleString) => {
	if (message?.simpleText) return message.simpleText;
	if (!message?.runs) return "";
	return message.runs.reduce((acc, msg) => {
		if (msg.emoji) {
			return acc + msg.emoji.shortcuts.reverse()[0];
		}
		if (msg.text) {
			if (msg.navigationEndpoint) {
				const url = getNavigationEndpointUrl(msg.navigationEndpoint);
				if (url) {
					return acc + `[${msg.text}](${url})`;
				}
			}
			return acc + msg.text;
		}
		return acc;
	}, "");
};

const paidToTier = (backgroundColor: number) => {
	switch (backgroundColor) {
		case 4280191205:
			return 1;
		case 4278248959:
			return 2;
		case 4280150454:
			return 3;
		case 4294953512:
			return 4;
		case 4294278144:
			return 5;
		case 4293467747:
			return 6;
		case 4293271831:
			return 7; // or 8
	}
	return 0;
};

export const fetchParser = (json: any) => {
	const result: YtcMessage[] = [];
	try {
		if (json.continuationContents?.liveChatContinuation.actions) {
			for (let action of json.continuationContents.liveChatContinuation.actions) {
				if (action.replayChatItemAction) {
					action = action.replayChatItemAction.actions[0];
				}

				const textRenderer: LiveChatTextMessageRenderer | undefined = action?.addChatItemAction?.item?.liveChatTextMessageRenderer;
				const paidMessageRenderer: LiveChatPaidMessageRenderer | undefined = action?.addChatItemAction?.item?.liveChatPaidMessageRenderer;
				const paidStickerRenderer: LiveChatPaidStickerRenderer | undefined = action?.addChatItemAction?.item?.liveChatPaidStickerRenderer;
				const membershipItemRenderer: LiveChatMembershipItemRenderer | undefined = action?.addChatItemAction?.item?.liveChatMembershipItemRenderer;
				const chatMessage = textRenderer || paidMessageRenderer || membershipItemRenderer;

				if (chatMessage) {
					try {
						let snippet: YtcMessageSnippet | undefined;
						/*if (paidMessageRenderer) {
							const superChat: YtcMessageSuperChat = {
								type: "superChatEvent",
								superChatDetails: {
									amountDisplayString: toMessage(paidMessageRenderer.purchaseAmountText),
									userComment: toMessage(paidMessageRenderer.message),
									tier: paidToTier(paidMessageRenderer.bodyBackgroundColor),
								},
								publishedAt: convertTimestampUsec(paidMessageRenderer.timestampUsec),
							};
							snippet = superChat;
						}
						else if (paidStickerRenderer) {
							const superSticker: YtcMessageSuperSticker = {
								type: "superStickerEvent",
								superStickerDetails: {
									superStickerUrl: paidStickerRenderer.sticker?.thumbnails?.[0]?.url ?? "",
									amountDisplayString: toMessage(paidStickerRenderer.purchaseAmountText),
									tier: paidToTier(paidStickerRenderer.backgroundColor),
								},
								publishedAt: convertTimestampUsec(paidStickerRenderer.timestampUsec),
							};
							snippet = superSticker;
						}
						else if (membershipItemRenderer) {
							const message = toMessage(membershipItemRenderer.headerSubtext);
							const newSponsor: YtcMessageNewSponsor = {
								type: "newSponsorEvent",
								displayMessage: message,
								publishedAt: convertTimestampUsec(chatMessage.timestampUsec),
							};
							snippet = newSponsor;
						}
						else */
						if (textRenderer) {
							const message = textRenderer.message;
							const textMessage: YtcMessageTextMessage = {
								type: "textMessageEvent",
								message,
								// displayMessage: message,
								// textMessageDetails: {
								// 	messageText: message,
								// },
								// publishedAt: convertTimestampUsec(chatMessage.timestampUsec),
								timestamp: Number(chatMessage.timestampUsec),
							};
							snippet = textMessage;
						}
						if (!snippet) continue;
						const msg: YtcMessage = {
							id: chatMessage.id,
							authorDetails: {
								channelId: chatMessage.authorExternalChannelId ?? "",
								channelUrl: chatMessage.authorExternalChannelId ? `https://www.youtube.com/channel/${chatMessage.authorExternalChannelId}` : "",
								displayName: toMessage(chatMessage.authorName),
								profileImageUrl: chatMessage.authorPhoto?.thumbnails.find((t, i, a) => !a.find(t2 => t.width < t2.width))?.url ?? "",
								isVerified: false,
								isChatOwner: false,
								isChatSponsor: false,
								isChatModerator: false,
							},
							snippet,
						};
						if (chatMessage.authorBadges) {
							for (const authorBadge of chatMessage.authorBadges) {
								const chatBadge = authorBadge.liveChatAuthorBadgeRenderer;
								const iconType = chatBadge?.icon?.iconType;
								switch (iconType) {
									case "MODERATOR":
										msg.authorDetails.isChatModerator = true;
										break;
									case "VERIFIED":
										msg.authorDetails.isVerified = true;
										break;
									case "OWNER":
										msg.authorDetails.isChatOwner = true;
										break;
									default:
										if (chatBadge?.customThumbnail) {
											msg.authorDetails.badgeUrl = chatBadge?.customThumbnail?.thumbnails?.[0]?.url;
											msg.authorDetails.isChatSponsor = true;
										}
										break;
								}
							}
						}
						result.push(msg);
					}
					catch (e) {
						console.error("[ytc] Failed retrieving message informations:", json);
						console.error(chatMessage);
						console.error(e);
					}
				}
				else {
					// console.log('[ytc] Unsupported chat action', action);
				}
			}
		}
		else {
			// console.log('[ytc] Non interesting actions', json);
		}
	}
	catch (e) {
		console.error("[ytc] Fetch interceptor failed parsing:", json);
		console.error(e);
	}
	return result;
};

export interface YtcMessage {
	id: string;
	snippet: YtcMessageSnippet;
	authorDetails: {
		channelId: string;
		channelUrl: string;
		displayName: string;
		profileImageUrl: string;
		isVerified: boolean;
		isChatOwner: boolean;
		isChatSponsor: boolean;
		isChatModerator: boolean;
		badgeUrl?: string;
	};
}

export interface YtcMessageSnippetBase {
	// publishedAt: String;
}

type YtcMessageSnippet = YtcMessageTextMessage | YtcMessageSuperChat | YtcMessageSuperSticker | YtcMessageNewSponsor;

export interface YtcMessageTextMessage extends YtcMessageSnippetBase {
	type: "textMessageEvent";
	message: LiveChatSimpleString;
	// textMessageDetails: {
	// 	messageText: LiveChatSimpleString;
	// };
	timestamp?: Number;
}

export interface YtcMessageSuperChat extends YtcMessageSnippetBase {
	type: "superChatEvent";
	superChatDetails: {
		amountDisplayString: string;
		userComment: string;
		tier: number;
	};
}

export interface YtcMessageSuperSticker extends YtcMessageSnippetBase {
	type: "superStickerEvent";
	superStickerDetails: {
		superStickerMetadata?: {
			altText: string;
		};
		superStickerUrl: string;
		amountDisplayString: string;
		tier: number;
	};
}

export interface YtcMessageNewSponsor extends YtcMessageSnippetBase {
	type: "newSponsorEvent";
	displayMessage: string;
}

// <yt-live-chat-text-message-renderer>
interface LiveChatTextMessageRenderer {
	id: string;
	timestampUsec: string;

	authorName: LiveChatSimpleString;
	authorPhoto: YtImgShadowThumbnailParam;
	authorExternalChannelId: string;
	authorBadges?: LiveChatAuthorBadge[];

	message: LiveChatSimpleString;

	purchaseAmountText: undefined;
}

// <yt-live-chat-paid-message-renderer>
interface LiveChatPaidMessageRenderer {
	id: string;
	timestampUsec: string;

	authorName: LiveChatSimpleString;
	authorPhoto: YtImgShadowThumbnailParam;
	authorExternalChannelId: string;
	authorBadges?: LiveChatAuthorBadge[];
	authorNameTextColor: number;

	message: LiveChatSimpleString;

	purchaseAmountText: LiveChatSimpleString;
	headerBackgroundColor: number;
	headerTextColor: number;
	bodyBackgroundColor: number;
	bodyTextColor: number;
	timestampColor: number;
}

// <yt-live-chat-paid-sticker-renderer>
interface LiveChatPaidStickerRenderer {
	id: string;
	timestampUsec: string;

	authorName: LiveChatSimpleString;
	authorPhoto: YtImgShadowThumbnailParam;
	authorExternalChannelId: string;
	authorBadges?: LiveChatAuthorBadge[];
	authorNameTextColor: number;

	sticker: YtImgShadowThumbnailParam;

	purchaseAmountText: LiveChatSimpleString;
	moneyChipBackgroundColor: number;
	moneyChipTextColor: number;
	backgroundColor: number;
}

// <yt-live-chat-membership-item-renderer>
interface LiveChatMembershipItemRenderer {
	id: string;
	timestampUsec: string;

	authorName: LiveChatSimpleString;
	authorPhoto: YtImgShadowThumbnailParam;
	authorExternalChannelId: string;
	authorBadges: LiveChatAuthorBadge[];

	headerSubtext: LiveChatSimpleString;
}

interface LiveChatAuthorBadge {
	liveChatAuthorBadgeRenderer: LiveChatAuthorBadgeRenderer | LiveChatAuthorBadgeRendererMod;
}

interface LiveChatAuthorBadgeRenderer {
	customThumbnail: KevlarTunerThumbnails;
	icon: undefined;
	tooltip: string;
}

interface LiveChatAuthorBadgeRendererMod {
	customThumbnail: undefined;
	icon: LiveChatAuthorBadgeIcon;
	tooltip: string;
}

interface LiveChatAuthorBadgeIcon {
	iconType: "OWNER" | "VERIFIED" | "MODERATOR";
}

// kevlar_tuner
interface KevlarTunerThumbnails {
	thumbnails: KevlarTunerThumbnail[];
}

interface KevlarTunerThumbnail {
	url: string;
}

// <yt-img-shadow thumbnail="">
interface YtImgShadowThumbnailParam {
	thumbnails: YtImgShadowThumbnail[];
}

interface YtImgShadowThumbnail {
	url: string;
	width: number;
	height: number;
}

interface LiveChatSimpleString {
	runs?: LiveChatTextMessageRun[];
	simpleText?: string;
}

type LiveChatTextMessageRun = LiveChatTextMessageText | LiveChatTextMessageEmoji;

interface LiveChatTextMessageText {
	text: string;
	navigationEndpoint?: string | NavigationEndpoint;
	emoji: undefined;
}

interface NavigationEndpoint {
	commandMetadata?: CommandMetadata;
	watchEndpoint?: WatchEndpoint;
	urlEndpoint?: UrlEndpoint;
}

interface CommandMetadata {
	webCommandMetadata: WebCommandMetadata;
}

interface WebCommandMetadata {
	url: string;
	webPageType: string;
	rootVe: number;
}

interface WatchEndpoint {
	videoId: string;
	nofollow: boolean;
}

interface UrlEndpoint {
	url: string;
}

interface LiveChatTextMessageEmoji {
	text: undefined;
	emoji: LiveChatEmoji;
}

interface LiveChatEmoji {
	emojiId: string;
	shortcuts: string[];
	searchTerms: string[];
	image: KevlarTunerThumbnails;
	isCustomEmoji: boolean;
}
