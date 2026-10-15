package com.onilibrary.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Minimal FileProvider replacement (no AndroidX dependency — the APK build
 * compiles against android.jar only). Serves files written to
 * {cacheDir}/share/* under content://com.onilibrary.app.share/<name>
 * so the system share sheet can attach exported CSV / backup files.
 * Strictly flat: only a single file name segment, no path traversal.
 */
public class ShareProvider extends ContentProvider {
    public static final String AUTH = "com.onilibrary.app.share";
    private static final String[] COLUMNS = {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f = fileFor(uri);
        String[] cols = projection != null ? projection : COLUMNS;
        MatrixCursor c = new MatrixCursor(cols);
        if (f != null && f.exists()) {
            Object[] row = new Object[cols.length];
            for (int i = 0; i < cols.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
                else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
                else row[i] = null;
            }
            c.addRow(row);
        }
        return c;
    }

    @Override
    public String getType(Uri uri) {
        File f = fileFor(uri);
        String n = f != null ? f.getName() : "";
        String ext = n.contains(".") ? n.substring(n.lastIndexOf('.') + 1).toLowerCase() : "";
        if (ext.equals("csv")) return "text/csv";
        if (ext.equals("json")) return "application/json";
        if (ext.equals("txt")) return "text/plain";
        return "application/octet-stream";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (f == null || !f.exists()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    private File fileFor(Uri uri) {
        String path = uri.getPath();
        if (path == null) return null;
        String name = path.startsWith("/") ? path.substring(1) : path;
        if (name.isEmpty() || name.contains("/") || name.contains("\\")) return null;
        if (name.equals(".") || name.equals("..") || name.contains("..")) return null;
        File dir = new File(getContext().getCacheDir(), "share");
        File f = new File(dir, name);
        try {
            String canonicalDir = dir.getCanonicalPath() + File.separator;
            if (!f.getCanonicalPath().startsWith(canonicalDir)) return null;
        } catch (IOException ignored) {
            return null;
        }
        return f;
    }
}
