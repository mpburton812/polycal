# Keep TWA entry points and home-screen widgets (manifest-referenced receivers
# are usually kept, but helpers and UpdateChecker were renamed under R8).
-keep class app.polycal.LauncherActivity { *; }
-keep class app.polycal.Application { *; }
-keep class app.polycal.UpdateChecker { *; }
-keep class app.polycal.UpdateChecker$* { *; }
-keep class app.polycal.widgets.** { *; }

# AppWidgetProvider subclasses must keep public no-arg constructors.
-keepclassmembers class * extends android.appwidget.AppWidgetProvider {
    public <init>();
}
