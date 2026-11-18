/* Wraps every signed-in page. Guests see a sign-in prompt, signed-in visitors without a local profile create one,
 * and everyone else sees a strip with their profile and team, then the page itself.
 * <app-workspace view="dashboard|manager|account|subscription" type="problem"></app-workspace>
 * Sign-in is real (MyFi). Profiles stand in for MyFi accounts during the POC.
 */
"use strict"
{
    // Each manager's help page, named as in the menu: /d/content/help/{name}-guide.md.
    const guideNames = { project: 'Projects', feature: 'Features', problem: 'Problems', solution: 'Solutions', task: 'Tasks', story: 'Stories' };
    webui.define('app-workspace', {
        preload: 'app:store button flex paper quote input-text page-help tabs content',
        attr: ['view', 'type'],
        constructor() {
            this._unsubs = [];
        },
        connected() {
            const t = this;
            t.addDataset('subscribe', 'session-user-role:render');
            t.listen();
            t.render();
        },
        reconnected() {
            this.listen();
        },
        disconnected() {
            this._unsubs.forEach(fn => fn());
            this._unsubs = [];
        },
        listen() {
            const t = this;
            t._unsubs.forEach(fn => fn());
            t._unsubs = [window.taskStory.on('session', () => t.render())];
        },
        async render() {
            const t = this;
            const ts = window.taskStory;
            if (!webui.isSignedIn) {
                t.show('guest', () => t.guest());
                return;
            }
            let session;
            try {
                session = await ts.session();
            } catch (ex) {
                t.show(`error`, () => t.problem(ts.message(ex, 'Could not open the local database.')));
                return;
            }
            if (!webui.isSignedIn) return;
            if (!session.profile) {
                t.show('setup', () => t.setup());
                return;
            }
            t.renderStrip(session);
            t.show('ready', () => t.ready());
        },
        // Replaces the content only when the state changes, so pages keep their unsaved edits.
        show(state, build) {
            const t = this;
            if (t._state === state) return;
            t._state = state;
            const frag = document.createDocumentFragment();
            build().forEach(el => frag.appendChild(el));
            t.replaceChildren(frag);
        },
        guest() {
            const quote = webui.create('webui-quote', { theme: 'info', class: 'pa-3' });
            quote.appendChild(webui.create('p', { text: 'Sign in with your Stoic Dreams account to use Task Story.' }));
            const btn = webui.create('webui-button', { theme: 'primary', 'start-icon': 'user', text: 'Sign In' });
            btn.addEventListener('click', () => {
                const info = document.querySelector('webui-myfi-info');
                if (info) info.click();
            });
            quote.appendChild(btn);
            return [quote];
        },
        problem(message) {
            return [webui.create('webui-alert', { variant: 'danger', show: '', text: message })];
        },
        setup() {
            const ts = window.taskStory;
            const paper = webui.create('webui-paper', { elevation: '5', class: 'pa-3' });
            const col = webui.create('webui-flex', { column: '', gap: '2' });
            col.appendChild(webui.create('h2', { class: 'my-0', text: 'Create your profile' }));
            col.appendChild(webui.create('p', { text: 'During this preview, Task Story keeps your data in this browser. Choose the name your teammates will see. It also becomes your owner tag, such as person:yourname.' }));
            const name = webui.create('webui-input-text', { label: 'Display name', maxlength: '50' });
            const error = webui.create('webui-alert', { variant: 'danger' });
            const create = webui.create('webui-button', { theme: 'primary', text: 'Create Profile' });
            const submit = async () => {
                try {
                    await ts.api.request('POST', 'profiles', { name: name.value });
                    await ts.sessionChanged();
                } catch (ex) {
                    error.innerText = ts.message(ex);
                    error.setAttribute('show', '');
                }
            };
            create.addEventListener('click', submit);
            name.addEventListener('keydown', ev => { if (ev.key === 'Enter') submit(); });
            col.appendChild(name);
            col.appendChild(create);
            col.appendChild(error);
            paper.appendChild(col);
            return [paper];
        },
        ready() {
            const t = this;
            const view = t.getAttribute('view');
            const els = [t._strip];
            if (view === 'dashboard') {
                els.push(webui.create('app-dashboard'));
            } else if (view === 'account') {
                els.push(webui.create('app-account'));
            } else if (view === 'subscription') {
                els.push(webui.create('app-subscription'));
            } else if (view === 'manager') {
                els.push(webui.create('app-tag-filter'));
                els.push(webui.create('app-item-manager', { type: t.getAttribute('type') }));
            }
            const help = t.helpBubble(view, t.getAttribute('type'));
            if (help) els.push(help);
            return els;
        },
        // The page's guides in a Help bubble, out of the way until wanted. Pages with more than one guide get a tab each.
        helpBubble(view, type) {
            const guides = [];
            if (view === 'dashboard') guides.push({ label: 'Dashboard', file: 'dashboard' });
            if (view === 'manager' && guideNames[type]) guides.push({ label: guideNames[type], file: guideNames[type].toLowerCase() });
            // Stories are read only, so their page has nothing to write.
            if (view === 'dashboard' || (view === 'manager' && type !== 'story')) guides.push({ label: 'Markdown', file: 'markdown' });
            if (!guides.length) return null;
            const help = webui.create('webui-page-help', { heading: 'Help', 'storage-key': 'taskstory-help' });
            const guide = g => webui.create('webui-content', { src: `/d/content/help/${g.file}-guide.md`, cache: '', nodetach: '', preload: '' });
            if (guides.length === 1) {
                help.appendChild(guide(guides[0]));
                return help;
            }
            const tabs = webui.create('webui-tabs', { theme: 'info' });
            guides.forEach(g => {
                tabs.appendChild(webui.create('webui-button', { slot: 'tabs', text: g.label }));
                const content = guide(g);
                content.setAttribute('slot', 'content');
                tabs.appendChild(content);
            });
            help.appendChild(tabs);
            return help;
        },
        renderStrip(session) {
            const t = this;
            if (!t._strip) {
                t._strip = webui.create('webui-flex', { class: 'mb-2', gap: '2', align: 'center', wrap: '', justify: 'flex-end' });
                t._stripText = webui.create('span', { class: 'f-small' });
                t._strip.appendChild(t._stripText);
                const link = webui.create('a', { href: '/account', class: 'f-small', text: 'Profile and teams' });
                link.style.marginLeft = '0.75em';
                t._strip.appendChild(link);
            }
            const team = session.team ? `Team: ${session.team.name}${session.team.active ? '' : ' (subscription not active, read only)'}` : 'Personal space (no team)';
            t._stripText.innerText = `Signed in as ${session.profile.name} · ${team}`;
        }
    });
}
