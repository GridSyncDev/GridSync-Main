# Droplet deploy

> **Retired.** The public site now runs on DigitalOcean App Platform at
> https://beforewebuildlets.compare and deploys on every push to `main`. The droplet
> below no longer exists; this script is kept for reference.

The site used to run on a DigitalOcean droplet (`gridsync-web`, 134.122.9.112) at
https://134-122-9-112.sslip.io, behind Caddy (automatic HTTPS).

**Auto-deploy:** a systemd timer runs `/opt/gridsync/deploy.sh` every 2 minutes. When
`main` of GridSyncDev/GridSync-Main has a new commit, it builds that commit in
`/opt/gridsync/releases/<sha>` and switches `/opt/gridsync/current` to it only if
`npm ci && npm run build` succeed, then restarts the app and checks `/api/projects`.
A failed build leaves the previous version running.

Useful commands (SSH key: `~/.ssh/gridsync_do`):

```bash
ssh -i ~/.ssh/gridsync_do root@134.122.9.112
journalctl -u gridsync-deploy -n 50      # deploy history
journalctl -u gridsync -f                # app logs
/opt/gridsync/deploy.sh --force          # redeploy now
readlink /opt/gridsync/current           # commit that is live
```

Rebuild from scratch: copy the three secrets to `/root/gridsync.env`
(`DATABASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ELEVENLABS_API_KEY`) and run
`bash provision.sh` as root on a fresh Ubuntu 24.04 droplet.
