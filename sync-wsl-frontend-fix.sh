#!/usr/bin/env bash
set -euo pipefail

SRC="/mnt/c/Users/Arokoyo Benard/Downloads/somnia-agent/somnia-agent"
DEST="${1:-$PWD}"

cd "$DEST"

if [ ! -d .git ]; then
  echo "Run this from the WSL git repo root, or pass the repo path as the first argument."
  exit 1
fi

git restore apps/web/tsconfig.tsbuildinfo 2>/dev/null || true

files=(
  "vercel.json"
  "README.md"
  "DEPLOY_FRONTEND.md"
  ".env.example"
  "deploy-env.frontend.example"
  "apps/web/.env.example"
  "apps/web/app/api/agent/route.ts"
  "apps/web/app/dashboard/page.tsx"
  "apps/web/components/CommandBar.tsx"
)

for file in "${files[@]}"; do
  mkdir -p "$(dirname "$file")"
  cp "$SRC/$file" "$file"
done

echo "Checking expected strings..."
git grep -n "Live agent service"
git grep -n "ALLOW_DEMO_AGENT"

if git grep -n "Agent demo fallback"; then
  echo "Old Agent demo fallback string is still present."
  exit 1
fi

if git grep -n "Odos demo fallback"; then
  echo "Old Odos demo fallback string is still present."
  exit 1
fi

echo
echo "Files copied. Next run:"
echo "  pnpm --filter @somnia-agent/web typecheck"
echo "  pnpm --filter @somnia-agent/web build"
echo "  git add vercel.json README.md DEPLOY_FRONTEND.md .env.example deploy-env.frontend.example apps/web/app/api/agent/route.ts apps/web/app/dashboard/page.tsx apps/web/components/CommandBar.tsx"
echo "  git add -f apps/web/.env.example"
echo "  git commit -m \"Apply frontend deployment root fix\""
echo "  git push"
