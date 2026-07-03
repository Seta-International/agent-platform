# nonprod-storage

Provisions the `dev` and `uat` S3 buckets (`seta-dev-app-apse1`, `seta-uat-app-apse1`) plus a
least-privilege IAM user per env for the app to read/write its own objects. Prod's bucket is owned
by a separate prod Terraform module — not created here.

State is stored remotely in `s3://seta-tfstate-prod-apse1/nonprod-storage/terraform.tfstate`
(region `ap-southeast-1`), independent of any other module's state.

## Usage

```bash
cd infra/terraform/nonprod-storage
terraform init
terraform apply
```

Review the plan before applying — it creates one S3 bucket, one IAM user, and one IAM access key
per env in `var.envs` (default `["dev", "uat"]`).

## Publishing the generated credentials

After `apply`, pull the per-env access key id/secret out of state and paste them into the matching
GitHub Environment (`dev`, `uat`) as `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` secrets — these are
what `compose.dev.yaml`/`compose.uat.yaml` expect at deploy time.

```bash
terraform output -raw access_key_ids
terraform output -raw secret_access_keys
```

`secret_access_keys` is marked `sensitive` in `outputs.tf`, but Terraform still prints it on
request — treat the output as a credential. Never commit these values (or any `.tfvars` file that
contains them) to the repo. `terraform.tfvars.example` documents the only variable this module
takes; copy it to `terraform.tfvars` locally if you need to override `envs`, and keep that file out
of version control.
