package app.polycal.widgets

/** Homescreen widget: one-line description → New Event (NLP Input) composer. */
class NlpEventWidget : ComposeAppWidget() {
    override val mode = WidgetUrls.MODE_NLP
    override val layoutRes = R.layout.widget_nlp_event
    override val headerId = R.id.widget_header
    override val inputId = R.id.widget_input
    override val sendId = R.id.widget_send
    override val rootId = R.id.widget_root
}
