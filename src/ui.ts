import { deviceCodeAuth, getAuthCodeResponse, getProfile, minecraftAuth } from "./auth";
import { reconnect, set_wisp_server } from "./connection/epoxy";
import { authstore, DEFAULT_WISP_URL, getLastUsedAccount, getLoggedInAccounts, TokenStore, wispUrl } from ".";
import encodeQR from "qr";
// @ts-ignore
import workshop from "./img/workshop.png";

let keydownListeners: Array<EventListenerOrEventListenerObject> = [];
const nativeAddEventListener = window.addEventListener;
window.addEventListener = (
	type: string,
	listener: EventListenerOrEventListenerObject
) => {
	if (type == "keydown") {
		keydownListeners.push(listener);
	}
	nativeAddEventListener(type, listener);
};

export function createUI() {
	const ui = `
      	<style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=Rajdhani:wght@700&display=swap');

            .backdrop-blur {
                display: "block";
                width: 100vw;
                height: 100vh;
                position: fixed;
                z-index: 10;
                top: 0;
                left: 0;

                background-color: rgba(0, 0, 0, 0.5);
            }

            .settings-ui {
                width: 80vw;
                height: 80vh;
                position: fixed;
                z-index: 20;

                background-color: #020817;
                border-radius: 1rem;
                border: 1px solid #1E293B;
                color: #F8FAFC;
                font-family: "Inter";

                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);

                display: flex;
                flex-direction: column;
            }

            .settings-ui * {
                margin: 0;
                padding: 0;
            }

            .header {
                padding: 1rem;
                display: flex;

                align-items: center;
                justify-content: space-between;
            }

            .header .side {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .header #close {
                cursor: pointer;
            }

            .header h1 {
                font-family: "Rajdhani";
            }

            .header img {
                height: 3rem;
                width: 3rem;
            }

            .settings-ui .tabs {
                padding: 0rem 1rem;
                display: flex;
                align-items: start;
                gap: 2rem;

                border-bottom: 1px solid #313244;
            }

            .settings-ui span {
                cursor: pointer;
            }

            .settings-ui span.selected {
                border-bottom: 2.5px solid #cdd6f4;
                padding-bottom: 6px;
            }

            .content {
                display: flex;
                flex-direction: column;
                flex: 1;

                overflow-y: scroll;

                padding: 1rem;

                gap: 1.25rem;
            }

            .settings-ui .setting {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .hidden {
                display: none;
            }

            .settings-ui .input {
                background-color: #020817;
                color: #cdd6f4;
                border: 1px solid #1E293B;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 14px;
                transition: all 0.2s ease;
            }

            .settings-ui .input:focus {
                outline: none;
            }

            .settings-ui .input::placeholder {
                color: #6c7086;
            }

            .settings-ui .checkbox-wrapper {
                position: relative;
                display: inline-block;
            }

            .settings-ui .checkbox-wrapper input {
                position: absolute;
                opacity: 0;
                cursor: pointer;
                height: 0;
                width: 0;
            }

            .settings-ui .checkbox-mark {
                position: absolute;
                height: 18px;
                width: 18px;
                background-color: #1E293B;
                border: 1px solid #1E293B;
                border-radius: 4px;
                transition: all 0.2s ease;
            }

            .settings-ui .checkbox-wrapper input:checked ~ .checkbox-mark {
                background-color: #3C82F5;
            }

            .settings-ui .checkbox-mark:after {
                content: "";
                position: absolute;
                display: none;
            }

            .settings-ui .checkbox-wrapper input:checked ~ .checkbox-mark:after {
                display: block;
            }

            .settings-ui .checkbox-wrapper .checkbox-mark:after {
                left: 6px;
                top: 2.25px;
                width: 3px;
                height: 8px;
                border: solid #1e1e2e;
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
            }

            .settings-ui .select {
                background-color: inherit;
                color: #cdd6f4;
                border: 1px solid #313244;
                border-radius: 6px;
                padding: 8px 32px 8px 12px;
                font-size: 14px;
                cursor: pointer;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%236c7086' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 12px center;
            }

            .settings-ui .select option {
                background-color: #020817;
                color: #cdd6f4;
            }

            .settings-ui .select:focus {
                outline: none;
            }

            .settings-ui .action {
                display: flex;
                flex-direction: row;
                gap: 0.5rem;
            }

            .settings-ui .action .button {
                background-color: #3C82F6;
                color: #0F172A;
                border: 1px solid #1E293B;
                border-radius: 6px;
                padding: 8px 16px;
                font-size: 14px;
                height: 37px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 1;
            }

            .settings-ui .action .button:hover {
                background-color: rgba(57 128 242, 0.9);
            }

            .settings-ui .action .button:focus {
                outline: none;
            }

            .settings-ui #account_status {
                text-align: center;
            }

            .settings-ui #save_status {
                font-size: 14px;
                color: #cdd6f4;
            }

            .settings-ui #account_status svg {
                background-color: #cdd6f4;
                color: #020817;
                border: 1px solid #1E293B;
                border-radius: 6px;
                padding: 8px 8px;
                width: 148px;
                height: 148px;
                transition: all 0.2s ease;
            }

            .settings-ui #account_status svg:hover {
                background-color: #ffffff;
                color: #000000;
            }

            .settings-ui #account_status a {
                color: #3C82F6;
            }

            .settings-ui #account_status a:active {
                color: #cdd6f4;
            }

            .link {
                color: #3C82F6;
            }
            
            .list{
              padding-left: 2em;
            }
            
            .value {
              width: 3.5em;
              padding: 4px 2px;
              margin: -4px 0;
              text-align:center;
            }

        </style>

        <div class="backdrop-blur hidden" id="backdrop_blur"></div>

        <div class="settings-ui hidden" id="settings_ui">
            <div class="header">
                <div class="side">
                    <img src="${workshop}">
                    <h1>Wispcraft</h1>
                </div>

                <div class="side" style="padding-right:1rem;color:rgba(248,250,252,0.8);">
                    <svg id="close" onclick="document.querySelector('.settings-ui').classList.add('hidden');document.querySelector('.backdrop-blur').classList.add('hidden');" xmlns="http://www.w3.org/2000/svg" width="24" height="24" stroke="currentColor" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </div>
            </div>

            <div class="tabs">
                <span class="selected" id="settings_tab">Settings</span>
                <span id="about_tab">About</span>
            </div>

            <div class="content shown" id="settings">
                <div class="setting">
                    <p>Wisp Server</p>
                    <input class="input" id="wisp_url" placeholder="${DEFAULT_WISP_URL}" value="${wispUrl}" />
                    <p id="save_status"><br /></p>
                    <p>Microsoft Accounts</p>
                    <select name="accounts" id="account_select" class="select">
                        <option selected disabled>Choose an account</option>
                        <option value="no-account">NONE</option>
                    </select>
                    <p id="account_status"></p>
                    <div class="action">
                        <button class="button" id="addbutton">Add an account</button>
                        <button class="button" id="removebutton" disabled>Remove account</button>
                    </div>
                </div>
            </div>

            <div class="content hidden" id="about">
                <div class="setting">
                  <p>Wispcraft uses the <a class="link" href="https://github.com/MercuryWorkshop/wisp-protocol">Wisp protocol</a> to allow an Eaglercraft client to connect to traditional Java Minecraft servers. To connect to Java Minecraft server begin the server address with <input class="input value" type="text" readonly value="java://">  if you would like to connect to an Eaglercraft server continue starting the address with <input class="input value" type="text" readonly value="wss://">.</p>
                  <br>
                  <p>Warnings:</p>
                  <ul class="list">
                    <li>Connecting to a cracked Minecraft server over Wisp gives the Wisp server access to chat logs, map data, etc..</li>
                    <li>Using your Minecraft account on Wispcraft may lead to a server taking action on your account.  </li>
                  </ul>
                </div>
            </div>
        </div>`;

	document.body.insertAdjacentHTML("beforeend", ui);

	const settings = document.querySelector("#settings") as HTMLDivElement;
	const about = document.querySelector("#about") as HTMLDivElement;

	const settingsTab = document.querySelector(
		"#settings_tab"
	) as HTMLSpanElement;
	const aboutTab = document.querySelector("#about_tab") as HTMLSpanElement;

	const wispInput = document.querySelector("#wisp_url") as HTMLInputElement;

	wispInput.addEventListener("focusin", () =>
		keydownListeners.map((listener) =>
			window.removeEventListener("keydown", listener)
		)
	);

	wispInput.addEventListener("focusout", () =>
		keydownListeners.map((listener) =>
			nativeAddEventListener("keydown", listener)
		)
	);
	const saveStatus = document.querySelector(
		"#save_status"
	) as HTMLParagraphElement;

	const accountSelect = document.querySelector(
		"#account_select"
	) as HTMLSelectElement;
	const addButton = document.querySelector("#addbutton") as HTMLButtonElement;
	const removeButton = document.querySelector(
		"#removebutton"
	) as HTMLButtonElement;
	const accountStatus = document.querySelector(
		"#account_status"
	) as HTMLParagraphElement;

	if (localStorage["wispcraft_wispurl"]) {
		wispInput.value = localStorage["wispcraft_wispurl"] as string;
	}

	if (localStorage["wispcraft_accounts"]) {
        const accounts = getLoggedInAccounts();
        if (accounts) {
            for (const account of accounts) {
                const option = document.createElement("option");
                option.value = account.username;
                option.innerText = account.username;
                accountSelect.add(option);
            }
        }
	}

	if (localStorage["wispcraft_last_used_account"]) {
		accountSelect.value = localStorage["wispcraft_last_used_account"];
	}

	let saveTi: any = -1;

	wispInput.onchange = async () => {
		if (saveTi != -1) {
			clearTimeout(saveTi);
			saveTi = -1;
		}
		try {
			const value = wispInput.value;
			localStorage.setItem("wispcraft_wispurl", value);
			set_wisp_server(value);
			await reconnect();
			saveStatus.innerText = `Wisp server set successfully!`;
		} catch (e) {
			saveStatus.innerText = `An error occured: ${new String(e).toString()}`;
		}
		saveTi = setTimeout(() => {
			saveStatus.innerHTML = "<br />";
		}, 5000);
	};

	aboutTab.onclick = () => {
		const tabs = document.querySelectorAll(".tabs span");
		const pages = document.querySelectorAll(".settings-ui .content");

		for (const tab of tabs) {
			tab.classList.remove("selected");
		}

		for (const page of pages) {
			page.classList.remove("shown");
			page.classList.add("hidden");
		}

		about.classList.remove("hidden");
		about.classList.add("shown");
		aboutTab.classList.add("selected");
	};

	settingsTab.onclick = () => {
		const tabs = document.querySelectorAll(".tabs span");
		const pages = document.querySelectorAll(".settings-ui .content");

		for (const tab of tabs) {
			tab.classList.remove("selected");
		}

		for (const page of pages) {
			page.classList.remove("shown");
			page.classList.add("hidden");
		}

		settings.classList.remove("hidden");
		settings.classList.add("shown");
		settingsTab.classList.add("selected");
	};

	accountSelect.onchange = async () => {
		if (accountSelect.value === "no-account") {
			authstore.user = null;
			authstore.yggToken = "";
			localStorage["wispcraft_last_used_account"] = "no-account";
			removeButton.disabled = true;
			return;
		}
		const account = getLastUsedAccount();
		if (account) {
			try {
				try {
					authstore.msToken = account.ms;
					authstore.yggToken = account.token;
					authstore.user = await getProfile(authstore.yggToken);
				} catch (e) {
					authstore.yggToken = await minecraftAuth(authstore.msToken);
					authstore.user = await getProfile(authstore.yggToken);
				}
				localStorage["wispcraft_last_used_account"] = authstore.user.name;
				removeButton.disabled = false;
				return;
			} catch (e) {
				console.error(e);
				removeAcc();
			}
		}
		accountSelect.value = "no-account";
		authstore.user = null;
		authstore.yggToken = "";
		localStorage["wispcraft_last_used_account"] = "no-account";
		removeButton.disabled = true;
	};

	const removeAcc = () => {
		if (accountSelect.value === "no-account") {
			return;
		}
		const localAuthStore = localStorage["wispcraft_accounts"];
		if (!localAuthStore) {
			return;
		}
		const accounts = JSON.parse(localAuthStore);
		const existingAccount = accounts.findIndex(
			(account: { username: string | undefined }) =>
				account.username === accountSelect.value
		);
		if (existingAccount == -1) {
			return;
		}
		accounts.splice(existingAccount, 1);
		localStorage["wispcraft_accounts"] = JSON.stringify(accounts);
		accountSelect.remove(accountSelect.selectedIndex);
	};

	removeButton.onclick = removeAcc;

	addButton.onclick = async () => {
		try {
			addButton.disabled = true;
			const res = await getAuthCodeResponse();
			accountStatus.innerHTML = `Scan QR Code or click <a id="mslink" href="javascript:void(0)" target="_blank">this link</a> and use code <input id="auth_code" class="input" style="width:8em;text-align:center;" type="text" readonly value="${res.code}" /> for logging in.<br /><br />${res.qr_svg}<br />`;
			const authCodeBox = document.querySelector(
				"#auth_code"
			) as HTMLInputElement;
			authCodeBox.onclick = () => {
				authCodeBox.select();
				authCodeBox.setSelectionRange(0, authCodeBox.value.length);
				navigator.clipboard.writeText(authCodeBox.value);
			};

			accountStatus.querySelector<HTMLAnchorElement>("#mslink")!.onclick =
				async () => {
					const auth = window.open(res.link_url, "", "height=500,width=350");
					await res.token;
					auth?.close();
				};
			await res.token;
			accountStatus.innerHTML = "Authenticating...";

			const token = await res.token;
			authstore.msToken = token;
			authstore.yggToken = await minecraftAuth(authstore.msToken);
			authstore.user = await getProfile(authstore.yggToken);
			const localAuthStore = localStorage["wispcraft_accounts"];
			const newAccEntry = {
				username: authstore.user.name,
				token: authstore.yggToken,
				ms: authstore.msToken,
			} as TokenStore;
			if (!localAuthStore) {
				localStorage["wispcraft_accounts"] = JSON.stringify([newAccEntry]);
			} else {
				const accounts = JSON.parse(localAuthStore);
				const existingAccount = accounts.findIndex(
					(account: { username: string | undefined }) =>
						account.username === authstore.user?.name
				);
				if (existingAccount != -1) {
					accounts.splice(existingAccount, 1, newAccEntry);
				} else {
					accounts.push(newAccEntry);
				}
				localStorage["wispcraft_accounts"] = JSON.stringify(accounts);
			}
			const selector = document.createElement("option");
			selector.value = authstore.user.name;
			selector.innerText = authstore.user.name;
			accountSelect.add(selector);
			accountStatus.innerHTML = "";
			accountSelect.value = authstore.user.name;
			addButton.disabled = false;
			localStorage["wispcraft_last_used_account"] = authstore.user.name;
		} catch (e) {
			accountStatus.innerHTML = `An error occured: <code>${new String(e).toString()}</code>`;
			addButton.disabled = false;
		}
	};

	if (!localStorage["seen_about"]) {
		aboutTab.click();
		localStorage["seen_about"] = 1;
	}
}

export function showUI() {
	const settingsUi = document.querySelector(".settings-ui");
	if (!settingsUi) {
		createUI();
		return showUI();
	}
	settingsUi.classList.remove("hidden");
	document.querySelector(".backdrop-blur")!.classList.remove("hidden");
}
