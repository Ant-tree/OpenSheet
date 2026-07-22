package com.anttree.opensheet;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Saves bytes to a location the user picks, via the Storage Access Framework
 * (ACTION_CREATE_DOCUMENT). This is the reliable "Save As" on all Android
 * versions: the system dialog lets the user name the file and choose Downloads
 * or any folder, with no storage permission required.
 */
@CapacitorPlugin(name = "SafSaver")
public class SafSaverPlugin extends Plugin {

    private byte[] pendingBytes;

    @PluginMethod
    public void saveDocument(PluginCall call) {
        String base64 = call.getString("data");
        String filename = call.getString("filename", "workbook.xlsx");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (base64 == null) {
            call.reject("Missing data");
            return;
        }
        pendingBytes = Base64.decode(base64, Base64.DEFAULT);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        byte[] bytes = pendingBytes;
        pendingBytes = null;
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null
                || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        Uri uri = result.getData().getData();
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) {
                call.reject("Could not open output stream");
                return;
            }
            out.write(bytes != null ? bytes : new byte[0]);
            out.flush();
            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Write failed: " + e.getLocalizedMessage(), e);
        }
    }
}
