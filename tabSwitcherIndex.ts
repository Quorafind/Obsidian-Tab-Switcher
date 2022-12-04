import { App, Modal, Platform, Plugin, setIcon, WorkspaceLeaf, WorkspaceParent } from 'obsidian';
import Fuse from 'fuse.js';
const pinyin = require('tiny-pinyin');

declare module "obsidian" {
	interface Workspace {
		iterateLeaves(callback: (item: WorkspaceLeaf) => unknown, item: WorkspaceParent): boolean;
	}
	interface WorkspaceLeaf {
		parentSplit: WorkspaceParent;
		tabHeaderInnerIconEl: HTMLElement;
		tabHeaderEl: HTMLElement;
		activeTime: number;
	}
}

export default class TabSwitcher extends Plugin {
	private searchModal: TabSwitcherModal;

	async onload() {
		this.addCommand({
			id: 'open-switcher-for-tabs',
			name: 'Open Switcher For Tabs',
			callback: () => {
				this.searchModal = new TabSwitcherModal(this.app, this);
				this.searchModal.open();
			}
		});
	}

	onunload() {
		this.searchModal.close();
	}
}

class TabSwitcherModal extends Modal  {
	private plugin: TabSwitcher;
	private availableLeaves: WorkspaceLeaf[] = [];
	private currentLeaves:  Fuse.FuseResult<WorkspaceLeaf>[] = [];
	private keyString: string = "";
	private cb: (evt: KeyboardEvent)=>void;

	constructor(app: App, plugin: TabSwitcher) {
		super(app);

		this.plugin = plugin;
	}

	getCurrentLeavesInParent() {
		const existingLeaves = new Set<WorkspaceLeaf>();
		const cb = (leaf: WorkspaceLeaf) => { existingLeaves.add(leaf); };
		const leaf = app.workspace.activeLeaf;
		if(!leaf) return;

		app.workspace.iterateLeaves(cb, leaf.parentSplit);
		return [...existingLeaves.values()];
	}

	getAvailableLeaves() {
		const { contentEl } = this;

		const leafArray = this.getCurrentLeavesInParent();
		if(!leafArray) {
			contentEl.createDiv({text: "No tabs opened", cls: "search-leaf-item-not-found"});
			contentEl?.classList.add("tab-switcher-modal-content");
			return;
		}

		this.availableLeaves = leafArray.filter((leaf)=> {
			const viewType = leaf.view.getViewType();
			return (viewType === "markdown" || viewType === "surfing-view" || viewType === "surfing-iframe-view");
		});
	}

	buildLeavesArray() {
		const { contentEl } = this;

		if(this.availableLeaves.length === 0) {
			contentEl.createDiv({text: "No tabs opened", cls: "search-leaf-item-not-found"});
			contentEl?.classList.add("tab-switcher-modal-content");
			return;
		}
		const currentLeaves = this.availableLeaves.sort((a, b) => { return b.activeTime - a.activeTime; });

		contentEl.empty();
		contentEl.createEl("div", {
			text: "Input the tab name or hotkey to switch",
			cls: "search-leaf-item-tips"
		})
		currentLeaves.forEach((leaf,index) => {
			const leafEl = contentEl.createDiv({cls: "search-leaf-item"});
			this.buildLeafItem(leafEl, leaf, index < 9 ? index + 1 : index === 9 ? 0 : -1);
		})
	}

