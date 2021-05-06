import cheerio from "cheerio";
import _ from "lodash";
import {EventEmitter} from "events";
// import fetch, { FetchError } from "node-fetch";
import axios, { AxiosInstance } from "axios";
import { fetchParser, YtcMessage } from "./ytc-fetch-parser";
import { GetLiveChatBody, GetLiveChatData, Ytcfg } from "./ytc-nochrome.d";

const defaultFetchHeader: { [key: string]: string } = {
	"accept": "*/*",
	"accept-language": "zh-TW,zh;q=0.9",
	"cache-control": "no-cache",
	"pragma": "no-cache",
	"sec-ch-ua": '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
	"sec-ch-ua-mobile": "?0",
	"sec-fetch-dest": "empty",
	"sec-fetch-mode": "same-origin",
	"sec-fetch-site": "same-origin",
	"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36"
};
export class YtcNoChrome extends EventEmitter {
	// private subjectCache: { [index: string]: Subject<YtcMessage> } = {};
	private axiosClient: AxiosInstance;
	private observer?: NodeJS.Timeout;
	private videoId: string;
	private errorThreshold = 10;
	constructor(videoId: string, options?: { axios: AxiosInstance }) {
		super();
		if(options?.axios) {
			this.axiosClient = options.axios;
		}
		else {
			this.axiosClient = axios;
		}

		this.videoId = videoId;
	}

	public async start(): Promise<Boolean> {

			// global.setTimeout(async () => {
			try {
				const html = await this.getLiveChatPage(this.videoId);
				const getLiveChatData = this.parseLiveChatPage(this.videoId, html);
				if (typeof getLiveChatData === "object") {
					this.nextFetchLoop(getLiveChatData);
					return true;
				}
				else if (typeof getLiveChatData === "string") {
					console.error(`Message from ${this.videoId}: ${getLiveChatData}`);
					return false;
				}
				else {
					console.error(`Failed fetch ytc page: ${this.videoId}`);
					// throw new Error(`Failed fetch ytc page: ${this.videoId}`);
					return false;
				}
			}
			catch (error) {
				console.error(error);
				// throw new Error(`Live stream not found, ${this.videoId}`);
				return false;
			}
			// }, 1);
	}
	private nextFetchLoop(data: GetLiveChatData) {
		console.log("fetching...");
		this.observer = global.setTimeout(async () => {
			try {
				const result = await this.getLiveChatApi(data);
				const nextData = this.setLiveChatApiData(data, result);
				const messages = fetchParser(result);
				console.log(messages.length);
				for (const msg of messages) {
					this.emit("comment", msg);
				}
				if (nextData) {
					nextData.retry = 0;
					this.nextFetchLoop(nextData);
				}
				else {
					this.stop(`Live stream is finished, ${this.videoId}`);
				}
			}
			catch (error) {
				if (data.retry < this.errorThreshold) {
					data.retry++;
					this.nextFetchLoop(data);
					console.error(error);
					console.error(`Error retrieving ${this.videoId}, retrying attempt: `, data.retry);
				}
				else {
					this.stop(`Connection was lost/Stream ended, ${this.videoId}`);
				}
			}
		}, Math.min(data.timeoutMs, 10000));
	}

	public async stop(reason: string) {
		if (this.observer) {
			// eslint-disable-next-line no-restricted-globals
			clearTimeout(this.observer);
			this.emit("end", reason);
		}
	}

