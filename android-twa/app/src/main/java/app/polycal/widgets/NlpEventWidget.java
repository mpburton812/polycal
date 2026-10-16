package app.polycal.widgets;

import app.polycal.R;

/** Home-screen NLP compose bar (PC-479). */
public class NlpEventWidget extends ComposeAppWidget {
    @Override
    String mode() {
        return WidgetUrls.MODE_NLP;
    }

    @Override
    int layoutRes() {
        return R.layout.widget_compose;
    }

    @Override
    int headerLabelRes() {
        return R.string.widget_nlp_label;
    }

    @Override
    int hintRes() {
        return R.string.widget_nlp_hint;
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
