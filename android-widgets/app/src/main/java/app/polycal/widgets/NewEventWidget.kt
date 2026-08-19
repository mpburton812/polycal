package app.polycal.widgets

/** Homescreen widget: one-line title → New Event composer. */
class NewEventWidget : ComposeAppWidget() {
    override val mode = WidgetUrls.MODE_EVENT
    override val layoutRes = R.layout.widget_new_event
    override val headerId = R.id.widget_header
    override val inputId = R.id.widget_input
    override val sendId = R.id.widget_send
    override val rootId = R.id.widget_root
}
