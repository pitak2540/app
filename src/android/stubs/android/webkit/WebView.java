package android.webkit;
public class WebView extends android.view.View {
  public WebView(android.content.Context c) {}
  public WebSettings getSettings() { return null; }
  public void setWebChromeClient(WebChromeClient c) {}
  public void addJavascriptInterface(Object o, String n) {}
  public void loadUrl(String u) {}
  public boolean canGoBack() { return false; }
}
