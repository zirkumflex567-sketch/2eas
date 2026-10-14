"""
Automatic GitHub Sync Service for 2EAs Trading Cockpit
Monitors git repository (origin/main) and automatically pulls updates,
recompiles modified MQL5 files, and reloads the webserver.
"""
import os
import sys
import time
import subprocess
import logging
from pathlib import Path

BASE_DIR = Path(r"c:\Users\zirku\Downloads\testing")
LOG_FILE = BASE_DIR / "auto_sync.log"

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
console = logging.StreamHandler(sys.stdout)
console.setLevel(logging.INFO)
logging.getLogger("").addHandler(console)

def run_cmd(cmd, cwd=BASE_DIR, timeout=30):
    try:
        r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout, shell=False)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception as ex:
        return -1, "", str(ex)

def restart_app():
    logging.info("Anderung an app.py/static erkannt. Starte Webserver auf Port 8050 neu...")
    # Find any running process on port 8050
    code, stdout, _ = run_cmd(["netstat", "-ano"])
    pids = set()
    for line in stdout.splitlines():
        if "127.0.0.1:8050" in line and "0.0.0.0:0" in line:
            parts = line.strip().split()
            if len(parts) >= 5:
                pids.add(parts[-1])
    for pid in pids:
        try:
            logging.info(f"Beende bestehenden Webserver PID {pid}...")
            subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
        except Exception:
            pass
    time.sleep(1)

    py_exe = "python"
    if os.path.exists(r"C:\Python314\python.exe"):
        py_exe = r"C:\Python314\python.exe"

    ps_cmd = f"Start-Process '{py_exe}' -ArgumentList 'app.py' -WorkingDirectory '{BASE_DIR}' -WindowStyle Minimized"
    subprocess.run(["powershell.exe", "-NoProfile", "-Command", ps_cmd], capture_output=True)
    logging.info("app.py erfolgreich via Start-Process neu gestartet.")

def recompile_mql5(mq5_path):
    editor = r"C:\Program Files\PU Prime MT5 Terminal\metaeditor64.exe"
    if not os.path.exists(editor):
        return
    log_file = BASE_DIR / "compile_auto.log"
    logging.info(f"Kompiliere aktualisierten EA {mq5_path.name}...")
    run_cmd([editor, f"/compile:{str(mq5_path)}", f"/log:{str(log_file)}"])
    ex5_path = mq5_path.with_suffix(".ex5")
    if ex5_path.exists():
        logging.info(f"Kompilierung {ex5_path.name} erfolgreich.")
        # Sync to all MT5 instances
        terminals_dir = Path(os.path.expanduser(r"~\AppData\Roaming\MetaQuotes\Terminal"))
        if terminals_dir.exists():
            for t in terminals_dir.iterdir():
                exp = t / "MQL5" / "Experts"
                if exp.exists():
                    try:
                        import shutil
                        shutil.copy2(str(ex5_path), str(exp / ex5_path.name))
                    except Exception:
                        pass
        # Sync to goldm5 demo
        gold_exp = Path(r"C:\Users\zirku\Documents\goldm5\.mt5-demo\MQL5\Experts")
        if gold_exp.exists():
            try:
                import shutil
                shutil.copy2(str(ex5_path), str(gold_exp / ex5_path.name))
            except Exception:
                pass

def sync_cycle():
    # Only sync automatically if on 'main' branch
    code_br, cur_br, _ = run_cmd(["git", "branch", "--show-current"])
    if cur_br != "main":
        return False

    # 1. Fetch
    code, _, err = run_cmd(["git", "fetch", "origin", "main"])
    if code != 0:
        return False

    # 2. Compare HEAD vs origin/main
    code1, head, _ = run_cmd(["git", "rev-parse", "HEAD"])
    code2, remote, _ = run_cmd(["git", "rev-parse", "origin/main"])
    if code1 == 0 and code2 == 0 and head != remote:
        logging.info(f"Neuer Commit auf GitHub entdeckt: {remote[:7]} (Aktuell lokal: {head[:7]})")
        
        _, diff_names, _ = run_cmd(["git", "diff", "--name-only", "HEAD", "origin/main"])
        changed_files = diff_names.splitlines()
        
        code_s, status_out, _ = run_cmd(["git", "status", "--porcelain"])
        is_dirty = bool(status_out.strip())
        
        stashed = False
        if is_dirty:
            code_stash, _, _ = run_cmd(["git", "stash", "push", "-m", "auto_sync_stash"])
            stashed = (code_stash == 0)

        code_pull, pull_out, pull_err = run_cmd(["git", "pull", "--rebase=false", "origin", "main"])
        
        if stashed:
            code_pop, pop_out, pop_err = run_cmd(["git", "stash", "pop"])
            if code_pop != 0:
                logging.error(f"Warnung: Konflikt beim Wiederherstellen lokaler Anderungen: {pop_err}")

        if code_pull == 0:
            logging.info(f"GitHub Pull erfolgreich: {remote[:7]}")
            
            needs_restart = any(f.endswith(".py") or f.startswith("static/") for f in changed_files)
            if needs_restart:
                restart_app()

            for f in changed_files:
                if f.endswith(".mq5") and (BASE_DIR / f).exists():
                    recompile_mql5(BASE_DIR / f)
            return True
        else:
            logging.error(f"Git pull fehlgeschlagen: {pull_err}")
    return False

def main():
    logging.info("Auto-Sync Dienst aktiv. Prüfe origin/main alle 10 Sekunden...")
    while True:
        try:
            sync_cycle()
        except Exception as e:
            logging.error(f"Fehler in Sync-Schleife: {e}")
        time.sleep(10)

if __name__ == "__main__":
    main()
