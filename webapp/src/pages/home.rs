use crate::prelude::*;

pub(crate) fn page_index(contexts: Contexts) -> Html {
    push_state("/agile-project-management");
    page_home(contexts)
}

/// App home page
pub(crate) fn page_home(_contexts: Contexts) -> Html {
    set_title("Agile Project Management");
    html! {
        <>
            <MarkdownContent href="/d/en-US/home.md" />
            <NextPageButton url="/about" />
        </>
    }
}
