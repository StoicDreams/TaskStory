/* The opening section of a landing page: the content (a heading, a short pitch, and buttons) beside an image.
 * <app-hero image="/img/screenshots/dashboard.png" alt="The Task Story dashboard">
 *     # Heading
 *     Pitch
 *     <webui-flex gap="2" wrap><webui-button theme="primary" href="/dashboard">Try It Free</webui-button></webui-flex>
 * </app-hero>
 * The image sits beside the content on wide screens and below it on narrow ones. A candidate for MyFiCDN as webui-hero.
 */
"use strict"
{
    webui.define('app-hero', {
        attr: ['image', 'alt'],
        constructor() {
            const t = this;
            t._image = t.template.querySelector('img');
            t._figure = t.template.querySelector('.image');
        },
        attrChanged(property, value) {
            const t = this;
            switch (property) {
                case 'image':
                    if (value) t._image.setAttribute('src', value);
                    else t._image.removeAttribute('src');
                    t._figure.style.display = value ? '' : 'none';
                    break;
                case 'alt':
                    t._image.setAttribute('alt', value || '');
                    break;
            }
        },
        shadowTemplate: `
<section>
<div class="content"><slot></slot></div>
<div class="image" style="display:none"><img alt="" loading="eager" decoding="async" /></div>
</section>
<style type="text/css">
:host { display:block; margin-bottom:calc(var(--padding, 0.5rem) * 4); }
section { display:grid; grid-template-columns:minmax(0, 5fr) minmax(0, 7fr); gap:calc(var(--padding, 0.5rem) * 4); align-items:center; padding:calc(var(--padding, 0.5rem) * 3) 0; }
.content { display:flex; flex-direction:column; gap:var(--padding, 0.5rem); }
::slotted(h1) { font-size:clamp(2rem, 1.2rem + 2.6vw, 3.25rem); line-height:1.1; margin:0 0 0.5rem 0; padding:0; text-indent:0; color:var(--color-title); }
::slotted(p) { font-size:1.15em; line-height:1.5; margin:0; }
img { display:block; width:100%; height:auto; border-radius:var(--corners, 4px); box-shadow:0 0.5rem 2rem rgba(0, 0, 0, 0.45); border:1px solid color-mix(in srgb, currentColor 20%, transparent); }
@media (max-width: 900px) {
section { grid-template-columns:minmax(0, 1fr); gap:calc(var(--padding, 0.5rem) * 3); padding-top:var(--padding, 0.5rem); }
}
</style>
`
    });
}
