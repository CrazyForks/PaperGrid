#!/bin/sh
set -eu
umask 077

DATA_DIR="${DATA_DIR:-/data}"

# 1) 生成/复用 NEXTAUTH_SECRET（写入数据卷，避免每次重启都变化）
if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  secret_file="$DATA_DIR/nextauth_secret"
  if [ -f "$secret_file" ]; then
    NEXTAUTH_SECRET="$(cat "$secret_file")"
  else
    NEXTAUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
    mkdir -p "$DATA_DIR"
    printf '%s' "$NEXTAUTH_SECRET" > "$secret_file"
  fi
  export NEXTAUTH_SECRET
fi

# 2) 默认 NEXTAUTH_URL（反向代理后建议由用户自行覆盖）
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"

# 3) 默认 SQLite 路径（推荐放数据卷）
export DATABASE_URL="${DATABASE_URL:-file:$DATA_DIR/db.sqlite}"

run_migrate() {
  if [ "${SKIP_DB_MIGRATE:-}" = "1" ]; then
    echo "[entrypoint] SKIP_DB_MIGRATE=1，跳过迁移"
    return 0
  fi

  prisma_cli="/app/prisma-cli/node_modules/prisma/build/index.js"
  schema_path="/app/prisma/schema.prisma"
  migrations_dir="/app/prisma/migrations"

  if [ ! -f "$prisma_cli" ]; then
    echo "[entrypoint] 未发现 Prisma CLI，无法迁移" >&2
    return 1
  fi

  if [ ! -f "$schema_path" ]; then
    echo "[entrypoint] 未发现 schema.prisma，无法迁移" >&2
    return 1
  fi

  if [ ! -d "$migrations_dir" ]; then
    echo "[entrypoint] 未发现 migrations 目录，无法迁移" >&2
    return 1
  fi

  echo "[entrypoint] 运行数据库迁移（prisma migrate deploy）"
  if ! node "$prisma_cli" migrate deploy --schema="$schema_path"; then
    echo "[entrypoint] 数据库迁移失败，停止启动" >&2
    exit 1
  fi
}

db_url="$DATABASE_URL"
case "$db_url" in
  file:*)
    db_path="${db_url#file:}"
    ;;
  *)
    echo "[entrypoint] DATABASE_URL 不是 file: 协议，跳过模板库初始化: $db_url" >&2
    run_migrate
    exec node server.js
    ;;
esac

mkdir -p "$(dirname "$db_path")"

if [ ! -f "$db_path" ]; then
  if [ -f "/app/prisma/template.db" ]; then
    cp "/app/prisma/template.db" "$db_path"
    echo "[entrypoint] 已初始化数据库: $db_path"

  else
    echo "[entrypoint] 缺少模板库 /app/prisma/template.db，无法初始化数据库" >&2
  fi
fi

run_migrate
node /app/scripts/upgrade-media.mjs
node /app/scripts/bootstrap-admin.mjs

exec node server.js
