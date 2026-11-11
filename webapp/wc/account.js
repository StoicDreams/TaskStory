/* Profile and team settings for the POC, in place of the legacy account panel.
 * Profiles stand in for MyFi accounts, so several can be created and switched between to test sharing in one browser.
 * Teams come from Team subscriptions (see app-subscription): a profile whose email matches a seat is a member.
 */
"use strict"
{
    webui.define('app-account', {
        preload: 'app:store button flex paper quote input-text switch alert',
        constructor() {
            this._unsubs = [];
        },
        connected() {
            const t = this;
            t.listen();
            t.render();
        },
        reconnected() {
            this.listen();
            this.render();
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
        async act(handler, success) {
            const ts = window.taskStory;
            try {
                await handler();
                await ts.sessionChanged();
                if (success) webui.alert(webui.escapeHtml(success), 'success');
            } catch (ex) {
                webui.alert(webui.escapeHtml(ts.message(ex)), 'danger');
            }
        },
        section(title, note) {
            const paper = webui.create('webui-paper', { elevation: '5', class: 'pa-3 mb-3' });
            const col = webui.create('webui-flex', { column: '', gap: '2' });
            col.appendChild(webui.create('h2', { class: 'my-0', text: title }));
            if (note) col.appendChild(webui.create('p', { class: 'f-small', text: note }));
            paper.appendChild(col);
            return [paper, col];
        },
        async render() {
            const t = this;
            const ts = window.taskStory;
            let session, profiles, teams;
            try {
                session = await ts.session();
                if (!session.profile) return;
                [profiles, teams] = await Promise.all([ts.api.request('GET', 'profiles'), ts.api.request('GET', 'teams')]);
            } catch (ex) {
                t.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: ts.message(ex) }));
                return;
            }
            const me = session.profile;
            const frag = document.createDocumentFragment();

            // My profile
            const [mine, mineCol] = t.section('My Profile', `Your owner tag is ${ts.personTag(me)}.`);
            const nameRow = webui.create('webui-flex', { gap: '2', align: 'flex-end', wrap: '' });
            const name = webui.create('webui-input-text', { label: 'Display name', maxlength: '50' });
            name.value = me.name;
            const email = webui.create('webui-input-text', { label: 'Email', maxlength: '300', helper: 'Stands in for your Stoic Dreams account email. Team seats are matched by email.' });
            email.value = me.email || '';
            const rename = webui.create('webui-button', { theme: 'primary', text: 'Save Profile' });
            rename.addEventListener('click', () => t.act(() => ts.api.request('POST', 'profiles', { id: me.id, name: name.value, email: email.value }), 'Profile saved.'));
            nameRow.appendChild(name);
            nameRow.appendChild(email);
            nameRow.appendChild(rename);
            mineCol.appendChild(nameRow);
            mineCol.appendChild(webui.create('p', { class: 'f-small', text: 'Changing your name changes the owner tag on items you save from now on. Items you already own keep the old tag.' }));
            const saveRow = webui.create('webui-flex', { gap: '2', align: 'center', wrap: '' });
            saveRow.appendChild(webui.create('span', { text: 'Saving:' }));
            const saveMode = webui.create('webui-switch', { label: 'Saving', options: 'Save explicitly|Save automatically', value: me.saveMode === 'auto' ? 'Save automatically' : 'Save explicitly', theme: 'secondary' });
            saveMode.addEventListener('change', () => {
                const mode = saveMode.value === 'Save automatically' ? 'auto' : 'explicit';
                t.act(() => ts.api.request('POST', 'profiles', { id: me.id, name: me.name, saveMode: mode }), mode === 'auto' ? 'Changes now save automatically.' : 'Changes now save when you click Save.');
            });
            saveRow.appendChild(saveMode);
            mineCol.appendChild(saveRow);
            frag.appendChild(mine);

            // Current team
            const [current, currentCol] = t.section('Current Team', 'Projects, features, problems, solutions, and stories belong to the current team. Tasks always stay private to you.');
            const select = document.createElement('select');
            select.setAttribute('aria-label', 'Current team');
            const personal = document.createElement('option');
            personal.value = '';
            personal.innerText = 'Personal space (no team)';
            select.appendChild(personal);
            teams.forEach(team => {
                const o = document.createElement('option');
                o.value = team.id;
                o.innerText = team.name;
                select.appendChild(o);
            });
            select.value = session.team ? session.team.id : '';
            select.addEventListener('change', () => t.act(() => ts.setSession({ teamId: select.value }), 'Current team changed.'));
            currentCol.appendChild(select);
            frag.appendChild(current);

            // Teams
            const [teamsBox, teamsCol] = t.section('Teams', 'Teams come from Team subscriptions. The subscription owner adds a seat for each person by email, and the subscription name is the team name.');
            if (!teams.length) teamsCol.appendChild(webui.create('p', { text: 'You are not on a team yet.' }));
            teams.forEach(team => teamsCol.appendChild(t.teamCard(team, me, profiles)));
            teamsCol.appendChild(webui.create('webui-link', { href: '/account/subscription', text: 'Manage your plan and seats in My Subscription' }));
            frag.appendChild(teamsBox);

            // Profiles
            const [profBox, profCol] = t.section('Local Profiles', 'For this preview only: profiles stand in for Stoic Dreams accounts, so you can switch between people in this browser to test ownership and team sharing.');
            profiles.forEach(p => {
                const row = webui.create('webui-flex', { gap: '2', align: 'center', wrap: '' });
                row.appendChild(webui.create('span', { text: `${p.name} (${ts.personTag(p)})${p.email ? ` ${p.email}` : ''}${p.id === me.id ? ' - you' : ''}` }));
                if (p.id !== me.id) {
                    const use = webui.create('webui-button', { theme: 'info', 'start-icon': 'user-check', text: 'Switch To', 'aria-label': `Switch to ${p.name}` });
                    use.addEventListener('click', () => t.act(() => ts.setSession({ profileId: p.id }), `Switched to ${p.name}.`));
                    row.appendChild(use);
                }
                const del = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Delete', 'aria-label': `Delete the profile ${p.name}` });
                del.addEventListener('click', () => {
                    webui.dialog.confirm(webui.escapeHtml(`Delete the profile ${p.name}, their private tasks, and their personal items? This cannot be undone.`), () => t.act(() => ts.api.request('DELETE', `profiles/${p.id}`), 'Profile deleted.'));
                });
                row.appendChild(del);
                profCol.appendChild(row);
            });
            const addRow = webui.create('webui-flex', { gap: '2', align: 'flex-end', wrap: '' });
            const newName = webui.create('webui-input-text', { label: 'New profile name', maxlength: '50' });
            const newEmail = webui.create('webui-input-text', { label: 'New profile email', maxlength: '300' });
            const add = webui.create('webui-button', { theme: 'primary', 'start-icon': 'user-plus', text: 'Add Profile' });
            add.addEventListener('click', () => t.act(() => ts.api.request('POST', 'profiles', { name: newName.value, email: newEmail.value }), 'Profile added.'));
            addRow.appendChild(newName);
            addRow.appendChild(newEmail);
            addRow.appendChild(add);
            profCol.appendChild(addRow);
            frag.appendChild(profBox);

            t.replaceChildren(frag);
        },
        teamCard(team, me, profiles) {
            const owner = profiles.find(p => p.id === team.ownerId);
            const card = webui.create('webui-paper', { elevation: '10', class: 'pa-2' });
            const col = webui.create('webui-flex', { column: '', gap: '1' });
            col.appendChild(webui.create('h3', { class: 'my-0', text: team.name }));
            const who = team.ownerId === me.id ? 'You own this team' : `Owner: ${owner ? owner.name : 'unknown'}`;
            col.appendChild(webui.create('span', { class: 'f-small', text: `${who} · ${team.members.length} member${team.members.length === 1 ? '' : 's'}` }));
            if (!team.active) col.appendChild(webui.create('span', { class: 'f-small', text: 'The subscription is not active, so the team\'s items are read only until it is paid.' }));
            card.appendChild(col);
            return card;
        }
    });
}
