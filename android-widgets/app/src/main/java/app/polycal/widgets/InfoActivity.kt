package app.polycal.widgets

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Sideload landing screen so the APK is visible in the launcher. */
class InfoActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_info)
        findViewById<TextView>(R.id.info_host).text = WidgetUrls.sanitizeBaseUrl(
            BuildConfig.POLYCAL_BASE_URL,
        )
    }
}
