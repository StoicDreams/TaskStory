/* Task Story plans, as cards in place of the legacy plans tables (which were too wide for phones).
 * <app-plans></app-plans> lists the plans for guests.
 * <app-plans selectable></app-plans> adds a Select button to each card, sets `selected` to the chosen plan's key,
 * and fires "select" with { key }. Set the `current` property to mark the plan you are on.
 */
"use strict"
{
    const money = value => `$${Number(value).toFixed(2)}`;
    const limit = value => value > 0 ? Number(value).toLocaleString() : 'No limit';

    webui.define('app-plans', {
        preload: 'app:store',
        flags: ['selectable'],
        props: {
            selected: {
                get() { return this._selected || ''; },
                set(value) {
                    this._selected = value || '';
                    this.renderState();
                }
            },
            current: {
                get() { return this._current || ''; },
                set(value) {
                    this._current = value || '';
                    this.renderState();
                }
            },
        },
        constructor() {
            const t = this;
            t._list = t.template.querySelector('.plans');
            t._list.addEventListener('click', ev => {
                const button = ev.target.closest('button[data-key]');
                if (!button) return;
                const key = button.getAttribute('data-key');
                t.selected = key;
                t.dispatchEvent(new CustomEvent('select', { detail: { key }, bubbles: true }));
            });
        },
        connected() {
            this.load();
        },
        async load() {
            const t = this;
            const ts = window.taskStory;
            try {
                t._plans = await ts.api.request('GET', 'subscription/plans');
            } catch (ex) {
                t._list.replaceChildren(webui.create('p', { text: ts.message(ex, 'Could not load the plans.') }));
                return;
            }
            const frag = document.createDocumentFragment();
            t._plans.forEach(plan => frag.appendChild(t.card(plan)));
            t._list.replaceChildren(frag);
            t.renderState();
        },
        card(plan) {
            const card = webui.create('article', { class: 'plan', 'data-plan': plan.key });
            card.appendChild(webui.create('h3', { text: plan.name }));
            const price = plan.monthlyChargePerUser > 0
                ? `${money(plan.monthlyChargePerUser)} per user each month`
                : plan.monthlyCharge > 0 ? `${money(plan.monthlyCharge)} each month` : 'Free';
            card.appendChild(webui.create('p', { class: 'price', text: price }));
            card.appendChild(webui.create('p', { text: plan.description }));
            const list = webui.create('dl');
            [
                ['Users / Seats', limit(plan.teamSize)],
                ['Projects', limit(plan.projects)],
                ['Features', limit(plan.features)],
                ['Problems per user', limit(plan.problems)],
                ['Solutions per problem', limit(plan.solutionsPerProblem)],
                ['Tasks per user', limit(plan.tasksPerUser)],
                ['Story retention', `${Number(plan.storyRetentionDays).toLocaleString()} days`],
                ['Status', plan.status],
            ].forEach(([term, value]) => {
                const row = webui.create('div');
                row.appendChild(webui.create('dt', { text: term }));
                row.appendChild(webui.create('dd', { text: value }));
                list.appendChild(row);
            });
            card.appendChild(list);
            card.appendChild(webui.create('p', { class: 'mark' }));
            const button = webui.create('button', { type: 'button', 'data-key': plan.key });
            card.appendChild(button);
            return card;
        },
        renderState() {
            const t = this;
            if (!t._plans) return;
            const selectable = t.hasAttribute('selectable');
            t._plans.forEach(plan => {
                const card = t._list.querySelector(`[data-plan="${CSS.escape(plan.key)}"]`);
                if (!card) return;
                const chosen = selectable && plan.key === t.selected;
                card.classList.toggle('chosen', chosen);
                card.querySelector('.mark').innerText = plan.key === t.current && selectable ? 'Your current plan' : '';
                const button = card.querySelector('button');
                button.style.display = selectable ? '' : 'none';
                button.setAttribute('aria-pressed', chosen ? 'true' : 'false');
                button.innerText = chosen ? `${plan.name} selected` : `Select ${plan.name}`;
            });
        },
        shadowTemplate: `
<div class="plans"></div>
<style type="text/css">
:host { display:block; }
.plans { display:grid; grid-template-columns:repeat(auto-fit, minmax(15rem, 1fr)); gap:1rem; }
.plan { display:flex; flex-direction:column; gap:0.5rem; padding:1rem; border-radius:var(--corners, 4px); border:2px solid color-mix(in srgb, currentColor 30%, transparent); background:var(--color-background); color:inherit; }
.plan.chosen { border-color:var(--color-success); }
h3 { margin:0; color:var(--color-title); }
p { margin:0; }
.price { font-size:1.25em; font-weight:bold; }
.mark { font-size:0.9em; color:var(--color-success); font-weight:bold; }
.mark:empty { display:none; }
dl { margin:0; display:flex; flex-direction:column; gap:0.25rem; flex-grow:1; }
dl div { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid color-mix(in srgb, currentColor 20%, transparent); }
dt, dd { margin:0; }
dd { text-align:right; font-weight:bold; }
button { font:inherit; padding:0.5rem 1rem; border-radius:0.25rem; border:2px solid var(--color-primary); background:transparent; color:inherit; cursor:pointer; }
button[aria-pressed="true"] { background:var(--color-success); border-color:var(--color-success); color:var(--color-success-offset); }
button:focus-visible { outline:3px solid var(--color-info); outline-offset:2px; }
</style>
`
    });
}
