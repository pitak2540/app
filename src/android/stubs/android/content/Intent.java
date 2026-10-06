package android.content;
public class Intent {
  public Intent(String a) {}
  public Intent(String a, android.net.Uri u) {}
  public Intent addCategory(String c) { return this; }
  public Intent setType(String t) { return this; }
  public android.net.Uri getData() { return null; }
  public ClipData getClipData() { return null; }
  public Intent putExtra(String k, boolean v) { return this; }
  public static Intent createChooser(Intent i, CharSequence t) { return null; }
}
