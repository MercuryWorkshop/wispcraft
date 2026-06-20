import { Buffer } from "./buffer";
import { BytesWriter, Compressor, Decompressor } from "./connection/framer";
import {
	bytesToUuid,
	Decryptor,
	Encryptor,
	encryptRSA,
	loadKey,
	makeSharedSecret,
	mchash,
	offlineUUID,
} from "./connection/crypto";
import { handleSkinCape } from "./skins";
import "./auth";
import { joinServer } from "./auth";
import { VERSION, type AuthStore } from ".";
// import { authstore } from "./index";

enum State {
	Handshaking = 0x00,
	Status = 0x01,
	Login = 0x02,
	Play = 0x03,
}

enum PacketType {
	Clientbound,
	Serverbound
}

// EAG_ prefixed are nonstandard
enum Serverbound {
	/* ==HANDSHAKING== */
	Handshake = 0x00,
	EAG_ClientVersion = 0x01,
	EAG_RequestLogin = 0x04,
	EAG_ProfileData = 0x05,
	EAG_FinishLogin = 0x08,
	/* ==STATUS== */
	StatusRequest = 0x00,
	PingRequest = 0x01,
	/* ==LOGIN== */
	LoginStart = 0x00,
	EncryptionResponse = 0x01,
	/* ==PLAY== */
	PluginMessage = -0x00,
}

enum Serverbound_1_8 {
	PluginMessage = 0x17,
}

enum Serverbound_1_12 {
	PluginMessage = 0x09,
}

enum Clientbound {
	/* ==HANDSHAKING== */
	EAG_ServerVersion = 0x02,
	EAG_AllowLogin = 0x05,
	EAG_FinishLogin = 0x09,
	EAG_Disconnect = 0xff,
	/* ==STATUS== */
	StatusResponse = 0x00,
	PongResponse = 0x01,
	/* ==LOGIN== */
	Disconnect = 0x0,
	EncryptionRequest = 0x01,
	LoginSuccess = 0x02,
	SetCompression = 0x03,
	/* ==PLAY== */
	SetCompressionPlay = 0x46,
	PluginMessage = -0x00,
}

enum Clientbound_1_8 {
	PluginMessage = 0x3f,
}

enum Clientbound_1_12 {
	PluginMessage = 0x18,
}

class Packet extends Buffer {
	constructor(packetType: number) {
		super(new Uint8Array());
		this.writeVarInt(packetType);
	}
}

type ChatSchema = {
	text: string;
	color?: string;
	underlined?: boolean;
	strikethrough?: boolean;
	obfuscated?: boolean;
	bold?: boolean;
	italic?: boolean;
	extra?: ChatSchema[];
};

const colorMap: { [key: string]: string } = {
	black: "0",
	dark_blue: "1",
	dark_green: "2",
	dark_aqua: "3",
	dark_red: "4",
	dark_purple: "5",
	gold: "6",
	gray: "7",
	dark_gray: "8",
	blue: "9",
	green: "a",
	aqua: "b",
	red: "c",
	light_purple: "d",
	yellow: "e",
	white: "f",
};

function chatToLegacyString(chat: ChatSchema) {
	let special = "§";
	let str = "";
	if (chat.color) str += special + colorMap[chat.color];
	if (chat.bold) str += special + "l";
	if (chat.italic) str += special + "o";
	if (chat.underlined) str += special + "n";

	str += chat.text;
	if (chat.extra) {
		for (let i = 0; i < chat.extra.length; i++) {
			str += chatToLegacyString(chat.extra[i]);
		}
	}
	return str;
}

function createEagKick(reason: string): Buffer {
	let eag = Buffer.new();
	let str = new TextEncoder().encode(reason);
	eag.writeBytes([Clientbound.EAG_Disconnect, 0x08]);
	eag.writeUShort(str.length);
	eag.extend(new Buffer(str));
	return eag;
}

function createProtocolArray(pvn: number): number[] {
	if (pvn < 256) {
		return [0, pvn];
	} else {
		return [(pvn >> 8) & 0xff, pvn & 0xff];
	}
}

function getVersionPacketId(protocol: number, type: PacketType, packet: string): number {
	if (type == PacketType.Serverbound) {
		if (protocol == 47) {
			return Serverbound_1_8[packet];
		} else if (protocol == 340) {
			return Serverbound_1_12[packet];
		} else {
			return Serverbound[packet]
		}
	} else {
		if (protocol == 47) {
			return Clientbound_1_8[packet];
		} else if (protocol == 340) {
			return Clientbound_1_12[packet];
		} else {
			return Clientbound[packet]
		}
	}
}

