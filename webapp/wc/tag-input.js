/* Tag chips with a text box: Enter adds a tag, each chip has a remove button, and chips are colored by tag type.
 * Fires cancelable "tag-add" and "tag-remove" events (detail.tag) before changing its own list, then "change".
 * A parent that applies its own rules cancels those events and sets .tags itself.
 * Candidate for MyFiCDN as a general chip input after the POC.
 */
"use strict"
{
    const fallbackFilter = value => `${value || ''}`.trim().toLowerCase();
    webui.define('app-tag-input', {
        preload: 'app:store',
        attr: ['label', 'tag-prefix', 'placeholder', 'helper', 'maxlength'],
        flags: ['readonly', 'nochips'],
        constructor() {
            const t = this;
            t._tags = [];
            t._label = t.template.querySelector('label');
            t._input = t.template.querySelector('input');
            t._helper = t.template.querySelector('.helper');
            t._chips = t.template.querySelector('.chips');
            t._input.id = `tag-input-${webui.uuid()}`;
            t._label.htmlFor = t._input.id;
            t._input.addEventListener('keydown', ev => {
                if (ev.key !== 'Enter') return;
                ev.preventDefault();
                t.addTag(t._input.value);
            });
            t._chips.addEventListener('click', ev => {
                const btn = ev.target.closest('button[data-tag]');
                if (!btn) return;
                t.removeTag(btn.dataset.tag);
            });
        },
        attrChanged(property, value) {
            const t = this;
            switch (property) {
                case 'label':
                    t._label.innerText = value || '';
                    t.updateName();
                    break;
                case 'placeholder':
                    t._input.setAttribute('placeholder', value || '');
                    t.updateName();
                    break;
                case 'helper':
                    t._helper.innerText = value || '';
                    break;
                case 'maxlength':
                    t._input.setAttribute('maxlength', value || '');
                    break;
                case 'readonly':
                    t._input.style.display = (!!value) ? 'none' : '';
                    t.render();
                    break;
                case 'nochips':
                    t.render();
                    break;
            }
        },
        /** Without a label, the placeholder names the text box for screen readers. */
        updateName() {
            const t = this;
            const name = !t.getAttribute('label') && t.getAttribute('placeholder');
            if (name) t._input.setAttribute('aria-label', name);
            else t._input.removeAttribute('aria-label');
        },
        props: {
            tags: {
                get() { return this._tags.slice(); },
                set(list) {
                    const next = Array.isArray(list) ? list.slice() : [];
                    if (webui.isEqual(next, this._tags)) return;
                    this._tags = next;
                    this.render();
                }
            },
            value: {
                get() { return this._tags.slice(); },
                set(list) { this.tags = list; }
            }
        },
        setValue(list) {
            this.tags = list;
        },
        connected() {
            const t = this;
            if (!t.hasAttribute('maxlength')) t._input.setAttribute('maxlength', '30');
            t.render();
        },
        clean(text) {
            const ts = window.taskStory;
            const filterName = ts ? ts.tags.filterName : fallbackFilter;
            const raw = `${text || ''}`.trim();
            if (!raw) return '';
            const prefix = this.getAttribute('tag-prefix') || '';
            // A typed prefix wins over the selected one, so "bug" stays plain and "problem:x" stays a problem tag.
            return filterName(raw.includes(':') || !prefix ? raw : `${prefix}${raw}`);
        },
        addTag(text) {
            const t = this;
            const tag = t.clean(text);
            t._input.value = '';
            if (!tag) return;
            const ev = new CustomEvent('tag-add', { detail: { tag }, cancelable: true, bubbles: true });
            if (!t.dispatchEvent(ev)) return;
            if (t._tags.includes(tag)) return;
            t._tags.push(tag);
            t.render();
            t.changed();
        },
        removeTag(tag) {
            const t = this;
            const ev = new CustomEvent('tag-remove', { detail: { tag }, cancelable: true, bubbles: true });
            if (!t.dispatchEvent(ev)) return;
            t._tags = t._tags.filter(x => x !== tag);
            t.render();
            t.changed();
            t._input.focus();
        },
        changed() {
            this.dispatchEvent(new CustomEvent('change', { detail: { tags: this.tags }, bubbles: true }));
        },
        render() {
            const t = this;
            const theme = window.taskStory ? window.taskStory.tags.theme : () => 'shade';
            const readonly = t.hasAttribute('readonly');
            const frag = document.createDocumentFragment();
            if (!t.hasAttribute('nochips')) {
                t._tags.forEach(tag => {
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    chip.dataset.theme = theme(tag);
                    const text = document.createElement('span');
                    text.innerText = tag;
                    chip.appendChild(text);
                    if (!readonly) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.dataset.tag = tag;
                        btn.setAttribute('aria-label', `Remove tag ${tag}`);
                        btn.innerText = '×';
                        chip.appendChild(btn);
                    }
                    frag.appendChild(chip);
                });
            }
            t._chips.replaceChildren(frag);
        },
        shadowTemplate: `
<div class="field">
<label></label>
<input type="text" autocomplete="off" />
<div class="helper"></div>
</div>
<div class="chips"></div>
<style type="text/css">
:host {
display:flex;
flex-wrap:wrap;
align-items:flex-start;
gap:var(--padding);
box-sizing:border-box;
}
.field {
display:flex;
flex-direction:column;
min-width:180px;
max-width:320px;
flex:0 1 240px;
}
label {
font-size:0.9em;
}
input {
font:inherit;
color:inherit;
background:transparent;
border:none;
border-bottom:1px solid currentColor;
padding:0.3em 0;
}
input:focus-visible {
outline:2px solid var(--color-focus, currentColor);
outline-offset:2px;
}
.helper {
font-size:0.8em;
opacity:0.8;
}
label:empty, .helper:empty {
display:none;
}
.chips {
display:flex;
flex-wrap:wrap;
gap:calc(var(--padding) / 2);
align-items:center;
flex:1 1 200px;
}
.chips:empty {
display:none;
}
.chip {
display:inline-flex;
align-items:center;
gap:0.4em;
border-radius:1em;
padding:0.25em 0.75em;
background-color:var(--color-shade);
color:var(--color-shade-offset);
}
.chip[data-theme="primary"] { background-color:var(--color-primary); color:var(--color-primary-offset); }
.chip[data-theme="secondary"] { background-color:var(--color-secondary); color:var(--color-secondary-offset); }
.chip[data-theme="tertiary"] { background-color:var(--color-tertiary); color:var(--color-tertiary-offset); }
.chip[data-theme="info"] { background-color:var(--color-info); color:var(--color-info-offset); }
.chip[data-theme="success"] { background-color:var(--color-success); color:var(--color-success-offset); }
.chip[data-theme="warning"] { background-color:var(--color-warning); color:var(--color-warning-offset); }
.chip[data-theme="danger"] { background-color:var(--color-danger); color:var(--color-danger-offset); }
.chip button {
font:inherit;
line-height:1;
color:inherit;
background:transparent;
border:1px solid currentColor;
border-radius:50%;
width:1.4em;
height:1.4em;
padding:0;
cursor:pointer;
}
.chip button:focus-visible {
outline:2px solid var(--color-focus, currentColor);
outline-offset:2px;
}
</style>
`
    });
}
