/* A list of selectable entries that can be reordered by dragging, or with Alt+Arrow Up and Alt+Arrow Down.
 * Set .items to [{ id, label, mark, detail }] (mark "bug" highlights the entry, "done" crosses it out, detail is a smaller second line) and .selected to an id.
 * Fires "select" (detail.id) and "reorder" (detail.ids).
 * Candidate for MyFiCDN after the POC.
 */
"use strict"
{
    webui.define('app-sortable-list', {
        attr: ['label', 'empty'],
        flags: ['nosort'],
        constructor() {
            const t = this;
            t._items = [];
            t._selected = '';
            t._list = t.template.querySelector('ul');
            t._empty = t.template.querySelector('.empty');
            t._hint = t.template.querySelector('.hint');
            t._hint.id = `sort-hint-${webui.uuid()}`;
            t._list.addEventListener('click', ev => {
                const btn = ev.target.closest('button[data-id]');
                if (!btn) return;
                t.select(btn.dataset.id);
            });
            t._list.addEventListener('keydown', ev => {
                const btn = ev.target.closest('button[data-id]');
                if (!btn || !ev.altKey || t.hasAttribute('nosort')) return;
                if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
                ev.preventDefault();
                t.move(btn.dataset.id, ev.key === 'ArrowUp' ? -1 : 1, true);
            });
            t._list.addEventListener('dragstart', ev => {
                const li = ev.target.closest('li[data-id]');
                if (!li) return;
                t._dragId = li.dataset.id;
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', li.dataset.id);
                li.classList.add('dragging');
            });
            t._list.addEventListener('dragend', ev => {
                const li = ev.target.closest('li[data-id]');
                if (li) li.classList.remove('dragging');
                t._list.querySelectorAll('.over').forEach(el => el.classList.remove('over'));
                t._dragId = '';
            });
            t._list.addEventListener('dragover', ev => {
                if (!t._dragId) return;
                const li = ev.target.closest('li[data-id]');
                if (!li) return;
                ev.preventDefault();
                t._list.querySelectorAll('.over').forEach(el => { if (el !== li) el.classList.remove('over'); });
                li.classList.add('over');
            });
            t._list.addEventListener('drop', ev => {
                if (!t._dragId) return;
                const li = ev.target.closest('li[data-id]');
                if (!li) return;
                ev.preventDefault();
                const from = t._items.findIndex(i => i.id === t._dragId);
                const to = t._items.findIndex(i => i.id === li.dataset.id);
                if (from === -1 || to === -1 || from === to) return;
                const [moved] = t._items.splice(from, 1);
                t._items.splice(to, 0, moved);
                t.render();
                t.reordered();
            });
        },
        attrChanged(property, value) {
            const t = this;
            switch (property) {
                case 'label':
                    t._list.setAttribute('aria-label', value || 'Items');
                    break;
                case 'empty':
                    t._empty.innerText = value || 'Nothing here yet.';
                    break;
                case 'nosort':
                    t.render();
                    break;
            }
        },
        props: {
            items: {
                get() { return this._items.map(i => Object.assign({}, i)); },
                set(list) {
                    const next = Array.isArray(list) ? list.map(i => ({ id: `${i.id}`, label: `${i.label || ''}`, mark: i.mark || '', detail: `${i.detail || ''}` })) : [];
                    if (webui.isEqual(next, this._items)) return;
                    this._items = next;
                    this.render();
                }
            },
            selected: {
                get() { return this._selected; },
                set(id) {
                    id = id ? `${id}` : '';
                    if (id === this._selected) return;
                    this._selected = id;
                    this.render();
                }
            }
        },
        connected() {
            const t = this;
            if (!t.hasAttribute('empty')) t._empty.innerText = 'Nothing here yet.';
            t.render();
        },
        select(id) {
            const t = this;
            t.selected = id;
            t.dispatchEvent(new CustomEvent('select', { detail: { id }, bubbles: true }));
        },
        move(id, step, keepFocus) {
            const t = this;
            const from = t._items.findIndex(i => i.id === id);
            const to = from + step;
            if (from === -1 || to < 0 || to >= t._items.length) return;
            const [moved] = t._items.splice(from, 1);
            t._items.splice(to, 0, moved);
            t.render();
            if (keepFocus) {
                const btn = t._list.querySelector(`button[data-id="${CSS.escape(id)}"]`);
                if (btn) btn.focus();
            }
            t.reordered();
        },
        reordered() {
            this.dispatchEvent(new CustomEvent('reorder', { detail: { ids: this._items.map(i => i.id) }, bubbles: true }));
        },
        render() {
            const t = this;
            const sortable = !t.hasAttribute('nosort');
            const frag = document.createDocumentFragment();
            t._items.forEach(item => {
                const li = document.createElement('li');
                li.dataset.id = item.id;
                if (item.mark) li.dataset.mark = item.mark;
                li.draggable = sortable;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.dataset.id = item.id;
                btn.innerText = item.label || '(no name)';
                if (item.detail) btn.appendChild(webui.create('span', { class: 'detail', text: item.detail }));
                if (item.id === t._selected) btn.setAttribute('aria-current', 'true');
                if (sortable) btn.setAttribute('aria-describedby', t._hint.id);
                li.appendChild(btn);
                frag.appendChild(li);
            });
            t._list.replaceChildren(frag);
            t._empty.style.display = (t._items.length > 0) ? 'none' : '';
            t._hint.style.display = (!sortable || t._items.length < 2) ? 'none' : '';
        },
        shadowTemplate: `
<ul></ul>
<div class="empty"></div>
<div class="hint">Drag to reorder, or use Alt+Arrow Up and Alt+Arrow Down.</div>
<style type="text/css">
:host {
display:flex;
flex-direction:column;
gap:calc(var(--padding) / 2);
}
ul {
list-style:none;
margin:0;
padding:0;
display:flex;
flex-direction:column;
gap:calc(var(--padding) / 2);
}
li {
border-radius:var(--corners, 4px);
}
li.dragging {
opacity:0.5;
}
li.over {
outline:2px dashed var(--color-info);
}
button {
font:inherit;
text-align:left;
width:100%;
padding:0.5em 0.75em;
border:none;
border-left:4px solid transparent;
border-radius:var(--corners, 4px);
background-color:var(--color-shade);
color:var(--color-shade-offset);
cursor:pointer;
}
li[data-mark="bug"] button {
border-left-color:var(--color-danger);
}
li[data-mark="done"] button {
text-decoration:line-through;
opacity:0.75;
}
button[aria-current="true"] {
background-color:var(--color-info);
color:var(--color-info-offset);
}
button:focus-visible {
outline:2px solid var(--color-focus, currentColor);
outline-offset:2px;
}
.detail {
display:block;
font-size:0.8em;
opacity:0.85;
}
.empty, .hint {
font-size:0.85em;
opacity:0.85;
}
</style>
`
    });
}
