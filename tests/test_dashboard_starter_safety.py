import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY_STARTERS = (
    'Open_Dashboard.bat',
    'Start_All_5_Terminals_and_Cockpit.bat',
    'Start_Remote_Cockpit.bat',
    'Start_Titan_Cockpit.bat',
    'service_supervisor.ps1',
)
LEGACY_STOPPERS = ('Stop_Remote_Cockpit.bat', 'Stop_Titan_Cockpit.bat')


class DashboardStarterSafetyTests(unittest.TestCase):
    def test_legacy_starters_do_not_embed_credentials_or_direct_start_app(self):
        for relative in LEGACY_STARTERS:
            with self.subTest(starter=relative):
                source = (ROOT / relative).read_text(encoding='utf-8', errors='replace')
                self.assertNotRegex(source, r'(?im)^\s*set\s+DASHBOARD_PROXY_SECRET\s*=')
                self.assertNotRegex(source, r'(?im)^\s*\$env:DASHBOARD_PROXY_SECRET\s*=')
                self.assertNotIn('TitanGold', source)
                self.assertNotRegex(source, r'(?im)^\s*echo\s+(?:password|passwort)\s*:')
                self.assertNotRegex(source, r'(?i)(?:python|PYTHON_CMD)[^\r\n]*\bapp\.py\b')

    def test_legacy_starters_delegate_to_guarded_runtime_and_never_autosync(self):
        for relative in LEGACY_STARTERS:
            with self.subTest(starter=relative):
                source = (ROOT / relative).read_text(encoding='utf-8', errors='replace')
                if relative in ('Start_All_5_Terminals_and_Cockpit.bat', 'Start_Remote_Cockpit.bat', 'Start_Titan_Cockpit.bat'):
                    self.assertIn('Open_Dashboard.bat', source)
                else:
                    self.assertIn('dashboard_runtime.ps1', source)
                    self.assertIn('PrivateEnvJson', source)
                self.assertNotIn('auto_sync_github.py', source)
                self.assertNotRegex(source, r'(?i)git\s+pull')

    def test_legacy_stoppers_refuse_unscoped_process_termination(self):
        for relative in LEGACY_STOPPERS:
            with self.subTest(stopper=relative):
                source = (ROOT / relative).read_text(encoding='utf-8', errors='replace')
                self.assertIn('disabled', source)
                self.assertNotIn('taskkill', source.casefold())
                self.assertNotIn('Stop-Process', source)
                self.assertNotIn('8050', source)

    def test_guarded_launcher_requires_the_main_checkout_and_private_config(self):
        source = (ROOT / 'scripts/ensure_dashboard_runtime.ps1').read_text(encoding='utf-8')
        self.assertIn("$branch -cne 'main'", source)
        self.assertIn("'.dashboard-env.json'", source)
        self.assertIn('scripts/dashboard_runtime.ps1', source)

    def test_runtime_restart_defaults_to_the_private_environment_file(self):
        source = (ROOT / 'scripts/dashboard_runtime.ps1').read_text(encoding='utf-8')
        self.assertRegex(source, r"\[string\]\$PrivateEnvJson\s*=\s*\(Join-Path\s+\$env:USERPROFILE\s+'\.dashboard-env\.json'\)")

    def test_guarded_launcher_accepts_running_runtime_status_without_status_field(self):
        source = (ROOT / 'scripts/ensure_dashboard_runtime.ps1').read_text(encoding='utf-8')
        self.assertIn("$status.PSObject.Properties['status']", source)
        self.assertIn("$status.PSObject.Properties['pid']", source)
        self.assertIn('restart_required', source)

    def test_desktop_launcher_resolves_the_managed_main_checkout(self):
        source = (ROOT / 'Open_Dashboard.bat').read_text(encoding='utf-8')
        self.assertIn(r'%USERPROFILE%\.codex\worktrees\open-tasks-delivery\testing', source)
        self.assertIn('ensure_dashboard_runtime.ps1', source)

    def test_supervisor_tracks_the_retry_owner_not_transient_ssh_child(self):
        source = (ROOT / 'service_supervisor.ps1').read_text(encoding='utf-8')
        self.assertIn('start_stt_tunnel.ps1', source)
        self.assertIn("Name -in @('powershell.exe','pwsh.exe')", source)
        self.assertNotIn("Name = 'ssh.exe'", source)

    def test_live_supervisor_and_reconnecting_tunnel_target_main_runtime_port(self):
        supervisor = (ROOT / 'service_supervisor.ps1').read_text(encoding='utf-8')
        tunnel = (ROOT / 'start_stt_tunnel.ps1').read_text(encoding='utf-8')
        self.assertIn('-Port 8056', supervisor)
        self.assertIn("'-BackendPort','8056'", supervisor)
        self.assertIn('[int]$BackendPort = 8056', tunnel)
        self.assertIn('8055:127.0.0.1:$BackendPort', tunnel)
        self.assertNotRegex(tunnel, r'8055:127\.0\.0\.1:8050\b')


if __name__ == '__main__':
    unittest.main()
