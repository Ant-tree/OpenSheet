package com.anttree.opensheet;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins before super.onCreate so the bridge finds them.
        registerPlugin(SafSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
