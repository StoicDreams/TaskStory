/* My Subscription, rebuilt from the legacy /account/subscription page: plan status, the Company | Team name,
 * choosing and confirming a plan, the estimated seat charges, and seats for Team plans.
 * Stripe is simulated during the POC: a "Simulated billing" panel pays invoices, turns auto-renewal on and off,
 * and ends the billing period, in place of Stripe invoices and the Stripe portal.
 */
"use strict"
{
    const money = value => `$${Number(value).toFixed(2)}`;
    const shortDate = value => value ? new Date(value).toLocaleDateString() : '';

    webui.define('app-subscription', {
        preload: 'app:store app:plans button flex paper quote input-text alert',
        constructor() {
            this._unsubs = [];
        },
        connected() {
            this.listen();
            this.load();
        },
        reconnected() {
            this.listen();
            this.load();
        },
        disconnected() {
            this._unsubs.forEach(fn => fn());
            this._unsubs = [];
        },
        listen() {
            const t = this;
            t._unsubs.forEach(fn => fn());
            t._unsubs = [window.taskStory.on('session', () => t.load())];
        },
        async load() {
            const t = this;
            const ts = window.taskStory;
            try {
                const [plans, status] = await Promise.all([ts.api.request('GET', 'subscription/plans'), ts.api.request('GET', 'subscription')]);
                t._plans = plans;
                t._status = status;
                t._seats = ts.isTeamPlan(t.myPlan()) ? await ts.api.request('GET', 'subscription/seats') : [];
            } catch (ex) {
                t.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: ts.message(ex) }));
                return;
            }
            t._selected = t._status.currentKey;
            // A plan chosen on the pricing page arrives as ?plan=key, once.
            const asked = new URLSearchParams(location.search).get('plan');
            if (asked !== null && !t._usedAskedPlan && t._plans.some(p => p.key === asked)) {
                t._usedAskedPlan = true;
                t._selected = asked;
            }
            if (t._name === undefined || t._loadedId !== t._status.id) t._name = t._status.name;
            t._loadedId = t._status.id;
            t.render();
        },
        planOf(key) {
            return this._plans.find(p => p.key === (key || '')) || this._plans[0];
        },
        myPlan() {
            return this.planOf(this._status.currentKey);
        },
        // Runs an API call, then reloads the page and tells everything else the teams may have changed.
        async act(handler, success) {
            const t = this;
            const ts = window.taskStory;
            t.clearError();
            try {
                await handler();
                if (success) webui.alert(webui.escapeHtml(success), 'success');
                await ts.sessionChanged();
            } catch (ex) {
                t.showError(ts.message(ex));
            }
        },
        showError(message) {
            if (!this._error) return;
            this._error.innerText = message;
            this._error.setAttribute('show', '');
        },
        clearError() {
            if (this._error) this._error.removeAttribute('show');
        },
        // What an owner comes for first: where the plan stands, then seats. Changing plans and billing come after.
        render() {
            const t = this;
            const frag = document.createDocumentFragment();
            const status = t._status;
            const myPlan = t.myPlan();
            if (status.currentKey) {
                frag.appendChild(t.statusQuote());
                if (myPlan.monthlyChargePerUser > 0) {
                    frag.appendChild(webui.create('webui-quote', {
                        theme: 'info', class: 'pa-3 mt-3',
                        text: `Based on your current seat usage of ${status.currentSeats} seat${status.currentSeats === 1 ? '' : 's'}, you have accrued about ${money(myPlan.monthlyChargePerUser * status.currentSeats)} in seat charges this billing cycle. This is an estimate only: it does not include seats used before the cycle ends, prorated charges or credits, or taxes and fees.`
                    }));
                }
            } else {
                frag.appendChild(webui.create('webui-quote', { theme: 'success', class: 'pa-3', text: `You are on the free ${myPlan.name} plan.` }));
            }
            t._error = webui.create('webui-alert', { variant: 'danger' });
            frag.appendChild(t._error);
            if (myPlan.monthlyChargePerUser > 0) frag.appendChild(t.seatsPanel());
            frag.appendChild(t.namePanel());
            frag.appendChild(t.plansPanel());
            if (status.currentKey) frag.appendChild(t.billingPanel());
            t.replaceChildren(frag);
            t.renderChange();
        },
        plansPanel() {
            const t = this;
            const status = t._status;
            const paper = webui.create('webui-paper', { elevation: '5', class: 'pa-3 mt-3' });
            const col = webui.create('webui-flex', { column: '', gap: '2' });
            col.appendChild(webui.create('h2', { class: 'my-0', text: 'Change Plan' }));
            t._downgrade = webui.create('webui-quote', { theme: 'warning', class: 'pa-3', text: 'Warning: moving from a Team plan to a Single Developer plan deletes all of the team\'s data when the new plan goes into effect.' });
            col.appendChild(t._downgrade);
            t._planList = webui.create('app-plans', { selectable: '' });
            t._planList.current = status.currentKey;
            t._planList.selected = t._selected;
            t._planList.addEventListener('select', ev => {
                t._selected = ev.detail.key;
                t.renderChange();
            });
            col.appendChild(t._planList);
            // The confirm button for a new plan sits under the cards it came from.
            t._action = webui.create('webui-flex', { gap: '2', align: 'center', wrap: '' });
            col.appendChild(t._action);
            col.appendChild(webui.create('webui-quote', { theme: 'info', class: 'pa-3', text: 'We are not currently enforcing any limits on total data consumption. We reserve the right to alter plans and pricing at any time, including setting data consumption limits for plans, if we deem it necessary to do so.' }));
            col.appendChild(webui.create('webui-quote', { theme: 'info', class: 'pa-3', text: 'In Team plans, seats are charged based on active usage per month. Users are considered active if they use Task Story while signed in at least once during the billing cycle.' }));
            paper.appendChild(col);
            return paper;
        },
        statusQuote() {
            const status = this._status;
            const plan = this.myPlan();
            const expired = status.isActive && Date.parse(status.currentExpiration) <= Date.now();
            let theme = 'success';
            let text;
            if (!status.isActive) {
                theme = 'danger';
                text = `You are subscribed to the ${plan.name} plan, which is pending payment.`;
            } else if (expired) {
                theme = 'danger';
                text = `Your ${plan.name} plan has expired. Renew it to keep this plan, or switch to the free Single Developer plan to confirm cancelling it.`;
            } else if (status.renewalEnabled) {
                text = `You are subscribed to the ${plan.name} plan, set to renew automatically on ${shortDate(status.currentExpiration)}.`;
            } else {
                theme = 'warning';
                text = `You are subscribed to the ${plan.name} plan, set to expire on ${shortDate(status.currentExpiration)}.`;
            }
            return webui.create('webui-quote', { theme, class: 'pa-3', text });
        },
        // Stands in for Stripe. The real app sends an invoice and links to the Stripe billing portal instead.
        billingPanel() {
            const t = this;
            const ts = window.taskStory;
            const status = t._status;
            const paper = webui.create('webui-paper', { elevation: '5', class: 'pa-3 mt-3' });
            const col = webui.create('webui-flex', { column: '', gap: '2' });
            col.appendChild(webui.create('h2', { class: 'my-0', text: 'Simulated Billing' }));
            col.appendChild(webui.create('p', { class: 'f-small', text: 'For this preview only: these buttons stand in for Stripe invoices and the Stripe billing portal. No money changes hands.' }));
            const row = webui.create('webui-flex', { gap: '2', wrap: '' });
            const expired = status.isActive && Date.parse(status.currentExpiration) <= Date.now();
            if (!status.isActive || expired) {
                const pay = webui.create('webui-button', { theme: 'success', 'start-icon': 'credit-card', text: expired ? 'Pay Renewal Invoice' : 'Pay Invoice' });
                pay.addEventListener('click', () => t.act(() => ts.api.request('POST', 'billing/pay'), 'Payment received.'));
                row.appendChild(pay);
            } else {
                const renew = webui.create('webui-button', { theme: 'info', 'start-icon': 'repeat', text: status.renewalEnabled ? 'Turn Off Auto-Renewal' : 'Turn On Auto-Renewal' });
                renew.addEventListener('click', () => t.act(() => ts.api.request('POST', 'billing/renewal', { enabled: !status.renewalEnabled }), status.renewalEnabled ? 'Auto-renewal is off.' : 'Auto-renewal is on.'));
                const end = webui.create('webui-button', { theme: 'warning', 'start-icon': 'calendar', text: 'End Billing Period' });
                end.addEventListener('click', () => t.act(() => ts.api.request('POST', 'billing/end-period'), status.renewalEnabled ? 'The plan renewed for another period.' : 'The plan expired.'));
                row.appendChild(renew);
                row.appendChild(end);
            }
            col.appendChild(row);
            paper.appendChild(col);
            return paper;
        },
        namePanel() {
            const t = this;
            const ts = window.taskStory;
            const paper = webui.create('webui-paper', { elevation: '5', class: 'pa-3 mt-3 mb-3' });
            const row = webui.create('webui-flex', { gap: '3', align: 'center', wrap: '' });
            const name = webui.create('webui-input-text', { label: 'Company | Team', maxlength: '100', helper: 'The name for this subscription. Seat members see it as the team name.' });
            name.value = t._name || '';
            name.addEventListener('input', () => { t._name = name.value; });
            name.addEventListener('change', () => { t._name = name.value; });
            row.appendChild(name);
            const save = webui.create('webui-button', { theme: 'primary', 'start-icon': 'save', text: 'Save Name' });
            save.addEventListener('click', () => t.act(() => ts.api.request('POST', 'subscription/name', { name: t._name }), 'Subscription name saved.'));
            row.appendChild(save);
            paper.appendChild(row);
            return paper;
        },
        // The confirm area changes with the selected plan, as on the legacy page.
        renderChange() {
            const t = this;
            const ts = window.taskStory;
            const current = t.myPlan();
            const selected = t.planOf(t._selected);
            t._downgrade.style.display = selected.key !== current.key && !ts.isTeamPlan(selected) && ts.isTeamPlan(current) ? '' : 'none';
            const els = [];
            if (selected.key !== current.key) {
                let effect;
                if (!current.key) effect = 'send you an invoice to start your new subscription.';
                else if (!selected.key) effect = 'cancel your current subscription.';
                else effect = 'cancel your current subscription and send you an invoice to start your new subscription.';
                els.push(webui.create('webui-alert', { variant: 'warning', show: '', text: `You have selected the ${selected.name} plan. Confirming this change will ${effect}` }));
                const verb = !current.key ? 'Purchase' : ts.isUpgrade(current, selected) ? 'Upgrade to' : 'Downgrade to';
                const confirm = webui.create('webui-button', { theme: 'success', 'end-icon': 'arrow|rotate:90', text: `${verb} ${selected.name}` });
                confirm.addEventListener('click', () => t.act(() => ts.api.request('POST', 'subscription/change', { plan: selected.key, name: t._name }), selected.key ? `Your plan is now ${selected.name}, waiting for payment.` : `Your plan is now ${selected.name}.`));
                els.push(confirm);
            }
            t._action.replaceChildren(...els);
        },
        seatsPanel() {
            const t = this;
            const ts = window.taskStory;
            const paper = webui.create('webui-paper', { elevation: '5', class: 'pa-3 mt-3' });
            const col = webui.create('webui-flex', { column: '', gap: '2' });
            col.appendChild(webui.create('h2', { class: 'my-0', text: 'Seats' }));
            col.appendChild(webui.create('p', { class: 'f-small', text: 'Each seat is one person on your team. A Stoic Dreams account whose email matches a seat joins the team. During this preview, that means a local profile with the same email.' }));
            const row = webui.create('webui-flex', { gap: '3', align: 'flex-end', wrap: '' });
            const name = webui.create('webui-input-text', { label: 'Seat name', maxlength: '50', helper: 'Name of the person this seat belongs to.' });
            const email = webui.create('webui-input-text', { label: 'Seat email', maxlength: '300', type: 'email', helper: 'Must match the email they use for their Stoic Dreams account.' });
            const add = webui.create('webui-button', { theme: 'primary', 'start-icon': 'plus', text: 'Add Seat' });
            add.addEventListener('click', () => t.act(() => ts.api.request('POST', 'subscription/seats', { name: name.value, email: email.value }), 'Seat added.'));
            row.appendChild(name);
            row.appendChild(email);
            row.appendChild(add);
            col.appendChild(row);
            // One row per seat that wraps on narrow screens, instead of a table that is cut off on a phone.
            const list = webui.create('webui-flex', { column: '', gap: '1', role: 'list', 'aria-label': 'Seats' });
            t._seats.forEach(seat => {
                const row = webui.create('webui-flex', { role: 'listitem', wrap: '', gap: '2', align: 'center', class: 'pa-1' });
                row.style.borderBottom = '1px solid color-mix(in srgb, currentColor 20%, transparent)';
                const who = webui.create('webui-flex', { column: '', grow: '', align: 'flex-start' });
                Object.assign(who.style, { alignItems: 'flex-start', textAlign: 'start' });
                who.appendChild(webui.create('strong', { text: seat.name }));
                who.appendChild(webui.create('span', { class: 'f-small', text: seat.email || '(no email)' }));
                row.appendChild(who);
                row.appendChild(webui.create('span', { class: 'f-small', text: seat.isActive ? 'Active this cycle' : 'Not active this cycle' }));
                if (seat.isRemoveable) {
                    const remove = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Remove', 'aria-label': `Remove ${seat.name} from your seats` });
                    remove.addEventListener('click', () => t.act(() => ts.api.request('DELETE', `subscription/seats/${encodeURIComponent(seat.email)}`), `${seat.name} was removed.`));
                    row.appendChild(remove);
                } else {
                    row.appendChild(webui.create('span', { class: 'f-small', text: 'Owner' }));
                }
                list.appendChild(row);
            });
            const wrap = list;
            col.appendChild(wrap);
            paper.appendChild(col);
            return paper;
        }
    });
}
