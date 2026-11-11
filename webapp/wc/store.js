/* Task Story data layer for the POC.
 * Defines window.taskStory: a simulated API stored in IndexedDB, the item types, tag rules, and the shared tag filter.
 * Each api.request route is written the way the real MyFi endpoint will be, so replacing request() with webui.fetchApi
 * is the only change needed once the endpoints exist. Nothing here is secure: the real API must enforce the same rules.
 */
"use strict"
{
    const DB_NAME = 'taskstory-poc';
    const DB_VERSION = 1;
    const LATENCY = 40;
    const TAG_MAX = 30;
    const NAME_MAX = 50;
    const FILTER_KEY = 'session-ts-filter';
    const QUICK_KEY = 'session-ts-quick-filters';

    const whFields = (subject, prompts) => [
        { key: 'summary', label: 'Summary', prompt: prompts.summary },
        { key: 'who', label: 'Who', prompt: prompts.who },
        { key: 'what', label: 'What', prompt: prompts.what },
        { key: 'where', label: 'Where', prompt: prompts.where },
        { key: 'when', label: 'When', prompt: prompts.when },
        { key: 'why', label: 'Why', prompt: prompts.why },
        { key: 'how', label: 'How', prompt: prompts.how },
    ];

    // Each type's settings, taken from the legacy Blazor managers.
    const types = {
        task: {
            key: 'task', label: 'Task', plural: 'Tasks', icon: 'circle_check', prefix: '', shared: false,
            help: 'Tasks are only visible to you.',
            fields: [{ key: 'details', label: 'Details', prompt: 'Use this space to detail whatever you need to detail about this task. Task details are only seen by you, so use this space as little or as much as you need.' }]
        },
        solution: {
            key: 'solution', label: 'Solution', plural: 'Solutions', icon: 'lightbulb', prefix: 'solution:', shared: true, ownerOnly: true,
            ownerMessage: 'Solutions can only be edited by the owner. Remove the current owner tag and save if you are taking over ownership of the problem and its solutions.',
            fields: [
                { key: 'summary', label: 'Summary', prompt: 'Summarize your findings and progress here as you work through the solution.' },
                { key: 'investigation', label: 'Investigation', prompt: 'Use this space to provide notes and findings from any investigations into this solution.' },
                { key: 'testing', label: 'Testing', prompt: 'Document notes and results on any prototyping, testing, and benchmarking performed here.' },
                { key: 'devNotes', label: 'Notes', heading: 'Development Notes', prompt: 'Use this space to detail any developer specific notes.' },
            ]
        },
        problem: {
            key: 'problem', label: 'Problem', plural: 'Problems', icon: 'triangle_exclamation', prefix: 'problem:', shared: true, ownerOnly: true, publish: true,
            ownerMessage: 'Problems can only be saved by the owner. Remove the current owner tag if you want to make yourself owner to make changes.',
            fields: whFields('problem', {
                summary: 'Provide a brief summary of the problem. Flesh out more details in the Who, What, Where, When, Why and How tabs.',
                who: 'Who is having this problem?',
                what: 'What is the problem?',
                where: 'Where is this problem occurring?',
                when: 'When does this problem occur?',
                why: 'Why is this a problem?',
                how: 'How can this problem be replicated?',
            })
        },
        feature: {
            key: 'feature', label: 'Feature', plural: 'Features', icon: 'puzzle-piece', prefix: 'feature:', shared: true,
            fields: whFields('feature', {
                summary: 'Summarize feature details here. Flesh out more details in the Who, What, Where, When, Why and How tabs.',
                who: 'Who will benefit from this feature?',
                what: 'What is this feature?',
                where: 'Where is this feature used?',
                when: 'When is this feature used? When is it needed?',
                why: 'Why is there a need for this feature? Why will people use this feature?',
                how: 'How will users discover the feature? How will it be used?',
            })
        },
        project: {
            key: 'project', label: 'Project', plural: 'Projects', icon: 'folder', prefix: 'project:', shared: true,
            fields: whFields('project', {
                summary: 'Summarize project details here. Flesh out more details in the Who, What, Where, When, Why and How tabs.',
                who: 'Who will benefit from this project?',
                what: 'What is this project? What is the product it represents?',
                where: 'Where is the product used?',
                when: 'When is the product used? When is it needed?',
                why: 'Why is there a need for this project? Why will people use this product?',
                how: 'How will users discover the product? How will it be used?',
            })
        },
        story: {
            key: 'story', label: 'Story', plural: 'Stories', icon: 'book-open', prefix: '', shared: true, readOnly: true,
            help: 'Stories are published from problems and cannot be edited.',
            fields: [
                { key: 'problem', label: 'Problem', prompt: '' },
                { key: 'integratedSolutions', label: 'Integrated Solutions', prompt: '' },
                { key: 'droppedSolutions', label: 'Dropped Solutions', prompt: '' },
            ]
        },
    };
    const typeOrder = ['task', 'solution', 'problem', 'feature', 'project'];

    const prefixes = [
        { id: '', display: 'Custom' },
        { id: 'project:', display: 'Project' },
        { id: 'problem:', display: 'Problem' },
        { id: 'solution:', display: 'Solution' },
        { id: 'team:', display: 'Team' },
        { id: 'person:', display: 'Person' },
        { id: 'feature:', display: 'Feature' },
    ];

    // Tag rules from the legacy TaggedItemValidation: keep letters and digits, keep : - _ . unless repeated, drop the rest.
    const tags = {
        max: TAG_MAX,
        filterName(name) {
            let tag = '';
            let last = '-';
            for (const c of `${name || ''}`) {
                if (/[\p{L}\p{N}]/u.test(c)) {
                    tag += c;
                    last = c;
                    continue;
                }
                if (c === last) continue;
                if (':-_.'.includes(c)) {
                    tag += c;
                    last = c;
                }
            }
            return tag.toLowerCase().substring(0, TAG_MAX);
        },
        fromName(name, prefix) {
            const tag = tags.filterName(name);
            if (!tag) return '';
            return tags.filterName(`${prefix || ''}${tag}`);
        },
        prefixOf(tag) {
            const i = `${tag}`.indexOf(':');
            return i === -1 ? '' : tag.substring(0, i + 1);
        },
        theme(tag) {
            if (tag.startsWith('project:')) return 'primary';
            if (tag.startsWith('team:')) return 'warning';
            if (tag.startsWith('problem:')) return 'secondary';
            if (tag.startsWith('solution:')) return 'tertiary';
            if (tag.startsWith('feature:')) return 'info';
            if (tag.startsWith('blocked') || tag.startsWith('bug')) return 'danger';
            if (tag.startsWith('person:')) return 'success';
            return 'shade';
        },
        // Keep only the newest tag with the given prefix.
        limitPrefix(list, prefix, keep) {
            if (!prefix) return list;
            let kept = keep && keep.startsWith(prefix) ? keep : null;
            if (!kept) {
                for (let i = list.length - 1; i >= 0; i--) {
                    if (list[i].startsWith(prefix)) { kept = list[i]; break; }
                }
            }
            return list.filter(t => !t.startsWith(prefix) || t === kept);
        },
        owner(list) {
            return (list || []).find(t => t.startsWith('person:')) || '';
        },
    };

    // IndexedDB --------------------------------------------------------------
    let dbPromise = null;
    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('teams')) db.createObjectStore('teams', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('items')) {
                    const items = db.createObjectStore('items', { keyPath: 'id' });
                    items.createIndex('scopeType', ['scope', 'type']);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => { dbPromise = null; reject(req.error); };
        });
        return dbPromise;
    }
    function done(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function store(name, mode = 'readonly') {
        const db = await openDb();
        return db.transaction(name, mode).objectStore(name);
    }
    const db = {
        async all(name) { return done((await store(name)).getAll()); },
        async get(name, key) { return done((await store(name)).get(key)); },
        async put(name, value) { return done((await store(name, 'readwrite')).put(value)); },
        async del(name, key) { return done((await store(name, 'readwrite')).delete(key)); },
        async byScope(scope, type) {
            const s = await store('items');
            return done(s.index('scopeType').getAll([scope, type]));
        },
        async putMany(name, values) {
            const database = await openDb();
            const tx = database.transaction(name, 'readwrite');
            const s = tx.objectStore(name);
            values.forEach(v => s.put(v));
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
    };

    // Simulated API ------------------------------------------------------------
    class ApiError extends Error {
        constructor(status, message) { super(message); this.status = status; }
    }
    const fail = (status, message) => { throw new ApiError(status, message); };
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

    async function getSession() {
        const meta = await db.get('meta', 'session');
        const profileId = meta ? meta.profileId : '';
        const profile = profileId ? await db.get('profiles', profileId) : null;
        if (!profile) return { profile: null, team: null, scope: '' };
        let team = profile.currentTeamId ? await db.get('teams', profile.currentTeamId) : null;
        if (team && !team.members.includes(profile.id)) team = null;
        return { profile, team, scope: team ? `team:${team.id}` : `personal:${profile.id}` };
    }
    async function requireProfile() {
        const session = await getSession();
        if (!session.profile) fail(401, 'Create or pick a profile first.');
        return session;
    }
    function personTag(profile) {
        return tags.fromName(profile.name, 'person:');
    }
    function scopeFor(type, session) {
        return types[type].shared ? session.scope : `profile:${session.profile.id}`;
    }
    function requireType(type) {
        if (!types[type]) fail(404, `Unknown item type ${type}.`);
        return types[type];
    }
    function cleanItem(type, input, existing) {
        const config = types[type];
        const item = existing ? clone(existing) : { id: webui.uuid(), type, created: new Date().toISOString(), sortId: 0 };
        item.name = `${input.name || ''}`.trim().substring(0, NAME_MAX);
        item.tags = Array.from(new Set((input.tags || []).map(t => tags.filterName(t)).filter(Boolean)));
        config.fields.forEach(f => { item[f.key] = `${input[f.key] || ''}`; });
        if (config.key === 'solution') item.isImplemented = !!input.isImplemented;
        item.updated = new Date().toISOString();
        return item;
    }

    const routes = [
        ['GET', /^profiles$/, async () => (await db.all('profiles')).sort((a, b) => a.name.localeCompare(b.name))],
        ['POST', /^profiles$/, async (m, body) => {
            const name = `${body.name || ''}`.trim().substring(0, NAME_MAX);
            if (!tags.filterName(name)) fail(400, 'Enter a display name with at least one letter or digit.');
            const profiles = await db.all('profiles');
            const tag = tags.fromName(name, 'person:');
            if (profiles.some(p => p.id !== body.id && tags.fromName(p.name, 'person:') === tag)) fail(409, `Another profile already uses the tag ${tag}.`);
            const existing = body.id ? profiles.find(p => p.id === body.id) : null;
            const profile = existing || { id: webui.uuid(), created: new Date().toISOString(), currentTeamId: '', saveMode: 'explicit' };
            profile.name = name;
            if (body.saveMode === 'auto' || body.saveMode === 'explicit') profile.saveMode = body.saveMode;
            if (body.currentTeamId !== undefined) profile.currentTeamId = body.currentTeamId || '';
            await db.put('profiles', profile);
            if (!existing && !(await getSession()).profile) await db.put('meta', { key: 'session', profileId: profile.id });
            return profile;
        }],
        ['DELETE', /^profiles\/([\w-]+)$/, async (m) => {
            const id = m[1];
            const teams = await db.all('teams');
            for (const team of teams) {
                if (team.ownerId === id) fail(409, `Delete or hand over the team ${team.name} first.`);
            }
            for (const team of teams.filter(t => t.members.includes(id))) {
                team.members = team.members.filter(x => x !== id);
                await db.put('teams', team);
            }
            const tasks = await db.byScope(`profile:${id}`, 'task');
            for (const task of tasks) await db.del('items', task.id);
            for (const type of Object.keys(types)) {
                for (const item of await db.byScope(`personal:${id}`, type)) await db.del('items', item.id);
            }
            await db.del('profiles', id);
            const meta = await db.get('meta', 'session');
            if (meta && meta.profileId === id) await db.put('meta', { key: 'session', profileId: '' });
            return true;
        }],
        ['GET', /^session$/, async () => getSession()],
        ['POST', /^session$/, async (m, body) => {
            if (body.profileId !== undefined) {
                if (body.profileId && !(await db.get('profiles', body.profileId))) fail(404, 'Profile not found.');
                await db.put('meta', { key: 'session', profileId: body.profileId || '' });
            }
            if (body.teamId !== undefined) {
                const { profile } = await requireProfile();
                if (body.teamId) {
                    const team = await db.get('teams', body.teamId);
                    if (!team || !team.members.includes(profile.id)) fail(403, 'You are not a member of that team.');
                }
                profile.currentTeamId = body.teamId || '';
                await db.put('profiles', profile);
            }
            return getSession();
        }],
        ['GET', /^teams$/, async () => {
            const { profile } = await requireProfile();
            return (await db.all('teams')).filter(t => t.members.includes(profile.id)).sort((a, b) => a.name.localeCompare(b.name));
        }],
        ['POST', /^teams$/, async (m, body) => {
            const { profile } = await requireProfile();
            const name = `${body.name || ''}`.trim().substring(0, NAME_MAX);
            if (!tags.filterName(name)) fail(400, 'Enter a team name with at least one letter or digit.');
            let team = body.id ? await db.get('teams', body.id) : null;
            if (team && team.ownerId !== profile.id) fail(403, 'Only the team owner can change the team.');
            if (!team) team = { id: webui.uuid(), ownerId: profile.id, members: [profile.id], created: new Date().toISOString() };
            team.name = name;
            if (Array.isArray(body.members)) {
                const ids = new Set((await db.all('profiles')).map(p => p.id));
                team.members = Array.from(new Set([team.ownerId, ...body.members.filter(id => ids.has(id))]));
            }
            await db.put('teams', team);
            return team;
        }],
        ['POST', /^teams\/([\w-]+)\/leave$/, async (m) => {
            const { profile } = await requireProfile();
            const team = await db.get('teams', m[1]);
            if (!team || !team.members.includes(profile.id)) fail(404, 'Team not found.');
            if (team.ownerId === profile.id) fail(409, 'The owner cannot leave a team. Delete it instead.');
            team.members = team.members.filter(id => id !== profile.id);
            await db.put('teams', team);
            if (profile.currentTeamId === team.id) {
                profile.currentTeamId = '';
                await db.put('profiles', profile);
            }
            return true;
        }],
        ['DELETE', /^teams\/([\w-]+)$/, async (m) => {
            const { profile } = await requireProfile();
            const team = await db.get('teams', m[1]);
            if (!team) fail(404, 'Team not found.');
            if (team.ownerId !== profile.id) fail(403, 'Only the team owner can delete the team.');
            for (const type of Object.keys(types)) {
                for (const item of await db.byScope(`team:${team.id}`, type)) await db.del('items', item.id);
            }
            await db.del('teams', team.id);
            for (const p of await db.all('profiles')) {
                if (p.currentTeamId === team.id) { p.currentTeamId = ''; await db.put('profiles', p); }
            }
            return true;
        }],
        ['GET', /^tags$/, async () => {
            const session = await requireProfile();
            const found = new Set();
            for (const type of Object.keys(types)) {
                for (const item of await db.byScope(scopeFor(type, session), type)) item.tags.forEach(t => found.add(t));
            }
            return Array.from(found).sort();
        }],
        ['POST', /^items\/query$/, async (m, body) => {
            requireType(body.type);
            const session = await requireProfile();
            const wanted = body.tags || [];
            const items = await db.byScope(scopeFor(body.type, session), body.type);
            return items.filter(i => wanted.every(t => i.tags.includes(t))).sort((a, b) => a.sortId - b.sortId);
        }],
        ['POST', /^items\/(\w+)\/sort$/, async (m, body) => {
            const type = m[1];
            requireType(type);
            const session = await requireProfile();
            const scope = scopeFor(type, session);
            const items = await db.byScope(scope, type);
            const order = new Map((body.ids || []).map((id, i) => [id, i + 1]));
            items.forEach(i => { if (order.has(i.id)) i.sortId = order.get(i.id); });
            await db.putMany('items', items);
            return true;
        }],
        ['POST', /^items\/(\w+)$/, async (m, body) => {
            const type = m[1];
            const config = requireType(type);
            if (config.readOnly) fail(400, `${config.plural} cannot be saved after publishing.`);
            const session = await requireProfile();
            const scope = scopeFor(type, session);
            const existing = body.id ? await db.get('items', body.id) : null;
            if (existing && (existing.scope !== scope || existing.type !== type)) fail(404, `${config.label} not found.`);
            const item = cleanItem(type, body, existing);
            if (!item.name) fail(400, `Please enter a name for this ${config.label.toLowerCase()} before saving.`);
            if (config.prefix) {
                const own = tags.fromName(item.name, config.prefix);
                item.tags = tags.limitPrefix(item.tags.filter(t => !t.startsWith(config.prefix)), config.prefix);
                if (own) item.tags.unshift(own);
            }
            if (!item.tags.length) fail(400, `${config.plural} need at least one tag. Tags are used to help you organize and group together projects, problems, solutions, and tasks.`);
            if (config.shared) {
                item.tags = tags.limitPrefix(item.tags, 'person:');
                const me = personTag(session.profile);
                const owner = tags.owner(item.tags);
                if (!owner) item.tags.push(me);
                else if (config.ownerOnly && owner !== me) fail(403, config.ownerMessage);
                if (config.ownerOnly && existing) {
                    const previous = tags.owner(existing.tags);
                    if (previous && previous !== me && tags.owner(item.tags) !== me) fail(403, config.ownerMessage);
                }
            }
            item.scope = scope;
            if (!existing) item.sortId = (await db.byScope(scope, type)).length + 1;
            await db.put('items', item);
            return item;
        }],
        ['DELETE', /^items\/(\w+)\/([\w-]+)$/, async (m) => {
            const config = requireType(m[1]);
            const session = await requireProfile();
            const item = await db.get('items', m[2]);
            if (!item || item.type !== m[1] || item.scope !== scopeFor(m[1], session)) fail(404, `${config.label} not found.`);
            await db.del('items', item.id);
            return true;
        }],
        ['POST', /^stories\/preview$/, async (m, body) => buildStory(body, false)],
        ['POST', /^stories\/publish$/, async (m, body) => buildStory(body, true)],
    ];

    async function buildStory(body, save) {
        const session = await requireProfile();
        const problem = await db.get('items', body.problemId);
        if (!problem || problem.type !== 'problem' || problem.scope !== session.scope) fail(404, 'Problem not found.');
        const problemTag = tags.fromName(problem.name, 'problem:');
        const solutions = (await db.byScope(session.scope, 'solution'))
            .filter(s => s.tags.includes(problemTag))
            .sort((a, b) => a.sortId - b.sortId);
        const implemented = new Set(body.implemented || []);
        const storyTags = new Set(problem.tags);
        solutions.forEach(s => s.tags.forEach(t => storyTags.add(t)));
        const story = {
            id: webui.uuid(), type: 'story', name: problem.name, scope: session.scope, sortId: 0,
            created: new Date().toISOString(), updated: new Date().toISOString(),
            tags: Array.from(storyTags),
            publishedOwner: personTag(session.profile),
            problem: toMarkdown('problem', problem),
            integratedSolutions: solutions.filter(s => implemented.has(s.id)).map(s => toMarkdown('solution', s)).join('\n\n'),
            droppedSolutions: solutions.filter(s => !implemented.has(s.id)).map(s => toMarkdown('solution', s)).join('\n\n'),
        };
        if (!save) return { story, solutions };
        story.sortId = (await db.byScope(session.scope, 'story')).length + 1;
        await db.put('items', story);
        await db.del('items', problem.id);
        for (const s of solutions) await db.del('items', s.id);
        return { story, solutions };
    }

    async function request(method, path, body) {
        await webui.wait(LATENCY);
        const route = routes.find(([m, pattern]) => m === method && pattern.test(path));
        if (!route) throw new ApiError(404, `No simulated endpoint for ${method} ${path}.`);
        const result = await route[2](path.match(route[1]), clone(body) || {});
        return clone(result);
    }

    // Markdown export, from the legacy GetMarkdown methods.
    function toMarkdown(type, item) {
        const config = types[type];
        const date = v => v ? new Date(v).toDateString() : '';
        const title = type === 'story' ? `${item.name} - Published by ${item.publishedOwner}` : item.name;
        const lines = [
            `# ${title}`, '', '## Base Details', '',
            '| Name | Details |', '| --- | --- |',
            `| Name | ${item.name} |`,
            `| Owner | ${tags.owner(item.tags) || 'None'} |`,
            `| Tags | ${(item.tags || []).join(', ')} |`,
            `| Created | ${date(item.created)} |`,
            `| Last Update | ${date(item.updated)} |`,
        ];
        config.fields.forEach(f => {
            lines.push('', `## ${f.heading || f.label}`, '', item[f.key] || '');
        });
        return lines.join('\n').trim();
    }

    // Item text is user content that teammates also see, so the rendered HTML is sanitized, and custom elements,
    // form controls, styles, and data-* attributes are removed so it can't drive Web UI components or data binding.
    function renderMarkdown(text) {
        if (!text || !`${text}`.trim()) return '';
        if (!webui.markdown) return webui.escapeHtml(`${text}`);
        const html = webui.sanitize(webui.parseMarkdown(`${text}`));
        const template = document.createElement('template');
        template.innerHTML = html;
        template.content.querySelectorAll('*').forEach(el => {
            if (el.localName.includes('-') || ['form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'slot'].includes(el.localName)) {
                el.replaceWith(document.createTextNode(el.textContent));
                return;
            }
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('data-') || ['style', 'slot', 'id', 'class', 'is'].includes(attr.name)) el.removeAttribute(attr.name);
            });
            if (el.localName === 'a') {
                el.setAttribute('rel', 'noopener noreferrer');
                el.setAttribute('target', '_blank');
            }
        });
        return template.innerHTML;
    }

    // Events -------------------------------------------------------------------
    const bus = new EventTarget();
    function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
    function on(name, handler) {
        const fn = ev => handler(ev.detail);
        bus.addEventListener(name, fn);
        return () => bus.removeEventListener(name, fn);
    }

    // Tag filter shared by every manager on a page, kept in session data like the legacy session state.
    const filter = {
        get() {
            const value = webui.getData(FILTER_KEY);
            return Array.isArray(value) ? value.slice() : [];
        },
        set(list) {
            const next = Array.from(new Set((list || []).map(t => tags.filterName(t)).filter(Boolean)));
            if (webui.isEqual(next, filter.get())) return;
            webui.setData(FILTER_KEY, next);
            emit('filter', next);
        },
        add(tag) {
            tag = tags.filterName(tag);
            if (!tag) return;
            let list = filter.get();
            const prefix = tags.prefixOf(tag);
            if (prefix) list = list.filter(t => !t.startsWith(prefix));
            else if (list.includes(tag)) return;
            list.push(tag);
            filter.set(list);
        },
        remove(tag) { filter.set(filter.get().filter(t => t !== tag)); },
        toggle(tag) { filter.get().includes(tag) ? filter.remove(tag) : filter.add(tag); },
        has(tag) { return filter.get().includes(tag); },
        quick() {
            const value = webui.getData(QUICK_KEY);
            return value && typeof value === 'object' ? Object.assign({}, value) : {};
        },
        setQuick(key, value) {
            const quick = filter.quick();
            quick[key] = `${value || ''}`.trim();
            webui.setData(QUICK_KEY, quick);
            emit('quick', quick);
        },
    };

    let sessionCache = null;
    const taskStory = {
        types, typeOrder, prefixes, tags, filter, on, emit, toMarkdown, renderMarkdown, ApiError,
        api: { request },
        async session(refresh) {
            if (!sessionCache || refresh) sessionCache = request('GET', 'session');
            try {
                return await sessionCache;
            } catch (ex) {
                sessionCache = null;
                throw ex;
            }
        },
        async setSession(change) {
            sessionCache = null;
            const session = await request('POST', 'session', change);
            sessionCache = Promise.resolve(session);
            emit('session', session);
            return session;
        },
        sessionChanged() {
            sessionCache = null;
            return taskStory.session(true).then(session => { emit('session', session); return session; });
        },
        personTag,
        // Turns API errors into a readable message for alerts.
        message(ex, fallback) {
            if (ex && ex.message) return ex.message;
            return fallback || 'Something went wrong.';
        },
    };
    window.taskStory = taskStory;

    webui.define('app-store', {
        connected() {
            this.style.display = 'none';
        }
    });
}
