package com.game90s.romstudio;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
  static final String FOLDER = "90S Thai ROM Studio";
  ValueCallback<Uri[]> pending;
  OutputStream out;
  String where = "";

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 29)
      requestPermissions(new String[] { "android.permission.WRITE_EXTERNAL_STORAGE" }, 2);
    WebView w = new WebView(this);
    WebSettings s = w.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowFileAccessFromFileURLs(true);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(true);
    s.setTextZoom(100);
    w.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (pending != null) pending.onReceiveValue(null);
        pending = cb;
        Intent i = new Intent("android.intent.action.GET_CONTENT");
        i.addCategory("android.intent.category.OPENABLE");
        i.setType("*/*");
        if (p != null && p.getMode() == 1) i.putExtra("android.intent.extra.ALLOW_MULTIPLE", true);
        try { startActivityForResult(Intent.createChooser(i, "เลือกไฟล์"), 1); }
        catch (Exception e) { pending = null; cb.onReceiveValue(null); }
        return true;
      }
    });
    w.addJavascriptInterface(this, "AndroidBridge");
    setContentView(w);
    w.loadUrl("file:///android_asset/index.html");
  }

  @Override protected void onActivityResult(int req, int res, Intent data) {
    if (req != 1 || pending == null) return;
    Uri[] r = null;
    if (res == RESULT_OK && data != null) {
      android.content.ClipData c = data.getClipData();
      if (c != null && c.getItemCount() > 0) { r = new Uri[c.getItemCount()]; for (int k = 0; k < r.length; k++) r[k] = c.getItemAt(k).getUri(); }
      else if (data.getData() != null) r = new Uri[] { data.getData() };
    }
    pending.onReceiveValue(r);
    pending = null;
  }

  /* บันทึกไฟล์ลงโฟลเดอร์ Download ทีละก้อน: begin -> write... -> end  (คืน "" เมื่อสำเร็จ) */
  @JavascriptInterface public String begin(String name) {
    try {
      if (out != null) { try { out.close(); } catch (Exception e) {} out = null; }
      name = name.replace('/', '-').replace('\\', '-');
      if (Build.VERSION.SDK_INT >= 29) {
        ContentValues v = new ContentValues();
        v.put("_display_name", name);
        v.put("mime_type", "application/octet-stream");
        v.put("relative_path", "Download/" + FOLDER);
        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (u == null) return "สร้างไฟล์ในโฟลเดอร์ Download ไม่ได้";
        out = getContentResolver().openOutputStream(u);
        where = "Download/" + FOLDER + "/" + name;
      } else {
        File f;
        try {
          File d = new File(Environment.getExternalStoragePublicDirectory("Download"), FOLDER);
          d.mkdirs(); f = new File(d, name); out = new FileOutputStream(f);
        } catch (Exception e) {
          f = new File(getExternalFilesDir(null), name); out = new FileOutputStream(f);
        }
        where = f.getAbsolutePath();
      }
      return "";
    } catch (Exception e) { out = null; return String.valueOf(e.getMessage()); }
  }

  @JavascriptInterface public String write(String b64) {
    try { out.write(Base64.decode(b64, 0)); return ""; }
    catch (Exception e) { return String.valueOf(e.getMessage()); }
  }

  @JavascriptInterface public void openUrl(String url) {
    try { if (url.startsWith("https://")) startActivity(new Intent("android.intent.action.VIEW", Uri.parse(url))); } catch (Exception e) {}
  }

  @JavascriptInterface public String end() {
    try { out.close(); } catch (Exception e) {}
    out = null;
    return where;
  }
}
