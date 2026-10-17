import encodeQR from "qr";
import { epoxyFetch } from "./connection/epoxy";

const CLIENT_ID = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb";

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

interface OAuthResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
	refresh_token: string;
}

export interface MsTokens {
	access: string;
	refresh: string;
}

interface DeviceCodeResult {
	url: string;
	code: string;
	tokens: Promise<MsTokens>;
}

// https://gist.github.com/Plagiatus/ce5f18bc010395fc45d8553905e10f55
export interface UserInfo {
	id: string;
	name: string;
	skins: SkinInfo[];
	capes: CapeInfo[];
}
export interface AccessoryInfo {
	id: string;
	state: "ACTIVE" | "INACTIVE";
	url: string;
}
export interface SkinInfo extends AccessoryInfo {
	variant: string;
}
export interface CapeInfo extends AccessoryInfo {
	alias: string;
}

export async function deviceCodeAuth(): Promise<DeviceCodeResult> {
	const deviceCodeRes = await epoxyFetch(
		"https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: CLIENT_ID,
				scope: "XboxLive.signin offline_access",
			}).toString(),
		}
	);

	const deviceCodeData: DeviceCodeResponse = await deviceCodeRes.json();
	const { device_code, user_code, verification_uri, interval } = deviceCodeData;

	if (!device_code || !user_code || !verification_uri) {
		throw new Error("Failed to obtain device code information.");
	}
	const tokenGenerator = async () => {
		// poll the token endpoint until the user completes the authentication
		let tokenData: OAuthResponse | null = null;

		interface TokenPollingResponse {
			access_token?: string;
			error?: string;
		}

		while (!tokenData?.access_token) {
			const tokenRes = await epoxyFetch(
				"https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						client_id: CLIENT_ID,
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: device_code,
					}).toString(),
				}
			);

			const pollingResponse: TokenPollingResponse = await tokenRes.json();

			if (pollingResponse.access_token) {
				tokenData = pollingResponse as OAuthResponse;
			} else if (pollingResponse.error === "authorization_pending") {
				// user has not completed the authentication yet; wait for the interval
				await new Promise((resolve) => setTimeout(resolve, interval * 1000));
			} else {
				throw new Error(`Polling failed with error: ${pollingResponse.error}`);
			}
		}

		return { access: tokenData.access_token, refresh: tokenData.refresh_token };
	};
	const tokens = tokenGenerator();
	return {
		url: verification_uri,
		code: user_code,
		tokens,
	};
}

type AuthCodeResult = DeviceCodeResult & {
	link_url: string;
	qr_svg: string;
	qr_svg_uri: string;
};

export async function startDeviceCodeAuth(): Promise<AuthCodeResult> {
	const codeGenerator = await deviceCodeAuth();
	const linkUrl = "https://microsoft.com/link?otc=" + codeGenerator.code;
	const qrSvg = encodeQR(linkUrl, "svg", {
		scale: 6,
		border: 1,
	});
	return {
		...codeGenerator,
		link_url: linkUrl,
		qr_svg: qrSvg,
		qr_svg_uri: `data:image/svg+xml;base64,${btoa(qrSvg)}`,
	};
}

export async function refreshMsToken(refreshToken: string): Promise<MsTokens> {
	const res = await epoxyFetch(
		"https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: CLIENT_ID,
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				scope: "XboxLive.signin offline_access",
			}).toString(),
		}
	);
	const json = await res.json();
	if (!json["access_token"])
		throw new Error(`refreshing ms token failed: ${json["error"]}`);

	// microsoft may rotate the refresh token, so keep the old one if it doesn't
	return {
		access: json["access_token"],
		refresh: json["refresh_token"] || refreshToken,
	};
}

