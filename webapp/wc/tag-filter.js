/* Dashboard tag filter, rebuilt from the legacy TagFilterDisplay.
 * Every item manager on the page shows only items that have all the filter's tags.
 * Adding a prefixed tag (problem:, project:, ...) replaces any filter tag with the same prefix.
 * Quick filters list matching tags from the current items as toggle buttons. Team and Project list all their tags when empty.
 * The filter is one line; the quick filter boxes open with "More filters".
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
            // One line: the filter's own tags, the quick tag toggles, Bug and Blocked. The quick filter boxes wait behind "More filters".
            const bar = webui.create('webui-flex', { class: 'pa-2', align: 'center', wrap: '', gap: '2' });
            const title = webui.create('h2', { class: 'my-0', text: 'Filter' });
            title.style.fontSize = '1.25em';
            bar.appendChild(title);
            t._input = webui.create('app-tag-input', { placeholder: 'Filter by tag, then press Enter' });
            t._input.addEventListener('tag-add', ev => {
                ev.preventDefault();
                ts.filter.add(ev.detail.tag);
            });
            t._input.addEventListener('tag-remove', ev => {
                ev.preventDefault();
                ts.filter.remove(ev.detail.tag);
            });
            bar.appendChild(t._input);
            t._toggles = webui.create('webui-flex', { wrap: '', gap: '1', align: 'center', grow: '', role: 'group', 'aria-label': 'Quick tag toggles' });
            bar.appendChild(t._toggles);
            t._bug = webui.create('webui-button', { 'start-icon': 'bug', text: 'Bug' });
            t._bug.addEventListener('click', () => ts.filter.toggle('bug'));
            t._blocked = webui.create('webui-button', { 'start-icon': 'stop', text: 'Blocked' });
            t._blocked.addEventListener('click', () => ts.filter.toggle('blocked'));
            bar.appendChild(t._bug);
            bar.appendChild(t._blocked);
            t._moreButton = webui.create('webui-button', { theme: 'shade', 'start-icon': 'sliders', text: 'More filters', 'aria-controls': `tag-filter-more-${webui.uuid()}` });
            t._moreButton.addEventListener('click', () => t.showMore(!t._moreOpen));
            bar.appendChild(t._moreButton);
            paper.appendChild(bar);

            t._more = webui.create('webui-flex', { id: t._moreButton.getAttribute('aria-controls'), column: '', gap: '1', class: 'pa-2' });
            t._more.appendChild(webui.create('span', { class: 'f-small', text: 'Quick filters choose which tags show as toggles. Team and Project show all their tags when empty.' }));
            const quickRow = webui.create('webui-flex', { wrap: '', gap: '2', align: 'flex-end' });
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
            t._more.appendChild(quickRow);
            paper.appendChild(t._more);
            // Open when a quick filter is already in use, so its effect is explained.
            t.showMore(Object.values(quick).some(Boolean));
            frag.appendChild(paper);
            t.appendChild(frag);
            t.render();
        },
        showMore(open) {
            const t = this;
            // webui-flex sets its own display, so the hidden attribute would not hide it.
            t._moreOpen = !!open;
            t._more.style.display = open ? '' : 'none';
            t._moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
            t._moreButton.setAttribute('theme', open ? 'info' : 'shade');
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
            t._toggles.replaceChildren(frag);
        }
    });
}
