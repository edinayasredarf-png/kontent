"""Exercise deployment failure/rollback behavior without touching Docker or VPS."""
import gzip
import os
from pathlib import Path
import subprocess
import shlex
import tempfile
import unittest

SHA = "b" * 40
OLD_SHA = "a" * 40
SOURCE = Path(__file__).with_name("deploy.sh")


class DeploymentTest(unittest.TestCase):
    def exercise(self, scenario="success", command=None, runtime=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "state"
            base.mkdir()
            binaries = root / "bin"
            binaries.mkdir()
            upstream = root / "upstream.conf"
            upstream.write_text("OLD UPSTREAM\n")
            (base / "active-slot").write_text("blue\n")
            (base / "active-sha").write_text(OLD_SHA + "\n")
            (base / "activated").touch()
            if runtime:
                (base / "runtime.env").write_text("DATABASE_URL=test\n")
            log = root / "docker.log"
            mock = binaries / "docker"
            mock.write_text("""#!/usr/bin/env python3
import os,sys
from pathlib import Path
a=sys.argv[1:]
with open(os.environ['MOCK_LOG'],'a') as f: f.write(' '.join(a)+'\\n')
scenario=os.environ['MOCK_SCENARIO']
if a[:2]==['image','inspect']: print(os.environ['MOCK_SHA'])
if a[:2]==['image','ls']:
    print('\\n'.join([os.environ['MOCK_SHA'],'a'*40,'c'*40,'d'*40,'e'*40]))
if a==['load']: sys.stdin.buffer.read()
if len(a)>2 and a[0]=='exec' and a[2]=='node':
    if scenario=='not_ready': sys.exit(1)
    if scenario=='post_switch_failure' and 'juicer-proxy:8098' in a[-2]: sys.exit(1)
    if scenario=='post_switch_transient' and 'juicer-proxy:8098' in a[-2]:
        marker=Path(os.environ['MOCK_LOG']+'.proxy-ready')
        if not marker.exists(): marker.touch();sys.exit(1)
if a==['exec','vercel-proxy','nginx','-s','reload'] and scenario=='reload_failure':
    marker=Path(os.environ['MOCK_LOG']+'.reloaded')
    if not marker.exists(): marker.touch();sys.exit(1)
""")
            mock.chmod(0o755)
            for command_name in ["sleep", "flock"]:
                f = binaries / command_name
                f.write_text("#!/bin/sh\nexit 0\n")
                f.chmod(0o755)
            source = SOURCE.read_text().replace(
                "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
                "PATH=" + shlex.quote(str(binaries) + ":" + os.environ["PATH"]),
            ).replace("BASE=/opt/juicer", f"BASE={base}").replace(
                "UPSTREAM=/root/docker-proxy/data/conf.d/00-juicer-upstream.conf",
                f"UPSTREAM={upstream}",
            )
            script = root / "deploy.sh"
            script.write_text(source)
            result = subprocess.run(
                ["bash", str(script)], input=gzip.compress(b"test image"),
                capture_output=True,
                env={**os.environ, "SSH_ORIGINAL_COMMAND": command or "deploy " + SHA,
                     "MOCK_LOG": str(log), "MOCK_SCENARIO": scenario, "MOCK_SHA": SHA},
            )
            return {
                "code": result.returncode,
                "upstream": upstream.read_text(),
                "sha": (base / "active-sha").read_text().strip(),
                "slot": (base / "active-slot").read_text().strip(),
                "log": log.read_text() if log.exists() else "",
                "error": result.stderr.decode(),
            }

    def test_success_selects_new_slot_and_checks_nginx(self):
        result = self.exercise()
        self.assertEqual(result["code"], 0, result["error"])
        self.assertEqual(result["sha"], SHA)
        self.assertEqual(result["slot"], "green")
        self.assertIn("server juicer-web-green:3000", result["upstream"])
        self.assertIn("juicer-proxy:8098", result["log"])
        self.assertNotIn("rm -f juicer-web-blue", result["log"])

    def test_unready_candidate_keeps_previous_site(self):
        result = self.exercise("not_ready")
        self.assertNotEqual(result["code"], 0)
        self.assertEqual(result["upstream"], "OLD UPSTREAM\n")
        self.assertEqual(result["sha"], OLD_SHA)
        self.assertNotIn("nginx -s reload", result["log"])

    def test_cleanup_keeps_active_and_rollback_images(self):
        result = self.exercise()
        self.assertEqual(result["code"], 0, result["error"])
        self.assertNotIn("image rm juicer:" + SHA, result["log"])
        self.assertNotIn("image rm juicer:" + OLD_SHA, result["log"])
        self.assertNotIn("image rm juicer:" + "c" * 40, result["log"])
        self.assertIn("image rm juicer:" + "d" * 40, result["log"])
        self.assertNotIn("system prune", result["log"])

    def test_reload_failure_restores_config(self):
        result = self.exercise("reload_failure")
        self.assertNotEqual(result["code"], 0)
        self.assertEqual(result["upstream"], "OLD UPSTREAM\n")
        self.assertEqual(result["sha"], OLD_SHA)

    def test_failed_nginx_probe_rolls_back(self):
        result = self.exercise("post_switch_failure")
        self.assertNotEqual(result["code"], 0)
        self.assertEqual(result["upstream"], "OLD UPSTREAM\n")
        self.assertEqual(result["sha"], OLD_SHA)

    def test_transient_proxy_probe_does_not_discard_healthy_release(self):
        result = self.exercise("post_switch_transient")
        self.assertEqual(result["code"], 0, result["error"])
        self.assertEqual(result["sha"], SHA)
        self.assertEqual(result["slot"], "green")

    def test_no_runtime_cannot_deploy(self):
        result = self.exercise(runtime=False)
        self.assertNotEqual(result["code"], 0)
        self.assertEqual(result["log"], "")

    def test_forced_command_rejects_shell(self):
        result = self.exercise(command="deploy " + SHA + "; id")
        self.assertEqual(result["code"], 2)
        self.assertEqual(result["log"], "")


if __name__ == "__main__":
    unittest.main()
