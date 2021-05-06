import { YtcMessage, YtcMessageTextMessage } from "./ytc-fetch-parser";
import { YtcNoChrome } from "./ytc-nochrome";

// process event handle
process
	.on("warning", console.warn)
	.on("unhandledRejection", (error) => {
		console.error("Unhandled Promise Rejection:", error?.toString());
	})
	.on("uncaughtException", (error) => {
		console.error("Uncaught Exception:", error);
		process.exit(1);
	});

const TL_REGEX: any = {
	en: /^(\[[\s\S]*(en|eng)[\s\S]*\])|^(\([\s\S]*(en|eng)[\s\S]*\))|^((en|eng)\:)|^((en|eng)\-)/i,
	ja: /^(\[[\s\S]*(ja|jp|日本)[\s\S]*\])|^(\([\s\S]*(ja|jp|日本)[\s\S]*\))|^(\「[\s\S]*(ja|jp|日本)[\s\S]*\」)|^(\『[\s\S]*(ja|jp|日本)[\s\S]*\』)|^(\【[\s\S]*(ja|jp|日本)[\s\S]*\】)|^((ja|jp|日本)\:)|^((ja|jp|日本)\-)/i,
	zh: /^(\[[\s\S]*(zh|中文|tc)[\s\S]*\])|^(\([\s\S]*(zh|中文|tc)[\s\S]*\))|^(\「[\s\S]*(zh|中文|tc)[\s\S]*\」)|^(\『[\s\S]*(zh|中文|tc)[\s\S]*\』)|^(\【[\s\S]*(zh|中文|tc)[\s\S]*\】)|^((zh|中文|tc)\:)/i,
	ru: /^(\[[\s\S]*(ru)[\s\S]*\])|^(\([\s\S]*(ru)[\s\S]*\))|^((ru)\:)/i,
	id: /^(\[[\s\S]*(id)[\s\S]*\])|^(\([\s\S]*(id)[\s\S]*\))|^((id)\:)/i,
	es: /^(\[[\s\S]*(es)[\s\S]*\])|^(\([\s\S]*(es)[\s\S]*\))|^((es)\:)/i,
};
connect("A4efgn3MD-w");
async function connect(videoId: string) {
	const ytcHeadless = new YtcNoChrome("EwyiLaL096E");
	const success = await ytcHeadless.start();
	if(!success) {
		console.error("failed to start");
		return;
	}
	ytcHeadless.on("comment", (chatMessage: YtcMessage) => {
			// guessMessageAuthorType(live, chatMessage);
			if (chatMessage.snippet.type !== "textMessageEvent") return;

			// if(chatMessage.authorDetails?.isVerified || chatMessage.authorDetails?.isChatModerator) {
				console.log(chatMessage);
			// }
			const out: any = {};
			const runs = (chatMessage?.snippet as YtcMessageTextMessage)?.message.runs;
			if(!runs) {
				console.log(chatMessage);
			}
			else {
				const msg = formatMessage(runs);
				Object.keys(TL_REGEX).forEach((lang) => {
					// check if msg mataches regex
					if (msg.match(TL_REGEX[lang])) {
					// Label as TL, so frontend can choose to show mod TLs
					out.isTL = true;

					console.log(`${"A4efgn3MD-w"}:${msg}`);
					}
				});
			}
			// }
		});
		ytcHeadless.on("error", (error)=> {
			console.error(error);
		},
	);
}
function formatMessage(runs: any) {
	if(!runs) return;
	//   const { runs } = messages;
	return runs.map((run: any) => {
	  if (run.text) {
		return run.text;
	  }
	  if (run.url) {
		const shortcut = run.alt;
		const thumbnail = run.url;
		return `${shortcut}${thumbnail}`;
	  }
	  return "";
	}).join(" ").trim();
}
// fetchChannel();

// // main event loop
// global.setInterval(async () => {
// 	try {
// 		await fetchChannel();
// 	}
// 	catch (error) {
// 		console.error("fetchChannel error");
// 	}
// }, 60 * 1000);

// // init express server
// const app = express();
// app.get("/", (req, res) => {
// 	res.status(200).json({
// 		ok: true,
// 	});
// });
// app.get("/metrics", async (_req, res) => {
// 	try {
// 		res.set("Content-Type", register.contentType);
// 		res.end(await register.metrics());
// 	}
// 	catch (err) {
// 		res.status(500).end(err);
// 	}
// });
// const listener = app.listen(process.env.PORT || 8080, () => {
// 	const addr = listener.address();
// 	console.log("Your app is listening on port " + (typeof addr === "string" ? addr : addr?.port));
// });
