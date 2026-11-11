/* Markdown text with three views: editor, both (side by side), and rendered.
 * The rendered view uses taskStory.renderMarkdown, which strips anything that could run code or drive components,
 * because item text is user content that teammates also see. Fires "input" while typing and "change" when the text box loses focus.
 * Candidate for MyFiCDN after the POC (it would need its own safe renderer there).
 */
"use strict"
{
    const views = ['editor', 'both', 'rendered'];
    const renderMarkdown = text => window.taskStory ? window.taskStory.renderMarkdown(text) : webui.escapeHtml(`${text || ''}`);
    webui.define('app-markdown-editor', {
        preload: 'app:store',
        attr: ['label', 'view', 'placeholder', 'empty'],
        flags: ['readonly'],
        constructor() {
            const t = this;
            t._value = '';
        },
        attrChanged(property, value) {
            const t = this;
            switch (property) {
                case 'label':
                    if (t._editor) t._editor.setAttribute('label', value || '');
                    if (t._previewLabel) t._previewLabel.innerText = value ? `${value} (rendered)` : 'Rendered';
                    break;
                case 'placeholder':
                    if (t._editor) t._editor.setAttribute('placeholder', value || '');
                    break;
                case 'view':
                    if (views.indexOf(value) === -1) {
                        t.setAttribute('view', 'both');
                        return;
                    }
                    if (value !== 'editor') t.renderPreview();
                    break;
            }
        },
        props: {
            value: {
                get() {
                    return this._editor ? webui.getDefined(this._editor.value, this._value) : this._value;
                },
                set(v) {
                    const value = `${webui.getDefined(v, '')}`;
                    this._value = value;
                    if (this._editor && this._editor.value !== value) this._editor.value = value;
                    this.renderPreview();
                }
            }
        },
        setValue(value) {
            this.value = value;
        },
        connected() {
            const t = this;
            const frag = document.createDocumentFragment();
            if (!t.hasAttribute('readonly')) {
                t._editor = webui.create('webui-input-message', { slot: 'editor', label: t.getAttribute('label') || 'Details', placeholder: t.getAttribute('placeholder') || 'Supports Markdown' });
                t._editor.addEventListener('input', ev => {
                    ev.stopPropagation();
                    t._value = t._editor.value;
                    t.renderPreview();
                    t.dispatchEvent(new CustomEvent('input', { bubbles: true }));
                });
                t._editor.addEventListener('change', ev => {
                    ev.stopPropagation();
                    t.dispatchEvent(new CustomEvent('change', { bubbles: true }));
                });
                frag.appendChild(t._editor);
            } else {
                t.setAttribute('view', 'rendered');
            }
            t._preview = webui.create('webui-paper', { slot: 'preview', class: 'pa-2', elevation: '5' });
            t._previewLabel = webui.create('div', { class: 'f-small', text: t.getAttribute('label') ? `${t.getAttribute('label')} (rendered)` : 'Rendered' });
            t._previewBody = webui.create('div', { class: 'markdown' });
            t._preview.appendChild(t._previewLabel);
            t._preview.appendChild(t._previewBody);
            frag.appendChild(t._preview);
            t.appendChild(frag);
            if (!t.hasAttribute('view')) t.setAttribute('view', 'both');
            if (t._editor) t._editor.value = t._value;
            t.renderPreview();
        },
        renderPreview() {
            const t = this;
            if (!t._previewBody) return;
            if (t.getAttribute('view') === 'editor') return;
            const text = t._editor ? t._editor.value : t._value;
            if (t._lastRendered === text) return;
            t._lastRendered = text;
            const html = renderMarkdown(text);
            if (html) {
                t._previewBody.innerHTML = html;
            } else {
                t._previewBody.innerText = t.getAttribute('empty') || 'Nothing written yet.';
            }
        },
        shadowTemplate: `
<slot name="editor"></slot>
<slot name="preview"></slot>
<style type="text/css">
:host {
display:grid;
grid-template-columns:1fr 1fr;
gap:var(--padding);
align-items:start;
width:100%;
}
:host([view="editor"]),
:host([view="rendered"]) {
grid-template-columns:1fr;
}
:host([view="editor"]) slot[name="preview"],
:host([view="rendered"]) slot[name="editor"] {
display:none;
}
@media (max-width: 800px) {
:host {
grid-template-columns:1fr;
}
}
::slotted([slot="preview"]) {
min-height:3em;
overflow:auto;
}
</style>
`
    });
}
