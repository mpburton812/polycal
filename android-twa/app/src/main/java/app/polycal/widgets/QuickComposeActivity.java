package app.polycal.widgets;

import android.app.Activity;
import android.os.Bundle;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import app.polycal.R;

/**
 * One-line capture sheet used because launcher widget EditTexts rarely deliver IME text.
 * Send launches the matching compose URL inside the TWA, then finishes (PC-479).
 */
public class QuickComposeActivity extends Activity {
    public static final String EXTRA_MODE = "app.polycal.widgets.MODE";
    public static final String EXTRA_SKIP_INPUT = "app.polycal.widgets.SKIP_INPUT";
    public static final String EXTRA_PREFILL = "app.polycal.widgets.PREFILL";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String mode = getIntent().getStringExtra(EXTRA_MODE);
        if (mode == null) {
            mode = WidgetUrls.MODE_EVENT;
        }
        boolean skipInput = getIntent().getBooleanExtra(EXTRA_SKIP_INPUT, false);
        String prefill = getIntent().getStringExtra(EXTRA_PREFILL);
        if (prefill == null) {
            prefill = "";
        }
        if (skipInput) {
            WidgetUrls.launchComposer(this, mode, prefill);
            finish();
            return;
        }

        setContentView(R.layout.activity_quick_compose);
        TextView titleView = findViewById(R.id.quick_title);
        EditText field = findViewById(R.id.quick_input);
        ImageButton send = findViewById(R.id.quick_send);
        boolean isNlp = WidgetUrls.MODE_NLP.equals(mode);
        titleView.setText(getString(isNlp ? R.string.widget_nlp_label : R.string.widget_new_event_label));
        field.setHint(getString(isNlp ? R.string.widget_nlp_hint : R.string.widget_new_event_hint));
        field.setContentDescription(field.getHint());
        field.setText(prefill);
        field.setSelection(field.getText().length());
        field.requestFocus();

        final String composeMode = mode;
        Runnable submit = () -> {
            WidgetUrls.launchComposer(this, composeMode, field.getText().toString());
            finish();
        };
        send.setOnClickListener((v) -> submit.run());
        field.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND || actionId == EditorInfo.IME_ACTION_DONE) {
                submit.run();
                return true;
            }
            return false;
        });
    }
}