export class EaglerProxy {
	loggedIn: boolean = false;
	handshook: boolean = false;
	decompressor = new Decompressor();
	compressor = new Compressor();
	decryptor = new Decryptor();
	encryptor = new Encryptor();

	state: State = State.Handshaking;

	net: BytesWriter;
	eagler: WritableStreamDefaultWriter<Buffer | string>;

	offlineUsername: string = "";
	offlineUuid: string = "";
	isPremium: boolean = false;

	protocol: number = -1;

	constructor(
		eaglerOut: BytesWriter,
		epoxyOut: BytesWriter,
		public serverAddress: string,
		public serverPort: number,
		public authStore: AuthStore
	) {
		this.net = epoxyOut;
		this.eagler = eaglerOut;
	}

	// consumes packets from eagler, sends them to the upstream server
	async eaglerRead(packet: Buffer) {
		packet = new Buffer(packet.inner); // proto bug
		switch (this.state) {
			case State.Handshaking:
				switch (packet.readVarInt()) {
					case Serverbound.EAG_ClientVersion:
						packet.readUByte();
						const l = packet.readUShort();
						for (let i = 0; i < l; i++) {
							packet.readUShort();
						}
						packet.readUShort()
						this.protocol = packet.readUShort();
						const fakever = new Packet(Clientbound.EAG_ServerVersion);
						{
							const brand = new TextEncoder().encode("Wispcraft");
							fakever.writeBytes([
								0,
								3,
								...createProtocolArray(this.protocol),
								brand.length,
							]);
							fakever.extend(new Buffer(brand));
							fakever.writeBytes([brand.length]);
							fakever.extend(new Buffer(brand));
							fakever.writeBytes([0, 0, 0]);
						}
						this.eagler.write(fakever);
						return;
					case Serverbound.EAG_RequestLogin:
						let username = packet.readString();
						this.offlineUsername = username;

						let fakelogin = new Packet(Clientbound.EAG_AllowLogin);
						if (this.authStore.user) {
							fakelogin.writeString(this.authStore.user.name);
							fakelogin.writeBytes(
								this.authStore.user.id.split("").map((x) => parseInt(x))
							);
						} else {
							fakelogin.writeString(this.offlineUsername);
							fakelogin.writeBytes(offlineUUID(this.offlineUsername));
						}
						this.eagler.write(fakelogin);
						return;
					case Serverbound.EAG_FinishLogin:
						// this says finish login but it only finishes the handshake stage since eagler
						// now send the real login packets
						this.state = State.Login;

						let handshake = new Packet(Serverbound.Handshake);
						handshake.writeVarInt(this.protocol);
						handshake.writeString(this.serverAddress);
						handshake.writeUShort(this.serverPort);
						handshake.writeVarInt(State.Login);
						this.net.write(handshake);

						let loginstart = new Packet(Serverbound.LoginStart);
						if (this.authStore.user) {
							loginstart.writeString(this.authStore.user.name);
						} else {
							loginstart.writeString(this.offlineUsername);
						}
						this.net.write(loginstart);
						break;
				}
				break;
			case State.Status:
				// eagler does not send status packets
				break;
			case State.Login:
			case State.Play:
				let pk = packet.readVarInt(false)!;
				switch (pk) {
					case getVersionPacketId(this.protocol, PacketType.Serverbound, "PluginMessage"):
						let fard = packet.copy();
						fard.readVarInt();
						let tag = fard.readString();
						if (tag.startsWith("EAG|")) {
							if (tag == "EAG|Skins-1.8" || tag == "EAG|Capes-1.8") {
								let isCape = tag[4] == "C";
								let data = fard.take(fard.length);
								handleSkinCape(isCape, data).then((buf) => {
									if (buf.length == 0) {
										return;
									}
									let resp = new Packet(getVersionPacketId(this.protocol, PacketType.Clientbound, "PluginMessage"));
									resp.writeString(tag);
									resp.extend(buf);
									this.eagler.write(resp);
								});
							}
							break;
						}
					default:
						this.net.write(packet);
						break;
				}
		}
	}

