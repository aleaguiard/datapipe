# Datapipe — Project Rules

## Git Rules
- Branches: `main` and `dev` only
- `main` ← merges only from `dev` via PR
- `dev` ← merges only via Pull Request (no direct push)
- Never push directly to `main`
- Never add co-author signatures to commits
- Use conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`

## Code Style
- TypeScript strict mode
- Run `npm run lint` and `npm run typecheck` before committing
- All new logic must have unit or integration tests

## Local Dev (Terraform + Floci)
- Start Floci: `docker run --rm -p 4566:4566 floci/aws`
- Build Lambda bundles: `npm run build`
- Deploy to Floci: `terraform -chdir=terraform apply -var-file=terraform/local.tfvars`
- Run unit tests: `npm run test:unit`
- Run integration tests (requires Floci): `npm run test:integration`

## AWS Deploy (Terraform)
- Build Lambda bundles: `npm run build`
- Deploy to AWS: `terraform -chdir=terraform apply -var-file=terraform/prod.tfvars`
- Upload frontend: `aws s3 sync frontend/ s3://datapipe-frontend-<account-id>/`

## Terraform Conventions
- Most tfvars files are gitignored — copy from `*.tfvars.example`
- `local.tfvars` → Floci local dev
- `prod.tfvars` → real AWS (gitignored, may contain email/secrets)
- `deploy.auto.tfvars` → committed CI defaults (no secrets, alarm_email="")
- Never commit `terraform.tfstate` or `terraform.tfstate.backup`
- Terraform state lives in S3 backend: `datapipe-tfstate-799395849303`
