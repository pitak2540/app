package android.app;
public class Activity extends android.content.Context {
  public static final int RESULT_OK = -1;
  protected void onCreate(android.os.Bundle b) {}
  protected void onActivityResult(int a, int b, android.content.Intent c) {}
  public void setContentView(android.view.View v) {}
  public void startActivityForResult(android.content.Intent i, int c) {}
  public android.content.ContentResolver getContentResolver() { return null; }
  public java.io.File getExternalFilesDir(String t) { return null; }
  public void requestPermissions(String[] p, int c) {}
  public void onBackPressed() {}
  public void startActivity(android.content.Intent i) {}
}