async function xboxAuth(msToken: string): Promise<string> {
	const res = await epoxyFetch(
		"https://user.auth.xboxlive.com/user/authenticate",
		{
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			method: "POST",
			body: `{
			"Properties": {
				"AuthMethod": "RPS",
				"SiteName": "user.auth.xboxlive.com",
				"RpsTicket": "d=${msToken}"
			},
			"RelyingParty": "http://auth.xboxlive.com",
			"TokenType": "JWT"
 		}`,
		}
	);
	const json = await res.json();
	if (!json["Token"]) throw new Error("xbox live did not return a token");

	return json["Token"];
}

async function xstsAuth(
	xboxToken: string
): Promise<{ token: string; userHash: string }> {
	const res = await epoxyFetch(
		"https://xsts.auth.xboxlive.com/xsts/authorize",
		{
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			method: "POST",
			body: JSON.stringify({
				Properties: {
					SandboxId: "RETAIL",
					UserTokens: [xboxToken],
				},
				RelyingParty: "rp://api.minecraftservices.com/",
				TokenType: "JWT",
			}),
		}
	);
	const json = await res.json();

	const xboxError = json["XErr"];
	if (xboxError) {
		switch (xboxError) {
			case 2148916227:
				throw new Error("xsts says this account is banned from xbox");
			case 2148916233:
				throw new Error("xsts says this account does not have a xbox account");
			case 2148916235:
				throw new Error(
					"xsts says xbox live is not available in this account's country"
				);
			case 2148916236:
			case 2148916237:
				throw new Error("xsts says this account needs adult verification");
			case 2148916238:
				throw new Error(
					"xsts says this account is under 18 and needs to be added to a family"
				);
			case 2148916262:
			default:
				throw new Error(`xsts error: ${xboxError}`);
		}
	}

	const token = json["Token"];
	if (!token) throw new Error("xsts did not return a token");
	let userHash: string;
	try {
		userHash = json["DisplayClaims"]["xui"][0]["uhs"];
	} catch (err) {
		throw new Error("xsts did not return user hash");
	}

	return { token, userHash };
}

async function mcAuth(xstsToken: string, xstsHash: string): Promise<string> {
	const res = await epoxyFetch(
		"https://api.minecraftservices.com/authentication/login_with_xbox",
		{
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			method: "POST",
			body: JSON.stringify({
				identityToken: `XBL3.0 x=${xstsHash};${xstsToken}`,
			}),
		}
	);
	const json = await res.json();
	const token = json["access_token"];
	if (!token) throw new Error("minecraft did not return a token");

	return token;
}

export async function minecraftAuth(msToken: string): Promise<string> {
	const xboxToken = await xboxAuth(msToken);
	const xstsInfo = await xstsAuth(xboxToken);
	return mcAuth(xstsInfo.token, xstsInfo.userHash);
}

export async function checkOwnership(mcToken: string): Promise<boolean> {
	const res = await epoxyFetch(
		"https://api.minecraftservices.com/entitlements/mcstore",
		{
			headers: {
				Authorization: `Bearer ${mcToken}`,
			},
		}
	);
	const json = await res.json();
	return (
		json.items?.some(
			(item: { name: string }) =>
				item.name === "product_minecraft" || item.name === "game_minecraft"
		) ?? false
	);
}

export async function getProfile(mcToken: string): Promise<UserInfo> {
	const res = await epoxyFetch(
		"https://api.minecraftservices.com/minecraft/profile",
		{
			headers: {
				Authorization: `Bearer ${mcToken}`,
			},
		}
	);
	const json = await res.json();
	if (!json["id"] || !json["name"])
		throw new Error("mc did not return a profile");

	return json;
}

export async function joinServer(
	mcToken: string,
	uuid: string,
	digest: string
) {
	await epoxyFetch("https://sessionserver.mojang.com/session/minecraft/join", {
		headers: {
			"Content-Type": "application/json",
		},
		method: "POST",
		body: JSON.stringify({
			accessToken: mcToken,
			selectedProfile: uuid,
			serverId: digest,
		}),
	});
}