	// consumes packets from the network, sends them to eagler
	async epoxyRead(packet: Buffer) {
		packet = new Buffer(packet.inner); // proto bug
		let pk;
		switch (this.state) {
			case State.Handshaking:
				// there are no clientbound packets in the handshaking state
				break;
			case State.Status:
				pk = packet.readVarInt();
				switch (pk) {
					case Clientbound.StatusResponse:
						let json = packet.readString();
						let body = JSON.parse(json);
						let response: any = {
							name: "Java Server",
							brand: "mercuryworkshop",
							vers: "wispcraft/" + VERSION,
							cracked: true,
							time: Date.now(),
							uuid: bytesToUuid(offlineUUID("wispcraft")),
							type: "motd",
							data: {
								cache: false,
								icon: false,
								online: body.players.online,
								max: body.players.max,
								players: [body.version.name, "\u00A77\u00A7o(Wispcraft)"],
							},
						};

						if (body.description)
							if (typeof body.description == "string")
								response.data.motd = [body.description];
							else if (body.description.extra) {
								response.data.motd = [chatToLegacyString(body.description)];
							} else response.data.motd = [body.description.text];

						if (body.favicon) {
							response.data.icon = true;
						}

						this.eagler.write(JSON.stringify(response));

						if (body.favicon) {
							let image = await createImageBitmap(
								await (await fetch(body.favicon)).blob()
							);
							let canvas = new OffscreenCanvas(image.width, image.height);
							let ctx = canvas.getContext("2d")!;
							ctx.drawImage(image, 0, 0);
							let pixels = ctx.getImageData(
								0,
								0,
								canvas.width,
								canvas.height
							).data;
							this.eagler.write(new Buffer(new Uint8Array(pixels)));
						}
						break;
					case Clientbound.PongResponse:
						let time = packet.readLong();
						break;
					default:
						console.error("Unhandled status packet: " + pk);
				}
				break;
			case State.Login:
				pk = packet.readVarInt();
				switch (pk) {
					case Clientbound.Disconnect:
						{
							let reason = packet.readString();
							console.error("Disconnect during login: " + reason);
							let legacyreason = chatToLegacyString(JSON.parse(reason));
							let eag = createEagKick(legacyreason);
							this.eagler.write(eag);
						}
						break;
					case Clientbound.LoginSuccess:
						this.offlineUuid = packet.readString();
						this.state = State.Play;
						let eag = new Packet(Clientbound.EAG_FinishLogin);
						this.eagler.write(eag);
						break;
					case Clientbound.SetCompression:
						let threshold = packet.readVarInt()!;
						this.decompressor.compressionThresh = threshold;
						this.compressor.compressionThresh = threshold;
						break;
					case Clientbound.EncryptionRequest:
						{
							this.isPremium = true;

							if (this.authStore.user == null) {
								const reason =
									"This server requires authentication, but you are not logged in!\n Connect to Wispcraft Settings to log in with Microsoft";
								let eag = createEagKick(reason);
								this.eagler.write(eag);
								return;
							}

							let serverid = packet.readString();
							let publicKey = packet.readVariableData();
							let verifyToken = packet.readVariableData();

							let sharedSecret = makeSharedSecret();
							let digest = await mchash(
								new Uint8Array([
									...new TextEncoder().encode(serverid),
									...sharedSecret,
									...publicKey.inner,
								])
							);

							const [modulus, exponent] = await loadKey(publicKey.inner);
							let encrypedSecret = encryptRSA(sharedSecret, modulus, exponent);
							let encryptedChallenge = encryptRSA(
								verifyToken.inner,
								modulus,
								exponent
							);
							await joinServer(
								this.authStore.yggToken,
								digest,
								this.authStore.user.id
							);

							let response = new Packet(Serverbound.EncryptionResponse);
							response.writeVariableData(new Buffer(encrypedSecret));
							response.writeVariableData(new Buffer(encryptedChallenge));
							this.net.write(response).then(() => {
								this.encryptor.seed(sharedSecret);
								this.decryptor.seed(sharedSecret);
							});
						}
						break;
					default:
						console.error("Unhandled login packet: " + pk);
				}
				break;
			case State.Play:
				switch (packet.readVarInt(false)) {
					case Clientbound.SetCompressionPlay:
						if (this.protocol == 47) {
							packet.readVarInt();
							let threshold = packet.readVarInt();
							this.decompressor.compressionThresh = threshold;
							this.compressor.compressionThresh = threshold;
							break;
						}
					case getVersionPacketId(this.protocol, PacketType.Clientbound, "PluginMessage"):
						let pk = packet.copy();
						pk.readVarInt();
						let tag = pk.readString();
						if (tag.startsWith("EAG|")) {
							break;
						}
					default:
						// send rest of packet to eagler
						this.eagler.write(packet);
				}
		}
	}

	// pings remote server, sends json to eagler
	async ping() {
		let handshake = new Packet(Serverbound.Handshake);
		handshake.writeVarInt(47);
		handshake.writeString(this.serverAddress);
		handshake.writeUShort(this.serverPort);
		handshake.writeVarInt(State.Status);
		this.net.write(handshake);

		let statusRequest = new Packet(Serverbound.StatusRequest);
		this.net.write(statusRequest);

		let pingRequest = new Packet(Serverbound.PingRequest);
		pingRequest.writeLong(Date.now());
		this.net.write(pingRequest);

		this.state = State.Status;
	}
}
