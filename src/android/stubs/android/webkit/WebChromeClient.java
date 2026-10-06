package android.webkit;
public class WebChromeClient {
  public static abstract class FileChooserParams { public abstract int getMode(); }
  public boolean onShowFileChooser(WebView w, ValueCallback<android.net.Uri[]> cb, FileChooserParams p) { return false; }
}
