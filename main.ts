import { Editor, Plugin, TFile } from 'obsidian';

declare const CodeMirror: any;

export default class VimMultibyteCharSearchPlugin extends Plugin {
	private code_mirror_vim_object: any = null;
	private initialized = false;
	private complex_char_2_simple_char_mapping: ComplexChar2SimpleCharMapping = null;

	async initialize() {
		if (this.initialized)
			return;

		// Determine if we have the legacy Obsidian editor (CM5) or the new one (CM6).
		// This is only available after Obsidian is fully loaded, so we do it as part of the `file-open` event.
		if ('editor:toggle-source' in (this.app as any).commands.editorCommands) {
			this.code_mirror_vim_object = (window as any).CodeMirrorAdapter?.Vim;
			console.log('Vimrc plugin: using CodeMirror 6 mode');
		} else {
			this.code_mirror_vim_object = CodeMirror.Vim;
			console.log('Vimrc plugin: using CodeMirror 5 mode');
		}

		this.initialized = true;
	}

	async onload() {
		this.app.workspace.on('file-open', async (file: TFile) => {
			if (!this.initialized)
				await this.initialize();
		});

		const dict_content = await this.app.vault.adapter.read(".obsidian/plugins/obsidian-vimrc-support/pinyin_search.dict.txt")
		this.complex_char_2_simple_char_mapping = new ComplexChar2SimpleCharMapping(dict_content);

		this.addCommand({
			id: 'enrich-current-vim-search-pattern',
			name: 'Enrich Current VIM Search Pattern',
			editorCallback: (editor: Editor) => {
				const vim_global_state = this.code_mirror_vim_object.getVimGlobalState_();
				const vim_search_pattern = vim_global_state.query;
				if(vim_search_pattern == null)
				{
					return;
				}
				const enriched_pattern = this.complex_char_2_simple_char_mapping.gen_enriched_pattern(
					vim_search_pattern.source,
					editor.getValue()
				);
				vim_global_state.query = enriched_pattern;
			}

		})

		console.log("VimMultibyteCharSearchPlugin load successfully.")
	}

	onunload() {

	}

}

class ComplexChar2SimpleCharMapping {
	_dict: Map<string, string>;

	constructor(dict_content: string)
	{
		this._dict = new Map();		
		dict_content.split("\n").forEach(
			(line: string, index: number) => {
				line = line.trim();
				if(line != "")
				{
					const fields = line.split(' ');
					console.assert(fields.length == 2,
						`Dictionary line ${index+1} "${line}" doesn't have 2 fields.`);
					const complex_char = fields[0];
					const simple_chars = fields[1];
					this._dict.set(complex_char, simple_chars);
				}
			}
		)
	}

	find_next(query: string, content: string, content_idx: number)
	{
		let query_idx = 0;
		for(; content_idx<content.length; content_idx++)
		{
			const c = content[content_idx];
			let simple_chars = this._dict.get(c);
			if(simple_chars == null)
			{
				simple_chars = c;
			}
			if(simple_chars.indexOf(query[query_idx]) != -1)
			{
				query_idx += 1;
			} else if(simple_chars.indexOf(query[0]) != -1)
			{
				query_idx = 1;
			} else {
				query_idx = 0;
			}

			if(query_idx == query.length)
			{
				break;
			}
		}

		if(query_idx == query.length)
		{
			return content_idx - query.length + 1;
		} else {
			return -1;
		}
	}

	gen_match_list(query: string, content: string): string[]
	{
		if(query.length == 0)
		{
			return [];
		}
		let start_idx = 0;
		let matched_idx = 0;
		const match_list = [];
		while(matched_idx != -1)
		{
			matched_idx = this.find_next(query, content, start_idx);
			if(matched_idx != -1)
			{
				const word = content.slice(matched_idx, matched_idx + query.length);
				match_list.push(word);
				start_idx = matched_idx + 1;
			} 
		}
		return match_list;
	}

	gen_enriched_pattern(query:string, content: string)
	{
		const match_list = this.gen_match_list(query, content);
		const pattern = new RegExp(match_list.join("|"), "im");
		return pattern;
	}

}