	async getLiveChatPage(videoId: string) {
		const res = await this.axiosClient.get(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`, {
			headers: _.merge({}, defaultFetchHeader, {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
				"sec-fetch-dest": "document",
				"sec-fetch-mode": "navigate",
				"sec-fetch-site": "none",
				"sec-fetch-user": "?1",
				"upgrade-insecure-requests": "1",
			}),
		});
		const html = await res.data;
		return html;
	}

	private parseLiveChatPage(videoId: string, html: string): GetLiveChatData | string | undefined {
		const $ = cheerio.load(html);
		const ytcfgScript = $("script").filter((index, scriptEl) => cheerio.html(scriptEl).includes("INNERTUBE_CONTEXT"));
		const ytcfgText = ytcfgScript.html()?.match(/ytcfg\.set\((.*)\);/)?.[1];
		const ytInitialDataScript = $("script").filter((index, scriptEl) => cheerio.html(scriptEl).includes("ytInitialData"));
		const ytInitialDataText = ytInitialDataScript.html()?.match(/window\["ytInitialData"\] = (.*);/)?.[1];

		if (ytcfgText && ytInitialDataText) {
			const ytcfg: Ytcfg = JSON.parse(ytcfgText);
			const ytInitialData = JSON.parse(ytInitialDataText);

			const apiKey = ytcfg.INNERTUBE_API_KEY;
			const clientName = ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME;
			const clientVersion = ytcfg.INNERTUBE_CONTEXT_CLIENT_VERSION;
			const visitorData = ytcfg.VISITOR_DATA;
			const continuations0 = ytInitialData?.contents?.liveChatRenderer?.continuations?.[0];
			const clickTrackingParams = continuations0?.timedContinuationData?.clickTrackingParams ?? continuations0?.invalidationContinuationData?.clickTrackingParams;
			const continuation = continuations0?.timedContinuationData?.continuation ?? continuations0?.invalidationContinuationData?.continuation;
			const timeoutMs = continuations0?.timedContinuationData?.timeoutMs ?? continuations0?.invalidationContinuationData?.timeoutMs;
			const firstMessage = ytInitialData?.contents?.messageRenderer?.text?.runs?.[0]?.text;

			const body: GetLiveChatBody = _.merge({
				context: ytcfg.INNERTUBE_CONTEXT
			}, {
				context: {
					client: {
						screenWidthPoints: 1745,
						screenHeightPoints: 852,
						screenPixelDensity: 1,
						screenDensityFloat: 1,
						utcOffsetMinutes: 480,
						userInterfaceTheme: "USER_INTERFACE_THEME_DARK",
						connectionType: "CONN_CELLULAR_4G",
						mainAppWebInfo: {
							graftUrl: `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`,
							webDisplayMode: "WEB_DISPLAY_MODE_BROWSER"
						},
						timeZone: "Asia/Taipei"
					},
					request: {
						internalExperimentFlags: [],
						consistencyTokenJars: [],
					},
					clickTracking: {
						// clickTrackingParams,
					},
					adSignalsInfo: {
						params: []
					}
				},
				continuation,
				webClientInfo: {
					isDocumentHidden: false
				}
			});

			if (apiKey && continuation) {
				return {
					videoId,
					apiKey,
					clientName: `${clientName}`,
					clientVersion,
					visitorData,
					body,
					timeoutMs,
					retry: 0,
				};
			}
			return firstMessage;
		}
	}

	private async getLiveChatApi(data: GetLiveChatData) {
		const res = await this.axiosClient(`https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${data.apiKey}`, {
			headers: _.merge({}, defaultFetchHeader, {
				"content-type": "application/json",
				"x-goog-visitor-id": data.visitorData,
				"x-youtube-client-name": data.clientName,
				"x-youtube-client-version": data.clientVersion,
			}),
			data: JSON.stringify(data.body),
			method: "POST",
		});
		const json = res.data;
		return json;
	}

	private setLiveChatApiData(data: GetLiveChatData, json: any) {
		const continuations0 = json?.continuationContents?.liveChatContinuation?.continuations?.[0];
		data.body.continuation = continuations0?.timedContinuationData?.continuation ?? continuations0?.invalidationContinuationData?.continuation;
		data.timeoutMs = continuations0?.timedContinuationData?.timeoutMs ?? continuations0?.invalidationContinuationData?.timeoutMs;
		if (data.body.continuation) {
			return data;
		}
	}
	public on(event: "comment", listener: (comment: YtcMessage) => void): this
	public on(event: "start", listener: (liveId: string) => void): this
	public on(event: "end", listener: (reason?: string) => void): this
	public on(event: "error", listener: (err: Error) => void): this
	public on(event: string | symbol, listener: (...args: any[]) => void): this {
	  return super.on(event, listener);
	}
}
