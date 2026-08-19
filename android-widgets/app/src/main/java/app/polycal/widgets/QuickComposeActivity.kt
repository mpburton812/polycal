package app.polycal.widgets

import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * One-line capture sheet used because launcher widget EditTexts rarely deliver IME text.
 * Send (empty or not) launches the matching compose URL in Custom Tabs, then finishes.
 */
class QuickComposeActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mode = intent.getStringExtra(EXTRA_MODE) ?: WidgetUrls.MODE_EVENT
        val skipInput = intent.getBooleanExtra(EXTRA_SKIP_INPUT, false)
        val prefill = intent.getStringExtra(EXTRA_PREFILL).orEmpty()
        if (skipInput) {
            WidgetUrls.launchComposer(this, mode, prefill)
            finish()
            return
        }

        setContentView(R.layout.activity_quick_compose)
        val titleView = findViewById<TextView>(R.id.quick_title)
        val field = findViewById<EditText>(R.id.quick_input)
        val send = findViewById<ImageButton>(R.id.quick_send)
        val isNlp = mode == WidgetUrls.MODE_NLP
        titleView.text = getString(
            if (isNlp) R.string.widget_nlp_label else R.string.widget_new_event_label,
        )
        field.hint = getString(
            if (isNlp) R.string.widget_nlp_hint else R.string.widget_new_event_hint,
        )
        field.contentDescription = field.hint
        field.setText(prefill)
        field.setSelection(field.text.length)
        field.requestFocus()

        fun submit() {
            WidgetUrls.launchComposer(this, mode, field.text.toString())
            finish()
        }

        send.setOnClickListener { submit() }
        field.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND || actionId == EditorInfo.IME_ACTION_DONE) {
                submit()
                true
            } else {
                false
            }
        }
    }

    companion object {
        const val EXTRA_MODE = "app.polycal.widgets.MODE"
        const val EXTRA_SKIP_INPUT = "app.polycal.widgets.SKIP_INPUT"
        const val EXTRA_PREFILL = "app.polycal.widgets.PREFILL"
    }
}
