#!/bin/sh
set -e

if [ ! -f /app/.env.test ]; then
  cat > /app/.env.test <<'EOF'
DATABASE_ADMIN_URL=postgres://postgres:postgres@db:5432/bnr_compliance_test
DATABASE_URL=postgres://bnr_app:bnr_app_password@db:5432/bnr_compliance_test
JWT_SECRET=test_jwt_secret_for_docker
JWT_EXPIRES_IN=30m
REFRESH_TOKEN_EXPIRES_IN=7d
EOF
fi

echo "[entrypoint] seeding database..."
node scripts/seed.js
exec node src/index.js
