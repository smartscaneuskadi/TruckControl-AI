package com.truckcontrolai.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Opens the existing application in the user's browser without a JavaScript bridge. */
public final class TruckControlActivity extends LauncherActivity {
    @Override
    protected void onCreate(Bundle state) {
        Intent original = getIntent();
        Intent safe = new Intent(this, TruckControlActivity.class);
        safe.setAction(Intent.ACTION_MAIN.equals(original.getAction())
            ? Intent.ACTION_MAIN : Intent.ACTION_VIEW);
        String incoming = original.getDataString();
        if (incoming != null) {
            safe.setData(Uri.parse(LaunchPolicy.allows(incoming) ? incoming : LaunchPolicy.HOME));
        }
        // Drop arbitrary extras, selectors, ClipData and file permission grants.
        safe.setFlags(original.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK);
        setIntent(safe);
        super.onCreate(state);
    }

    @Override
    protected Uri getLaunchingUrl() {
        String value = getIntent().getDataString();
        return Uri.parse(LaunchPolicy.allows(value) ? value : LaunchPolicy.HOME);
    }
}
