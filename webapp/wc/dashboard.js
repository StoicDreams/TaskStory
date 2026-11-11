/* Dashboard, rebuilt from the legacy Account/Dashboard page: the tag filter, toggles for which managers to show,
 * and the chosen managers. The toggles are kept in session data and all start off, as they did before.
 */
"use strict"
{
    const TOGGLE_KEY = 'session-ts-dashboard';
    const toggles = [
        { key: 'task', label: 'Tasks' },
        { key: 'solution', label: 'Solutions' },
        { key: 'problem', label: 'Problems' },
        { key: 'feature', label: 'Features' },
        { key: 'project', label: 'Projects' },
        { key: 'markdown', label: 'Markdown' },
    ];
    webui.define('app-dashboard', {
        preload: 'app:store app:tag-filter app:item-manager button flex paper quote content',
        connected() {
            const t = this;
            const frag = document.createDocumentFragment();
            frag.appendChild(webui.create('app-tag-filter'));
            const bar = webui.create('webui-paper', { elevation: '5', class: 'pa-2 mb-3' });
            const row = webui.create('webui-flex', { wrap: '', gap: '2', align: 'center', justify: 'center' });
            row.appendChild(webui.create('span', { text: 'Manager Toggles:', title: 'Use these buttons to show and hide the labeled sections' }));
            t._buttons = {};
            toggles.forEach(tg => {
                const btn = webui.create('webui-button', { text: tg.label });
                btn.addEventListener('click', () => t.toggle(tg.key));
                t._buttons[tg.key] = btn;
                row.appendChild(btn);
            });
            bar.appendChild(row);
            frag.appendChild(bar);
            t._welcome = webui.create('webui-quote', { theme: 'primary', class: 'pa-2', text: 'Welcome to your dashboard. Use the buttons above to choose which sections to show here.' });
            frag.appendChild(t._welcome);
            t._sections = webui.create('div');
            frag.appendChild(t._sections);
            t.appendChild(frag);
            t._shown = {};
            t.render();
        },
        state() {
            const value = webui.getData(TOGGLE_KEY);
            return value && typeof value === 'object' ? Object.assign({}, value) : {};
        },
        toggle(key) {
            const state = this.state();
            state[key] = !state[key];
            webui.setData(TOGGLE_KEY, state);
            this.render();
        },
        render() {
            const t = this;
            const state = t.state();
            toggles.forEach(tg => {
                const on = !!state[tg.key];
                t._buttons[tg.key].setAttribute('theme', on ? 'success' : 'shade');
                t._buttons[tg.key].setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            t._welcome.style.display = (toggles.some(tg => state[tg.key])) ? 'none' : '';
            // Keep managers that stay shown, so their unsaved edits survive toggling others.
            toggles.forEach(tg => {
                const on = !!state[tg.key];
                if (on && !t._shown[tg.key]) {
                    t._shown[tg.key] = tg.key === 'markdown'
                        ? webui.create('webui-content', { src: '/d/help/markdown-guide.md', cache: '' })
                        : webui.create('app-item-manager', { type: tg.key });
                } else if (!on && t._shown[tg.key]) {
                    t._shown[tg.key].remove();
                    delete t._shown[tg.key];
                }
            });
            const ordered = toggles.map(tg => t._shown[tg.key]).filter(Boolean);
            const current = Array.from(t._sections.children);
            if (ordered.length !== current.length || ordered.some((el, i) => el !== current[i])) {
                const frag = document.createDocumentFragment();
                ordered.forEach(el => frag.appendChild(el));
                t._sections.appendChild(frag);
            }
        }
    });
}
