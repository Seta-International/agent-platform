# Hackathon Demo Infrastructure

Single EC2 t4g.small (ARM64, Singapore) + S3 daily backup.  
Stack managed by [OpenTofu](https://opentofu.org/) — deploy via GitHub Actions or local CLI.

## Prerequisites

| Tool | Version |
|------|---------|
| OpenTofu | ≥ 1.12.0 |
| AWS CLI | v2 |
| AWS credentials | see below |

---

## First-time AWS setup (once per AWS account)

### 1. Create the GitHub OIDC provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 2. Create the IAM role

Edit `iam-oidc-trust-policy.json` — replace `YOUR_ACCOUNT_ID` and `YOUR_GITHUB_ORG`, then:

```bash
aws iam create-role \
  --role-name github-actions-platform-deploy \
  --assume-role-policy-document file://iam-oidc-trust-policy.json

aws iam attach-role-policy \
  --role-name github-actions-platform-deploy \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

> Scope down the policy in production — minimum: EC2, EIP, S3, IAM PassRole, VPC.

Copy the role ARN (`arn:aws:iam::<account>:role/github-actions-platform-deploy`) — needed for the GitHub secret below.

---

## Deploy via GitHub Actions (recommended)

### GitHub Secrets required

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `AWS_ROLE_ARN` | Role ARN from step 2 above |
| `TF_VAR_DOMAIN` | `demo.your-domain.com` |
| `TF_VAR_ACME_EMAIL` | `your-email@example.com` |
| `TF_VAR_KEY_NAME` | EC2 key pair name in ap-southeast-1 |
| `TF_VAR_ALLOWED_SSH_CIDRS` | `["YOUR_OFFICE_IP/32"]` (JSON list) |
| `TF_VAR_POSTGRES_PASSWORD` | `openssl rand -hex 16` |
| `TF_VAR_BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `TF_VAR_OPENAI_API_KEY` | `sk-...` |
| `TF_VAR_COPILOT_MODEL` | e.g. `openai/gpt-4o-mini` |
| `TF_VAR_JAEGER_AUTH_PASSWORD` | strong password for traces UI |

### Trigger the workflow

| Action | How |
|--------|-----|
| **Plan** | Push to any branch → workflow runs `tofu plan` automatically |
| **Apply** | Workflow dispatch → select `apply` |
| **Destroy** | Workflow dispatch → select `destroy` |

Workflow file: [`.github/workflows/hackathon-deploy.yml`](../../.github/workflows/hackathon-deploy.yml)

---

## Deploy from local CLI

> **GitHub Actions users — skip this section entirely.**  
> The workflow injects all values via `TF_VAR_*` environment variables from GitHub Secrets. No `terraform.tfvars` file is needed.

### 1. Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill every required value
# NEVER commit this file (it contains secrets)
```

### 2. Init & apply

```bash
tofu init
tofu plan -out=tfplan
tofu apply tfplan
```

### 3. Point DNS

After apply, note the `public_ip` output and create an **A record**:

```
demo.your-domain.com  →  <public_ip>
```

If using wildcard traces subdomain also add:

```
traces.demo.your-domain.com  →  <public_ip>
```

Bootstrap completes automatically (~3 min). Check progress:

```bash
ssh ubuntu@<public_ip> tail -f /var/log/platform-bootstrap.log
```

---

## Useful commands after deploy

```bash
# SSH into the box
ssh ubuntu@$(tofu output -raw public_ip)

# View live app logs
ssh ubuntu@<ip> 'cd /opt/platform && docker compose logs -f --tail=50'

# Trigger manual backup
ssh ubuntu@<ip> sudo /usr/local/bin/platform-backup.sh

# Restore from latest backup (⚠ stops the stack)
ssh ubuntu@<ip> sudo /usr/local/bin/platform-restore.sh

# Destroy everything
tofu destroy
```

---

## URLs

| Service | URL |
|---------|-----|
| App | `https://<domain>` |
| Traces (Jaeger) | `https://traces.<domain>` — BasicAuth with `jaeger_auth_user / jaeger_auth_password` |

---

## Cost estimate (ap-southeast-1)

| Resource | ~USD/month |
|----------|-----------|
| EC2 t4g.small | 18–22 |
| EBS 40 GB gp3 | 3 |
| EIP (attached) | 0 |
| S3 backup (~1 GB) | < 1 |
| **Total** | **~22–26** |
