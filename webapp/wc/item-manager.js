/* List and editor for one item type, rebuilt from the legacy TaggedItemManager.
 * <app-item-manager type="problem"></app-item-manager>
 * Items load through the simulated API with the shared tag filter, and save automatically or on Save,
 * depending on the profile's save mode.
 */
"use strict"
{
    const AUTOSAVE_DELAY = 1200;
    const viewNames = { editor: 'Editor', both: 'Both', rendered: 'Rendered' };
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    // Items linked to each list entry by tag, shown as a second line: a problem's solutions, a solution's problem, and so on.
    const related = {
        problem: { type: 'solution', describe: (n) => plural(n, 'solution') },
        feature: { type: 'solution', describe: (n) => plural(n, 'solution') },
        project: { type: 'problem', describe: (n) => plural(n, 'open problem') },
        solution: { type: 'problem', parent: true },
    };
    const viewKeys = { Editor: 'editor', Both: 'both', Rendered: 'rendered' };

    webui.define('app-item-manager', {
        preload: 'app:store app:tag-input app:markdown-editor app:sortable-list app:story-publisher button flex paper quote alert tabs input-text switch',
        attr: ['type'],
        constructor() {
            const t = this;
            t._items = [];
            t._current = null;
            t._savedJson = '';
            t._view = 'both';
            t._fieldEditors = {};
            t._unsubs = [];
        },
        connected() {
            const t = this;
            const ts = window.taskStory;
            t._config = ts.types[t.getAttribute('type')];
            if (!t._config) {
                t.innerText = `Unknown item type "${t.getAttribute('type')}".`;
                return;
            }
            t.build();
            // Start on a blank item so anything typed before the first load finishes is kept as a pending change.
            t.newItem(true);
            t.listen();
            t.load();
        },
        reconnected() {
            const t = this;
            if (!t._config) return;
            t.listen();
            t.load();
        },
        disconnected() {
            const t = this;
            t._unsubs.forEach(fn => fn());
            t._unsubs = [];
            clearTimeout(t._autosaveTimer);
        },
        listen() {
            const t = this;
            const ts = window.taskStory;
            t._unsubs.forEach(fn => fn());
            t._unsubs = [
                ts.on('filter', () => t.load()),
                ts.on('session', () => t.load()),
                ts.on('items', detail => {
                    if (detail && detail.source === t) return;
                    const linked = related[t._config.key];
                    if (!detail || !detail.types || detail.types.includes(t._config.key) || (linked && detail.types.includes(linked.type))) t.load();
                }),
            ];
        },
        // Builds the light DOM once, off the page, then inserts it.
        build() {
            const t = this;
            const c = t._config;
            const ts = window.taskStory;
            const frag = document.createDocumentFragment();

            const header = webui.create('webui-flex', { slot: 'header', align: 'center', gap: '2', wrap: '' });
            t._heading = webui.create('h2', { class: 'my-1', text: `Current ${c.plural}` });
            t._filterBtn = webui.create('webui-button', { theme: ts.tags.theme(c.prefix || ''), 'start-icon': 'filter' });
            t._filterBtn.style.display = 'none';
            t._filterBtn.addEventListener('click', () => t.toggleFilter());
            header.appendChild(t._heading);
            header.appendChild(t._filterBtn);
            frag.appendChild(header);

            const listPane = webui.create('webui-paper', { slot: 'list', elevation: '5', class: 'pa-2' });
            const listCol = webui.create('webui-flex', { column: '', gap: '2' });
            if (!c.readOnly) {
                t._addBtn = webui.create('webui-button', { theme: 'primary', 'end-icon': 'plus', text: `Add ${c.label}` });
                t._addBtn.addEventListener('click', () => t.newItem());
                listCol.appendChild(t._addBtn);
            }
            t._list = webui.create('app-sortable-list', { label: `Current ${c.plural}`, empty: c.readOnly ? `No ${c.plural.toLowerCase()} match the tag filter.` : `No ${c.plural.toLowerCase()} match the tag filter yet.` });
            if (c.readOnly) t._list.setAttribute('nosort', '');
            t._list.addEventListener('select', ev => t.select(ev.detail.id));
            t._list.addEventListener('reorder', ev => t.reorder(ev.detail.ids));
            listCol.appendChild(t._list);
            listPane.appendChild(listCol);
            frag.appendChild(listPane);

            const editor = webui.create('webui-paper', { slot: 'editor', elevation: '5', class: 'pa-2' });
            const col = webui.create('webui-flex', { column: '', gap: '2' });
            t._title = webui.create('webui-paper', { class: 'pa-2', elevation: '1', role: 'status' });
            const titleRow = webui.create('webui-flex', { wrap: '', gap: '2', align: 'center' });
            t._titleName = webui.create('strong', {});
            t._titleOwner = webui.create('span', { class: 'f-small' });
            titleRow.appendChild(t._titleName);
            titleRow.appendChild(webui.create('webui-flex', { grow: '' }));
            titleRow.appendChild(t._titleOwner);
            t._title.appendChild(titleRow);
            col.appendChild(t._title);
            if (c.help) col.appendChild(webui.create('webui-quote', { theme: 'info', class: 'pa-2', text: c.help }));
            t._loading = webui.create('div', { text: 'Loading...' });
            col.appendChild(t._loading);

            t._form = webui.create('webui-flex', { column: '', gap: '2' });
            if (!c.readOnly) {
                t._name = webui.create('webui-input-text', { label: 'Name', maxlength: '50', title: `Name of this ${c.label.toLowerCase()}` });
                t._name.addEventListener('input', () => t.nameChanged());
                t._form.appendChild(t._name);
                const row = webui.create('webui-flex', { wrap: '', gap: '2', align: 'flex-start' });
                const prefixLabel = webui.create('label', {});
                Object.assign(prefixLabel.style, { display: 'flex', flexDirection: 'column', fontSize: '0.9em', gap: '0.2em' });
                prefixLabel.appendChild(document.createTextNode('Tag prefix'));
                t._prefix = document.createElement('select');
                // A plain select is tiny next to the other fields, so it gets the field's font and colors.
                Object.assign(t._prefix.style, { font: 'inherit', fontSize: '1rem', color: 'inherit', background: 'var(--color-background)', border: '1px solid currentColor', borderRadius: '4px', padding: '0.2em 0.4em' });
                ts.prefixes.forEach(p => {
                    const o = document.createElement('option');
                    o.value = p.id || '_';
                    o.innerText = p.display;
                    t._prefix.appendChild(o);
                });
                t._prefix.addEventListener('change', () => {
                    const value = t._prefix.value === '_' ? '' : t._prefix.value;
                    if (value) t._tagInput.setAttribute('tag-prefix', value);
                    else t._tagInput.removeAttribute('tag-prefix');
                });
                prefixLabel.appendChild(t._prefix);
                row.appendChild(prefixLabel);
                t._tagInput = webui.create('app-tag-input', { label: 'Tags', helper: 'Type a tag and press Enter' });
                t._tagInput.addEventListener('tag-add', ev => {
                    ev.preventDefault();
                    t.addTag(ev.detail.tag);
                });
                t._tagInput.addEventListener('tag-remove', ev => {
                    ev.preventDefault();
                    t.setTags(t._current.tags.filter(x => x !== ev.detail.tag));
                });
                row.appendChild(t._tagInput);
                t._form.appendChild(row);
            } else {
                t._tagInput = webui.create('app-tag-input', { label: 'Tags', readonly: '' });
                t._form.appendChild(t._tagInput);
            }

            // Two rows with one job each: the actions that keep or remove the item, then how the text is shown and copied.
            const actions = webui.create('webui-flex', { wrap: '', gap: '2', align: 'center' });
            t._deleteBtn = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Delete' });
            t._deleteBtn.addEventListener('click', () => t.deleteItem());
            actions.appendChild(t._deleteBtn);
            actions.appendChild(webui.create('webui-flex', { grow: '' }));
            if (!c.readOnly) {
                t._autoStatus = webui.create('span', { class: 'f-small', role: 'status' });
                actions.appendChild(t._autoStatus);
            }
            if (c.key === 'task') {
                // Marking a task done saves it at once, like ticking a box on a to-do list.
                t._doneBtn = webui.create('webui-button', { theme: 'shade', 'start-icon': 'check', text: 'Mark Done' });
                t._doneBtn.addEventListener('click', () => {
                    t._current.done = !t._current.done;
                    t.save();
                });
                actions.appendChild(t._doneBtn);
            }
            if (c.publish) {
                t._publishBtn = webui.create('webui-button', { theme: 'shade', 'end-icon': 'upload', text: 'Publish' });
                t._publishBtn.addEventListener('click', () => t.publish());
                actions.appendChild(t._publishBtn);
            }
            if (!c.readOnly) {
                t._undoBtn = webui.create('webui-button', { theme: 'warning', 'start-icon': 'undo', text: 'Undo' });
                t._undoBtn.addEventListener('click', () => t.undo());
                actions.appendChild(t._undoBtn);
                t._saveBtn = webui.create('webui-button', { theme: 'primary', 'end-icon': 'save', text: `Save ${c.label}` });
                t._saveBtn.addEventListener('click', () => t.save());
                actions.appendChild(t._saveBtn);
            }
            t._form.appendChild(actions);
            // Save errors show under the Save button.
            t._error = webui.create('webui-alert', { variant: 'danger' });
            t._form.appendChild(t._error);

            const bar = webui.create('webui-flex', { wrap: '', gap: '2', align: 'center' });
            if (!c.readOnly) {
                t._viewSwitch = webui.create('webui-switch', { label: 'View', options: 'Editor|Both|Rendered', value: 'Both', theme: 'secondary' });
                t._viewSwitch.addEventListener('change', () => t.setView(viewKeys[t._viewSwitch.value] || 'both'));
                bar.appendChild(t._viewSwitch);
            }
            bar.appendChild(webui.create('webui-flex', { grow: '' }));
            const copyMd = webui.create('webui-button', { theme: 'shade', 'start-icon': 'code', text: 'Copy Markdown' });
            copyMd.addEventListener('click', () => t.copy(false));
            bar.appendChild(copyMd);
            const copyHtml = webui.create('webui-button', { theme: 'shade', 'start-icon': 'copy', text: 'Copy HTML' });
            copyHtml.addEventListener('click', () => t.copy(true));
            bar.appendChild(copyHtml);
            t._form.appendChild(bar);


            const fields = c.fields;
            if (c.readOnly) {
                fields.forEach(f => {
                    t._form.appendChild(webui.create('h3', { class: 'my-1', text: f.label }));
                    const ed = webui.create('app-markdown-editor', { label: f.label, readonly: '', view: 'rendered', empty: 'None' });
                    t._fieldEditors[f.key] = ed;
                    t._form.appendChild(ed);
                });
            } else if (fields.length === 1) {
                const f = fields[0];
                if (f.prompt) t._form.appendChild(webui.create('webui-quote', { theme: 'info', class: 'pa-2', text: f.prompt }));
                t._form.appendChild(t.fieldEditor(f));
            } else {
                const tabs = webui.create('webui-tabs', { theme: 'shade' });
                fields.forEach(f => {
                    tabs.appendChild(webui.create('webui-button', { slot: 'tabs', text: f.label }));
                    const content = webui.create('webui-flex', { slot: 'content', column: '', gap: '2' });
                    if (f.prompt) content.appendChild(webui.create('webui-quote', { theme: 'info', class: 'pa-2', text: f.prompt }));
                    content.appendChild(t.fieldEditor(f));
                    tabs.appendChild(content);
                });
                t._form.appendChild(tabs);
            }
            col.appendChild(t._form);
            editor.appendChild(col);
            frag.appendChild(editor);
            t.appendChild(frag);
        },
        fieldEditor(field) {
            const t = this;
            const ed = webui.create('app-markdown-editor', { label: field.label, placeholder: 'Supports Markdown' });
            ed.addEventListener('input', () => {
                if (!t._current) return;
                t._current[field.key] = ed.value;
                t.changed();
            });
            t._fieldEditors[field.key] = ed;
            return ed;
        },
        async load() {
            const t = this;
            const ts = window.taskStory;
            const loadId = (t._loadId || 0) + 1;
            t._loadId = loadId;
            t._loading.style.display = '';
            try {
                t._session = await ts.session();
                if (!t._session.profile) return;
                const linked = related[t._config.key];
                const [items, others] = await Promise.all([
                    ts.api.request('POST', 'items/query', { type: t._config.key, tags: ts.filter.get() }),
                    linked ? ts.api.request('POST', 'items/query', { type: linked.type, tags: [] }) : [],
                ]);
                if (loadId !== t._loadId) return;
                t._items = items;
                t._related = others;
                t.renderList();
                const cur = t._current;
                const found = cur && cur.id ? items.find(i => i.id === cur.id) : null;
                if (cur && t.isPending()) {
                    t.renderEditor();
                } else if (found) {
                    t.loadItem(found, t._view);
                } else if (items.length) {
                    t.loadItem(items[0], t.needsContent(items[0]) ? 'both' : 'rendered');
                } else {
                    t.newItem(true);
                }
            } catch (ex) {
                t.showError(ts.message(ex, `Could not load ${t._config.plural.toLowerCase()}.`));
            } finally {
                if (loadId === t._loadId) t._loading.style.display = 'none';
            }
        },
        renderList() {
            const t = this;
            const c = t._config;
            // Stories show when they were published and by whom.
            const ts = window.taskStory;
            const linked = related[c.key];
            const others = t._related || [];
            const ownTag = (item, prefix) => item.tags.find(tag => tag.startsWith(prefix)) || '';
            const detail = i => {
                if (c.readOnly) {
                    return i.created ? `${new Date(i.created).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · ${(i.publishedOwner || '').replace('person:', '')}` : '';
                }
                if (c.key === 'task') return i.done ? 'Done' : '';
                if (!linked) return '';
                const otherPrefix = ts.types[linked.type].prefix;
                if (linked.parent) {
                    // A solution names the problem it belongs to.
                    const names = i.tags.filter(tag => tag.startsWith(otherPrefix))
                        .map(tag => (others.find(o => ownTag(o, otherPrefix) === tag) || {}).name || tag);
                    return names.join(', ');
                }
                const tag = ownTag(i, c.prefix);
                return tag ? linked.describe(others.filter(o => o.tags.includes(tag)).length) : '';
            };
            t._list.items = t._items.map(i => ({ id: i.id, label: i.name, mark: i.done ? 'done' : i.tags.includes('bug') ? 'bug' : '', detail: detail(i) }));
            t._list.selected = t._current && t._current.id ? t._current.id : '';
        },
        snapshot(item) {
            const c = this._config;
            const copy = { id: item.id || '', name: item.name || '', tags: (item.tags || []).slice() };
            c.fields.forEach(f => { copy[f.key] = item[f.key] || ''; });
            if (c.key === 'task') copy.done = !!item.done;
            if (c.readOnly) {
                copy.publishedOwner = item.publishedOwner || '';
                copy.created = item.created;
                copy.updated = item.updated;
            }
            return copy;
        },
        isPending() {
            const t = this;
            if (!t._current || t._config.readOnly) return false;
            return JSON.stringify(t.snapshot(t._current)) !== t._savedJson;
        },
        isNew() {
            return !this._current || !this._current.id;
        },
        needsContent(item) {
            const first = this._config.fields[0];
            return !first || !`${item[first.key] || ''}`.trim();
        },
        loadItem(item, view) {
            const t = this;
            t._current = Object.assign({}, item, { tags: (item.tags || []).slice() });
            t._savedJson = JSON.stringify(t.snapshot(t._current));
            t.setView(view || 'rendered', true);
            t.clearError();
            t.renderEditor(true);
            t._list.selected = item.id;
        },
        async select(id) {
            const t = this;
            if (t._current && t._current.id === id) return;
            const item = t._items.find(i => i.id === id);
            if (!item) return;
            if (t.isPending() && !(await t.confirmDiscard())) {
                t._list.selected = t._current.id || '';
                return;
            }
            t.loadItem(item, t.needsContent(item) ? 'both' : 'rendered');
        },
        async newItem(skipConfirm) {
            const t = this;
            if (t._config.readOnly) {
                t._current = null;
                t._savedJson = '';
                t.renderEditor(true);
                return;
            }
            if (!skipConfirm && t.isPending() && !(await t.confirmDiscard())) return;
            const ts = window.taskStory;
            const blank = { id: '', name: '', tags: ts.filter.get() };
            t._config.fields.forEach(f => { blank[f.key] = ''; });
            t._current = blank;
            t._savedJson = JSON.stringify(t.snapshot(blank));
            t.setView('both', true);
            t.clearError();
            t.renderEditor(true);
            t._list.selected = '';
            if (!skipConfirm) t._name.focus && t._name.focus();
        },
        confirmDiscard() {
            const label = this._config.label.toLowerCase();
            return new Promise(resolve => {
                webui.dialog.confirm(`You have unsaved changes to this ${label}. Discard them?`, () => { resolve(true); }, () => resolve(false));
            });
        },
        renderEditor(fillInputs) {
            const t = this;
            const c = t._config;
            const ts = window.taskStory;
            const item = t._current;
            const isNew = t.isNew();
            const pending = t.isPending();
            t._form.style.display = (!item) ? 'none' : '';
            if (!item) {
                t._title.removeAttribute('theme');
                t._titleName.innerText = `${c.label}: No ${c.plural} Loaded`;
                t._titleOwner.innerText = '';
                t._filterBtn.style.display = 'none';
                return;
            }
            if (fillInputs) {
                if (t._name) t._name.value = item.name;
                c.fields.forEach(f => { t._fieldEditors[f.key].value = item[f.key] || ''; });
            }
            t._tagInput.tags = item.tags;
            const me = t._session && t._session.profile ? ts.personTag(t._session.profile) : '';
            if (c.readOnly) {
                t._titleName.innerText = `${c.label}: ${item.name}`;
                t._titleOwner.innerText = `Published by ${(item.publishedOwner || '').replace('person:', '')}`;
            } else {
                const name = item.name || (isNew ? `New ${c.label}` : 'Missing Name');
                const owner = c.shared ? `Owner: ${(ts.tags.owner(item.tags) || me).replace('person:', '')}` : 'Private to you';
                t._titleName.innerText = `${c.label}: ${name}${!isNew && pending ? ' (Changes Pending Save)' : ''}`;
                t._titleOwner.innerText = owner;
            }
            // Plain while saved, and marked while there is something to save.
            if (!c.readOnly && (isNew || pending)) t._title.setAttribute('theme', 'warning');
            else t._title.removeAttribute('theme');
            const ownTag = c.prefix && item.name ? ts.tags.fromName(item.name, c.prefix) : '';
            t._filterBtn.style.display = (!(c.shared && ownTag && !isNew)) ? 'none' : '';
            if (ownTag) {
                const on = ts.filter.has(ownTag);
                t._filterBtn.setAttribute('label', on ? `Stop filtering by ${ownTag}` : `Filter by ${ownTag}`);
                t._filterBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            if (t._undoBtn) t._undoBtn.style.display = (!pending) ? 'none' : '';
            t._deleteBtn.style.display = (isNew) ? 'none' : '';
            if (t._publishBtn) t._publishBtn.style.display = (isNew) ? 'none' : '';
            if (t._doneBtn) {
                t._doneBtn.style.display = (isNew) ? 'none' : '';
                t._doneBtn.setAttribute('label', item.done ? 'Mark Not Done' : 'Mark Done');
                t._doneBtn.setAttribute('aria-pressed', item.done ? 'true' : 'false');
                t._doneBtn.setAttribute('theme', item.done ? 'success' : 'shade');
            }
            const auto = t.saveMode() === 'auto';
            if (t._saveBtn) {
                t._saveBtn.style.display = (auto && !isNew) ? 'none' : '';
                t._saveBtn.setAttribute('theme', isNew || pending ? 'primary' : 'shade');
            }
        },
        saveMode() {
            const s = this._session;
            return s && s.profile && s.profile.saveMode === 'auto' ? 'auto' : 'explicit';
        },
        setView(view, quiet) {
            const t = this;
            t._view = view;
            if (t._viewSwitch && quiet) t._viewSwitch.value = viewNames[view];
            Object.values(t._fieldEditors).forEach(ed => {
                if (!ed.hasAttribute('readonly')) ed.setAttribute('view', view);
            });
        },
        nameChanged() {
            const t = this;
            if (!t._current) return;
            const c = t._config;
            const ts = window.taskStory;
            t._current.name = t._name.value;
            if (c.prefix) {
                const tag = ts.tags.fromName(t._current.name.trim(), c.prefix);
                const others = t._current.tags.filter(x => !x.startsWith(c.prefix));
                t._current.tags = tag ? [tag, ...others] : others;
            }
            t.changed();
        },
        addTag(tag) {
            const t = this;
            const ts = window.taskStory;
            const c = t._config;
            let list = t._current.tags.filter(x => x !== tag);
            list.push(tag);
            const prefix = ts.tags.prefixOf(tag);
            if (prefix && (prefix === c.prefix || (c.shared && prefix === 'person:'))) {
                list = ts.tags.limitPrefix(list, prefix, tag);
            }
            t.setTags(list);
        },
        setTags(list) {
            const t = this;
            t._current.tags = list;
            t.changed();
        },
        changed() {
            const t = this;
            t.clearError();
            t.renderEditor();
            if (t._autoStatus) t._autoStatus.innerText = '';
            clearTimeout(t._autosaveTimer);
            if (t.saveMode() === 'auto' && t.isPending()) {
                t._autosaveTimer = setTimeout(() => t.save(true), AUTOSAVE_DELAY);
            }
        },
        async save(isAuto) {
            const t = this;
            const ts = window.taskStory;
            const c = t._config;
            clearTimeout(t._autosaveTimer);
            if (!t._current || c.readOnly) return;
            if (t._saving) {
                t._saveAgain = true;
                return;
            }
            const sent = t.snapshot(t._current);
            const sentJson = JSON.stringify(sent);
            t._saving = true;
            if (t._autoStatus && isAuto) t._autoStatus.innerText = 'Saving...';
            try {
                const saved = await ts.api.request('POST', `items/${c.key}`, sent);
                const stillSame = JSON.stringify(t.snapshot(t._current)) === sentJson;
                const index = t._items.findIndex(i => i.id === saved.id);
                if (index === -1) t._items.push(saved);
                else t._items[index] = saved;
                t._items.sort((a, b) => a.sortId - b.sortId);
                if (stillSame || t._current.id === sent.id) {
                    // Keep edits typed while saving, but take the id and the tags the API settled on.
                    const working = stillSame ? saved : Object.assign({}, t._current, { id: saved.id });
                    t._current = Object.assign({}, working, { tags: (stillSame ? saved.tags : t._current.tags).slice() });
                    t._savedJson = JSON.stringify(t.snapshot(saved));
                }
                t.renderList();
                t.renderEditor(stillSame);
                if (t._autoStatus) t._autoStatus.innerText = isAuto ? 'Saved' : '';
                if (!isAuto) webui.alert(webui.escapeHtml(`Saved ${saved.name}.`), 'success');
                ts.emit('items', { types: [c.key], source: t });
            } catch (ex) {
                if (t._autoStatus) t._autoStatus.innerText = '';
                t.showError(ts.message(ex, `An unknown error occurred saving this ${c.label.toLowerCase()}.`));
            } finally {
                t._saving = false;
                if (t._saveAgain) {
                    t._saveAgain = false;
                    if (t.isPending()) t.save(isAuto);
                }
            }
        },
        undo() {
            const t = this;
            if (!t._current) return;
            const saved = t._current.id ? t._items.find(i => i.id === t._current.id) : null;
            if (saved) t.loadItem(saved, t._view);
            else t.newItem(true);
        },
        deleteItem() {
            const t = this;
            const ts = window.taskStory;
            const c = t._config;
            if (!t._current || t.isNew()) return;
            const item = t._current;
            webui.dialog.confirm(webui.escapeHtml(`Delete the ${c.label.toLowerCase()} "${item.name}"? This cannot be undone.`), async () => {
                try {
                    await ts.api.request('DELETE', `items/${c.key}/${item.id}`);
                    t._items = t._items.filter(i => i.id !== item.id);
                    t._current = null;
                    t.renderList();
                    if (t._items.length) t.loadItem(t._items[0], 'rendered');
                    else t.newItem(true);
                    webui.alert(webui.escapeHtml(`Deleted ${item.name}.`), 'success');
                    ts.emit('items', { types: [c.key], source: t });
                } catch (ex) {
                    t.showError(ts.message(ex, `An unknown error occurred deleting this ${c.label.toLowerCase()}.`));
                }
            });
        },
        async reorder(ids) {
            const t = this;
            const ts = window.taskStory;
            const order = new Map(ids.map((id, i) => [id, i]));
            t._items.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 9999) - (order.has(b.id) ? order.get(b.id) : 9999));
            t._items.forEach((item, i) => { item.sortId = i + 1; });
            try {
                await ts.api.request('POST', `items/${t._config.key}/sort`, { ids: t._items.map(i => i.id) });
            } catch (ex) {
                t.showError(ts.message(ex, 'Could not save the new order.'));
            }
        },
        toggleFilter() {
            const t = this;
            const ts = window.taskStory;
            if (!t._current || !t._current.name) return;
            ts.filter.toggle(ts.tags.fromName(t._current.name, t._config.prefix));
        },
        async copy(asHtml) {
            const t = this;
            const ts = window.taskStory;
            if (!t._current) return;
            const md = ts.toMarkdown(t._config.key, t._current);
            await webui.copyToClipboard(asHtml ? ts.renderMarkdown(md) : md);
            webui.alert(webui.escapeHtml(`${asHtml ? 'HTML' : 'Markdown'} for ${t._current.name || `this ${t._config.label.toLowerCase()}`} copied to clipboard.`), 'info');
        },
        async publish() {
            const t = this;
            if (!t._current || t.isNew()) return;
            if (t.isPending()) {
                t.showError('Save your changes to this problem before publishing it.');
                return;
            }
            const publisher = document.createElement('app-story-publisher');
            publisher.setAttribute('problem-id', t._current.id);
            webui.dialog({
                title: 'Story Publisher',
                content: publisher,
                confirm: 'Publish',
                cancel: 'Cancel',
                minWidth: '80%',
                onconfirm: async () => publisher.publish(),
            }).catch(() => { });
        },
        showError(message) {
            const t = this;
            t._error.innerText = message;
            t._error.setAttribute('show', '');
        },
        clearError() {
            const t = this;
            if (!t._error.hasAttribute('show')) return;
            t._error.removeAttribute('show');
            t._error.innerText = '';
        },
        shadowTemplate: `
<slot name="header"></slot>
<div class="body">
<slot name="list"></slot>
<slot name="editor"></slot>
</div>
<style type="text/css">
:host {
display:flex;
flex-direction:column;
gap:var(--padding);
margin-bottom:calc(var(--padding) * 2);
}
.body {
display:grid;
grid-template-columns:minmax(180px, 280px) minmax(0, 1fr);
gap:var(--padding);
align-items:start;
}
@media (max-width: 900px) {
.body {
grid-template-columns:minmax(0, 1fr);
}
}
</style>
`
    });
}
