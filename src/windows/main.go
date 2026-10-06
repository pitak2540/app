// ตัวเปิดโปรแกรม 90S Thai ROM Studio: แตกหน้าโปรแกรมที่ฝังไว้ แล้วเปิดเป็นหน้าต่างแอปด้วย Edge หรือ Chrome
package main

import (
	_ "embed"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed app.html
var page []byte

func main() {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "90S Thai ROM Studio")
	os.MkdirAll(dir, 0o755)
	file := filepath.Join(dir, "90S Thai ROM Studio.html")
	if err := os.WriteFile(file, page, 0o644); err != nil {
		dir = os.TempDir()
		file = filepath.Join(dir, "90S Thai ROM Studio.html")
		os.WriteFile(file, page, 0o644)
	}
	u := (&url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(file)}).String()
	roots := []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")}
	apps := []string{`Microsoft\Edge\Application\msedge.exe`, `Google\Chrome\Application\chrome.exe`}
	for _, a := range apps {
		for _, r := range roots {
			if r == "" {
				continue
			}
			exe := filepath.Join(r, a)
			if _, err := os.Stat(exe); err == nil {
				cmd := exec.Command(exe, "--app="+u, "--user-data-dir="+filepath.Join(dir, "profile"),
					"--window-size=1280,880", "--no-first-run", "--no-default-browser-check")
				if cmd.Start() == nil {
					return
				}
			}
		}
	}
	exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}
