package com.anttree.opensheet;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Storage Access Framework bridge:
 * - saveDocument: ACTION_CREATE_DOCUMENT ("Save As" to any folder, no permission).
 * - openDocument: ACTION_OPEN_DOCUMENT, keeping a *persistable* read permission so
 *   the file can be re-read later (Recent files → always the current contents).
 * - readDocument: re-read a previously opened document by its persisted URI.
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

    @PluginMethod
    public void openDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.ms-excel",
                "text/csv",
                "text/comma-separated-values",
                "application/octet-stream"
        });
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "onOpenResult");
    }

    @ActivityCallback
    private void onOpenResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null
                || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = result.getData().getData();
        // Keep read access across app restarts so Recent files can re-read it.
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
        }
        try {
            byte[] bytes = readAll(getContext().getContentResolver().openInputStream(uri));
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            ret.put("name", queryName(uri));
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Open failed: " + e.getLocalizedMessage(), e);
        }
    }

    @PluginMethod
    public void readDocument(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("Missing uri");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            byte[] bytes = readAll(getContext().getContentResolver().openInputStream(uri));
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getLocalizedMessage(), e);
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        if (in == null) {
            throw new Exception("Could not open input stream");
        }
        try (InputStream input = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = input.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    private String queryName(Uri uri) {
        String name = "workbook.xlsx";
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String display = c.getString(idx);
                    if (display != null && !display.isEmpty()) {
                        name = display;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return name;
    }
}
