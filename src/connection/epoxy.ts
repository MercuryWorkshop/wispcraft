import initEpoxy, {
	EpoxyIoStream,
	EpoxyWebSocket,
	EpoxyClient,
	EpoxyClientOptions,
	EpoxyHandlers,
} from "@mercuryworkshop/epoxy-tls";
import { setWispUrl } from "..";

let connectedwisp = "";

let epoxy: EpoxyClient | null = null;

let resolver;
let initpromise = new Promise((r) => (resolver = r));
let initted = false;

export async function initWisp(wisp: string) {
	if (!initted) {
		initted = true;
		await initEpoxy();

		self.Request = new Proxy(self.Request, {
			construct(target, [input, init]) {
				return new target(input || "about:blank", init);
			},
		});
	}

	const options = new EpoxyClientOptions();
	options.wisp_v2 = false;
	options.udp_extension_required = false;
	connectedwisp = wisp;
	epoxy = new EpoxyClient(wisp, options);
	resolver();
}

export function set_wisp_server(wisp_url: string) {
	initpromise = new Promise((r) => (resolver = r));
	setWispUrl(wisp_url);
	initWisp(wisp_url);
}

export async function reconnect() {
	await initpromise;

	await epoxy!.replace_stream_provider();
}

export async function epoxyFetch(url: string, opts?: any): Promise<Response> {
	await initpromise;

	// create() inits epoxy
	return await epoxy!.fetch(url, opts);
}

export async function epoxyWs(
	handlers: EpoxyHandlers,
	uri: string,
	protocols?: string | string[]
): Promise<EpoxyWebSocket> {
	await initpromise;

	// create() inits epoxy
	return await epoxy!.connect_websocket(
		handlers,
		uri,
		protocols ? (typeof protocols == "string" ? [protocols] : protocols) : [],
		{}
	);
}

export async function connect_tcp(socket: string): Promise<EpoxyIoStream> {
	await initpromise;

	// create() inits epoxy
	return await epoxy!.connect_tcp(socket);
}
