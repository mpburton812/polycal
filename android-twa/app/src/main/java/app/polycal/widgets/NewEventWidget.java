package app.polycal.widgets;

import app.polycal.R;

/** Home-screen New Event title bar (PC-479). */
public class NewEventWidget extends ComposeAppWidget {
    @Override
    String mode() {
        return WidgetUrls.MODE_EVENT;
    }

    @Override
    int layoutRes() {
        return R.layout.widget_new_event;
    }

    @Override
    int headerId() {
        return R.id.widget_header;
    }

    @Override
    int inputId() {
        return R.id.widget_input;
    }

    @Override
    int sendId() {
        return R.id.widget_send;
    }

    @Override
    int rootId() {
        return R.id.widget_root;
    }
}
