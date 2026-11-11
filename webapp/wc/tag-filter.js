/* Dashboard tag filter, rebuilt from the legacy TagFilterDisplay.
 * Every item manager on the page shows only items that have all the filter's tags.
 * Adding a prefixed tag (problem:, project:, ...) replaces any filter tag with the same prefix.
 * Quick filters list matching tags from the current items as toggle buttons. Team and Project list all their tags when empty.
 */
"use strict"
{
    const quickFilters = [
        { key: 'team', label: 'Team', prefix: 'team:', allWhenEmpty: true },
        { key: 'project', label: 'Project', prefix: 'project:', allWhenEmpty: true },
        { key: 'problem', label: 'Problem', prefix: 'problem:' },
        { key: 'solution', label: 'Solution', prefix: 'solution:' },
        { key: 'feature', label: 'Feature', prefix: 'feature:' },
        { key: 'people', label: 'People', prefix: 'person:' },
    ];
    webui.define('app-tag-filter', {
        preload: 'app:store app:tag-input button flex paper input-text',
        constructor() {
            const t = this;
            t._known = [];
            t._unsubs = [];
        },
        connected() {
            const t = this;
            t.build();
            t.listen();
            t.refresh();
        },
        reconnected() {
            this.listen();
            this.refresh();
        },
        disconnected() {
            this._unsubs.forEach(fn => fn());
            this._unsubs = [];
        },
        listen() {
            const t = this;
            const ts = window.taskStory;
            t._unsubs.forEach(fn => fn());
            t._unsubs = [
                ts.on('filter', () => t.render()),
                ts.on('items', () => t.refresh()),
                ts.on('session', () => t.refresh()),
            ];
        },
        build() {
            const t = this;
            const ts = window.taskStory;
            const frag = document.createDocumentFragment();
            const paper = webui.create('webui-paper', { elevation: '5', class: 'mb-3' });
            const head = webui.create('webui-flex', { theme: 'info', class: 'pa-2', align: 'center', wrap: '', gap: '2' });
            head.appendChild(webui.create('h2', { class: 'my-0', text: 'Tag Filters' }));
            head.appendChild(webui.create('webui-flex', { grow: '' }));
            head.appendChild(webui.create('span', { text: 'Bug / Blocked Toggles:' }));
            t._bug = webui.create('webui-button', { 'start-icon': 'bug', text: 'Bug' });
            t._bug.addEventListener('click', () => ts.filter.toggle('bug'));
            t._blocked = webui.create('webui-button', { 'start-icon': 'stop', text: 'Blocked' });
            t._blocked.addEventListener('click', () => ts.filter.toggle('blocked'));
            head.appendChild(t._bug);
            head.appendChild(t._blocked);
            paper.appendChild(head);

            const body = webui.create('webui-flex', { column: '', gap: '2', class: 'pa-2' });
            t._input = webui.create('app-tag-input', { label: 'Custom Tags', helper: 'Type in name of tag and press enter to add' });
            t._input.addEventListener('tag-add', ev => {
                ev.preventDefault();
                ts.filter.add(ev.detail.tag);
            });
            t._input.addEventListener('tag-remove', ev => {
                ev.preventDefault();
                ts.filter.remove(ev.detail.tag);
            });
            body.appendChild(t._input);

            const quickRow = webui.create('webui-flex', { wrap: '', gap: '2', align: 'flex-end' });
            quickRow.appendChild(webui.create('span', { class: 'f-small', text: 'Quick Filters show matching tags as toggles below. Team and Project show all their tags when empty.' }));
            const quick = ts.filter.quick();
            t._quickInputs = {};
            quickFilters.forEach(q => {
                const input = webui.create('webui-input-text', { label: `${q.label} Quick Filter`, maxlength: '30' });
                input.style.maxWidth = '180px';
                input.value = quick[q.key] || '';
                input.addEventListener('input', () => {
                    ts.filter.setQuick(q.key, input.value);
                    t.renderQuick();
                });
                t._quickInputs[q.key] = input;
                quickRow.appendChild(input);
            });
            body.appendChild(quickRow);

            const toggleRow = webui.create('webui-flex', { wrap: '', gap: '1', align: 'center' });
            toggleRow.appendChild(webui.create('span', { text: 'Quick Tag Toggles:' }));
            t._toggles = webui.create('webui-flex', { wrap: '', gap: '1', align: 'center' });
            toggleRow.appendChild(t._toggles);
            body.appendChild(toggleRow);
            paper.appendChild(body);
            frag.appendChild(paper);
            t.appendChild(frag);
            t.render();
        },
        async refresh() {
            const t = this;
            const ts = window.taskStory;
            try {
                const session = await ts.session();
                if (!session.profile) return;
                t._known = await ts.api.request('GET', 'tags');
                t.renderQuick();
            } catch (ex) {
                webui.log.warn('Could not load tags', ex);
            }
        },
        render() {
            const t = this;
            const ts = window.taskStory;
            t._input.tags = ts.filter.get();
            [[t._bug, 'bug'], [t._blocked, 'blocked']].forEach(([btn, tag]) => {
                const on = ts.filter.has(tag);
                btn.setAttribute('theme', on ? 'danger' : 'shade');
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            t.renderQuick();
        },
        renderQuick() {
            const t = this;
            const ts = window.taskStory;
            const quick = ts.filter.quick();
            const list = [];
            quickFilters.forEach(q => {
                const text = (quick[q.key] || '').toLowerCase();
                if (!text && !q.allWhenEmpty) return;
                t._known.filter(tag => tag.startsWith(q.prefix) && (!text || tag.includes(text))).forEach(tag => list.push(tag));
            });
            const frag = document.createDocumentFragment();
            list.forEach(tag => {
                const on = ts.filter.has(tag);
                const btn = webui.create('webui-button', { theme: ts.tags.theme(tag), text: tag, 'aria-pressed': on ? 'true' : 'false' });
                if (on) btn.setAttribute('start-icon', 'check');
                btn.addEventListener('click', () => ts.filter.toggle(tag));
                frag.appendChild(btn);
            });
            if (!list.length) frag.appendChild(webui.create('span', { class: 'f-small', text: 'None' }));
            t._toggles.replaceChildren(frag);
        }
    });
}
