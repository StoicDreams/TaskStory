/* Story publisher dialog content, rebuilt from the legacy StoryPublisher.
 * Shows a problem and every solution tagged with it, lets the user mark each solution Implemented or Dropped,
 * previews the story, and publish() saves it, which deletes the problem and those solutions.
 * It is shown inside webui-dialogs' shadow DOM, where page CSS does not reach, so it carries its own styles.
 */
"use strict"
{
    webui.define('app-story-publisher', {
        preload: 'app:store',
        attr: ['problem-id'],
        constructor() {
            const t = this;
            t._root = t.template.querySelector('.root');
            t._implemented = new Set();
            t._solutions = [];
            t._problem = '';
        },
        connected() {
            this.load();
        },
        async load() {
            const t = this;
            const ts = window.taskStory;
            t.status('Loading solutions...');
            try {
                const preview = await ts.api.request('POST', 'stories/preview', { problemId: t.getAttribute('problem-id'), implemented: [] });
                t._solutions = preview.solutions;
                t._implemented = new Set(preview.solutions.map(s => s.id));
                t._story = preview.story;
                t.render();
            } catch (ex) {
                t.status(ts.message(ex, 'Could not load this problem.'), true);
            }
        },
        status(message, isError) {
            const t = this;
            const p = document.createElement('p');
            p.className = isError ? 'error' : '';
            p.innerText = message;
            t._root.replaceChildren(p);
        },
        section(title, html, fallback) {
            const box = document.createElement('section');
            const h = document.createElement('h3');
            h.innerText = title;
            const body = document.createElement('div');
            body.className = 'md';
            if (html) body.innerHTML = html;
            else body.innerText = fallback || 'None';
            box.appendChild(h);
            box.appendChild(body);
            return box;
        },
        render() {
            const t = this;
            const ts = window.taskStory;
            const frag = document.createDocumentFragment();
            frag.appendChild(t.section('Problem', ts.renderMarkdown(t._story.problem)));
            const solutions = document.createElement('section');
            const h = document.createElement('h3');
            h.innerText = 'Solutions';
            solutions.appendChild(h);
            if (!t._solutions.length) {
                const p = document.createElement('p');
                p.innerText = 'No solutions are tagged with this problem.';
                solutions.appendChild(p);
            }
            t._solutions.forEach(s => {
                const row = document.createElement('div');
                row.className = 'solution';
                const btn = document.createElement('button');
                btn.type = 'button';
                const on = t._implemented.has(s.id);
                btn.className = on ? 'on' : 'off';
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.innerText = on ? 'Implemented' : 'Dropped';
                btn.setAttribute('aria-label', `${s.name}: ${on ? 'Implemented' : 'Dropped'}. Toggle`);
                btn.addEventListener('click', () => {
                    if (t._implemented.has(s.id)) t._implemented.delete(s.id);
                    else t._implemented.add(s.id);
                    t.render();
                });
                const body = document.createElement('div');
                body.className = 'md';
                body.innerHTML = ts.renderMarkdown(ts.toMarkdown('solution', s));
                row.appendChild(btn);
                row.appendChild(body);
                solutions.appendChild(row);
            });
            frag.appendChild(solutions);
            const preview = Object.assign({}, t._story, {
                integratedSolutions: t._solutions.filter(s => t._implemented.has(s.id)).map(s => ts.toMarkdown('solution', s)).join('\n\n'),
                droppedSolutions: t._solutions.filter(s => !t._implemented.has(s.id)).map(s => ts.toMarkdown('solution', s)).join('\n\n'),
            });
            frag.appendChild(t.section('Preview', ts.renderMarkdown(ts.toMarkdown('story', preview))));
            const warn = document.createElement('p');
            warn.className = 'warning';
            warn.innerText = 'Make sure all content in the preview is correct and all solution work is either completed or dropped. Clicking Publish will create the story and delete this problem and all its solutions. This cannot be undone.';
            frag.appendChild(warn);
            t._root.replaceChildren(frag);
        },
        // Called by the dialog's Publish button. Returning false keeps the dialog open.
        async publish() {
            const t = this;
            const ts = window.taskStory;
            if (!t._story || t._publishing) return false;
            t._publishing = true;
            try {
                const result = await ts.api.request('POST', 'stories/publish', { problemId: t.getAttribute('problem-id'), implemented: Array.from(t._implemented) });
                webui.alert(webui.escapeHtml(`Published the story ${result.story.name}.`), 'success');
                ts.emit('items', { types: ['problem', 'solution', 'story'] });
                return true;
            } catch (ex) {
                const p = document.createElement('p');
                p.className = 'error';
                p.innerText = ts.message(ex, 'Could not publish this story.');
                t._root.prepend(p);
                return false;
            } finally {
                t._publishing = false;
            }
        },
        shadowTemplate: `
<div class="root"></div>
<style type="text/css">
:host {
display:block;
text-align:left;
}
.root {
display:flex;
flex-direction:column;
gap:var(--padding, 0.5rem);
}
section {
border:1px solid color-mix(in srgb, currentColor 30%, transparent);
border-radius:var(--corners, 4px);
padding:var(--padding, 0.5rem);
}
h3 {
margin:0 0 0.5em;
padding:0.25em 0.5em;
background-color:var(--color-secondary);
color:var(--color-secondary-offset);
border-radius:var(--corners, 4px);
}
.solution {
display:grid;
grid-template-columns:auto 1fr;
gap:var(--padding, 0.5rem);
align-items:start;
margin-bottom:var(--padding, 0.5rem);
}
button {
font:inherit;
padding:0.4em 0.8em;
border:none;
border-radius:var(--corners, 4px);
cursor:pointer;
}
button.on { background-color:var(--color-success); color:var(--color-success-offset); }
button.off { background-color:var(--color-danger); color:var(--color-danger-offset); }
button:focus-visible {
outline:2px solid var(--color-focus, currentColor);
outline-offset:2px;
}
.md table { border-collapse:collapse; }
.md th, .md td { border:1px solid color-mix(in srgb, currentColor 30%, transparent); padding:0.2em 0.5em; }
.md pre { white-space:pre-wrap; }
.warning {
padding:var(--padding, 0.5rem);
background-color:var(--color-warning);
color:var(--color-warning-offset);
border-radius:var(--corners, 4px);
}
.error {
padding:var(--padding, 0.5rem);
background-color:var(--color-danger);
color:var(--color-danger-offset);
border-radius:var(--corners, 4px);
}
</style>
`
    });
}