	updateCurrentLeaves(key: string) {
		const { contentEl } = this;

		console.log(key);

		const options = {
			isCaseSensitive: false,
			includeMatches: true,
			shouldSort: true,
			threshold: 0,
			ignoreLocation: true,
			keys: [
				{ name: 'titleName', getFn: (leaf: WorkspaceLeaf) => {
					return pinyin.convertToPinyin(leaf.tabHeaderEl.innerText.toString(), '', true);
				}}
			],
			sortFn: (a: any, b: any) => {
				return b.item.activeTime - a.item.activeTime;
			}
		};

		const fuse = new Fuse(this.availableLeaves, options);
		this.currentLeaves = fuse.search({ titleName: key });

		contentEl.empty();
		contentEl.createEl("div", {
			text: "Input the tab name or hotkey to switch",
			cls: "search-leaf-item-tips"
		})
		this.currentLeaves.forEach((item, index) => {
			const leaf = (item.item as WorkspaceLeaf);
			const leafEl = contentEl.createDiv({cls: "search-leaf-item"});
			this.buildLeafItem(leafEl, leaf, index < 9 ? index + 1 : index === 9 ? 0 : -1);
		})
	}

	/*
	* Build the leaf item in the modal
	*/
	buildLeafItem(leafEl: HTMLElement, leaf: WorkspaceLeaf, index: number) {
		const leatPathEl = leafEl.createDiv({cls: "search-leaf-item-path"});
		const leafHotkeyEl = leafEl.createDiv({cls: "search-leaf-item-hotkey", text: index > -1 ? (Platform.isMacOS ? "CMD + " : "CTRL + " + index.toString()) : ""});
		if(leaf.view.getViewType() === "markdown") {
			const iconEl = leatPathEl.createDiv({cls: "search-leaf-item-icon"});
			setIcon(iconEl, leaf.view.getIcon());
		} else {
			const iconEl = leaf.tabHeaderInnerIconEl.cloneNode(true) as HTMLElement;
			leatPathEl.appendChild(iconEl);
		}
		leatPathEl.createDiv({text: leaf.tabHeaderEl.innerText , cls: "search-leaf-item-text"});
		this.plugin.registerDomEvent(leafEl, "click", (evt) => {
			this.close();
			app.workspace.setActiveLeaf(leaf);
		});
	}

	/*
	* Register keyboard event to listen for keydown
	* For filtering the list of tabs;
	*/
	registerKeyBoardEvent() {
		this.cb = (evt: KeyboardEvent)=>{
			evt.preventDefault();

			if(/^[0-9]{1}$/.test(evt.key) && (evt.ctrlKey || evt.metaKey)) {
				if(this.currentLeaves?.length > 0) {
					const leaf = this.currentLeaves[parseInt(evt.key) - 1]?.item as WorkspaceLeaf;
					this.close();
					app.workspace.setActiveLeaf(leaf);
				}else if(this.availableLeaves?.length > 0) {
					const leaf = this.availableLeaves[parseInt(evt.key) - 1] as WorkspaceLeaf;
					this.close();
					app.workspace.setActiveLeaf(leaf);
				}
				return;
			}

			if(evt.key === "Enter") {
				if(this.currentLeaves?.length > 0) {
					const leaf = this.currentLeaves[0]?.item as WorkspaceLeaf;
					this.close();
					app.workspace.setActiveLeaf(leaf);
				}
				return;
			}

			if(/^[a-zA-Z0-9-_ ]{1}$/.test(evt.key)) {
				this.keyString += evt.key;
				this.updateCurrentLeaves(this.keyString);
			}
			if((evt.key === "Backspace" || evt.key === "Delete") && this.keyString.length > 0) {
				this.keyString = this.keyString.slice(0 ,-1);
				if(this.keyString === "") {
					this.currentLeaves.splice(0, this.currentLeaves.length);
					this.buildLeavesArray();
					return;
				}
				this.updateCurrentLeaves(this.keyString);
			}
		}
		activeWindow.addEventListener("keydown", this.cb, true);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl?.parentElement?.parentElement?.classList.add("tab-switcher-modal");

		this.registerKeyBoardEvent();
		this.getAvailableLeaves();
		this.buildLeavesArray();
	}

	onClose() {
		const {contentEl} = this;
		this.availableLeaves.splice(0, this.availableLeaves.length);
		this.currentLeaves.splice(0, this.currentLeaves.length);
		this.keyString = "";
		activeWindow.removeEventListener("keydown", this.cb, true);

		contentEl.empty();
	}
}
