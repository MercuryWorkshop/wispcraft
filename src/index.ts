import { DEFAULT_WISP_URL } from "./consts";
import {
	startDeviceCodeAuth,
	getProfile,
	minecraftAuth,
	refreshMsToken,
	UserInfo,
} from "./auth";
import { epoxyFetch, initWisp } from "./connection/epoxy";
import { makeFakeWebSocket } from "./connection/fakewebsocket";
import { showUI } from "./ui";

export let wispUrl: string =
	((window as any).anura && (window as any).anura.wsproxyURL) ||
	new URL(window.location.href).searchParams.get("wisp") ||
	localStorage["wispcraft_wispurl"] ||
	DEFAULT_WISP_URL;

export type AuthStore = {
	user: UserInfo | null;
	msToken: string;
	msRefresh: string;
	yggToken: string;
};

export type TokenStore = {
	username: string;
	token: string;
	ms: string;
	// missing on accounts saved before refresh tokens were stored
	refresh?: string;
};

export let authstore: AuthStore = {
	user: null,
	msToken: "",
	msRefresh: "",
	yggToken: "",
};

export function setWispUrl(wisp: string) {
	const wispUrlUrl = new URL(wisp);
	if (!wispUrlUrl.pathname.endsWith("/")) {
		wispUrlUrl.pathname += "/";
	}
	wispUrl = wispUrlUrl.href;
}

try {
	setWispUrl(wispUrl);
} catch (e) {
	console.error(e);
}

export function getLoggedInAccounts(): TokenStore[] | undefined {
	const accounts = localStorage["wispcraft_accounts"];
	if (accounts) {
		return JSON.parse(accounts) as TokenStore[];
	} else {
		return undefined;
	}
}

export function getLastUsedAccount(): TokenStore | undefined {
	const username = localStorage["wispcraft_last_used_account"];
	const accounts = getLoggedInAccounts();
	if (username && accounts) {
		return accounts.find((account) => account.username === username);
	} else {
		return undefined;
	}
}

export function saveAccount(entry: TokenStore) {
	const accounts = getLoggedInAccounts() || [];
	const existingAccount = accounts.findIndex(
		(account) => account.username === entry.username
	);
	if (existingAccount != -1) {
		accounts.splice(existingAccount, 1, entry);
	} else {
		accounts.push(entry);
	}
	localStorage["wispcraft_accounts"] = JSON.stringify(accounts);
}

// load a saved account into authstore, falling back to the ms token and then
// the refresh token as each one expires
export async function restoreAccount(account: TokenStore) {
	authstore.msToken = account.ms;
	authstore.msRefresh = account.refresh || "";
	authstore.yggToken = account.token;
	try {
		authstore.user = await getProfile(authstore.yggToken);
		return;
	} catch (e) {}

	try {
		authstore.yggToken = await minecraftAuth(authstore.msToken);
	} catch (e) {
		if (!authstore.msRefresh) throw e;
		const tokens = await refreshMsToken(authstore.msRefresh);
		authstore.msToken = tokens.access;
		authstore.msRefresh = tokens.refresh;
		authstore.yggToken = await minecraftAuth(authstore.msToken);
	}
	authstore.user = await getProfile(authstore.yggToken);
	saveAccount({
		username: authstore.user.name,
		token: authstore.yggToken,
		ms: authstore.msToken,
		refresh: authstore.msRefresh || undefined,
	});
}

if (localStorage["wispcraft_accounts"]) {
	const account = getLastUsedAccount();
	if (account) {
		restoreAccount(account).catch(console.error);
	}
}

export const showSettingsUI = showUI;
export const getAuthCode = startDeviceCodeAuth;

const nativeFetch = fetch;
// eagler will fetch texture packs, will fail if cors isn't set
// should really fix this but whatever
window.fetch = async function (url: RequestInfo | URL, init?: RequestInit) {
	try {
		return await nativeFetch(url, init);
	} catch (e) {
		return await epoxyFetch("" + url, init);
	}
};

// replace websocket with our own
window.WebSocket = makeFakeWebSocket();

type EaglerXOptions = any;
let eagoptions: EaglerXOptions;
// append settings to the server list
const settings = { addr: "settings://", name: "Wispcraft Settings" };
let relayId = Math.floor(Math.random() * 3);
Object.defineProperty(window, "eaglercraftXOpts", {
	get() {
		if (eagoptions) {
			return eagoptions;
		}
		return {
			container: "game_frame",
			worldsDB: "worlds",
			relays: [
				{
					addr: "wss://relay.deev.is/",
					comment: "lax1dude relay #1",
					primary: relayId == 0,
				},
				{
					addr: "wss://relay.lax1dude.net/",
					comment: "lax1dude relay #2",
					primary: relayId == 1,
				},
				{
					addr: "wss://relay.shhnowisnottheti.me/",
					comment: "ayunami relay #1",
					primary: relayId == 2,
				},
			],
		};
	},
	set(v) {
		eagoptions = v;
		if (eagoptions?.servers) {
			eagoptions.servers.unshift(settings);
		} else {
			eagoptions.servers = [settings];
		}
	},
});

initWisp(wispUrl);

if (window["anura"]) {
	document.addEventListener("click", function () {
		setTimeout(function () {
			(window.frameElement as HTMLIFrameElement)?.focus();
			window.focus();
		}, 5);
	});
	(window.frameElement as HTMLIFrameElement)?.focus();
}
