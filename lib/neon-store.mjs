const databaseUrl = String(process.env.DATABASE_URL || "").trim();

let poolPromise;
let schemaPromise;

export function neonConfigured() {
  return Boolean(databaseUrl);
}

async function databasePool() {
  if (!neonConfigured()) throw new Error("DATABASE_URL is not configured.");
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => {
      const pool = new Pool({
        connectionString: databaseUrl,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 15_000,
        allowExitOnIdle: true,
      });
      pool.on("error", (error) => console.error("Neon idle connection error:", error));
      return pool;
    });
  }
  return poolPromise;
}

export async function ensureNeonSchema() {
  if (!neonConfigured()) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = await databasePool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ratis_metadata (
          key text PRIMARY KEY,
          value jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS ratis_auth_users (
          id text PRIMARY KEY,
          name text NOT NULL,
          role text NOT NULL CHECK (role IN ('user', 'admin')),
          password_salt text NOT NULL DEFAULT '',
          password_hash text NOT NULL DEFAULT '',
          password_updated_at text NOT NULL DEFAULT '',
          disabled boolean NOT NULL DEFAULT false,
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS ratis_shared_database (
          id smallint PRIMARY KEY CHECK (id = 1),
          payload jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS ratis_photos (
          id uuid PRIMARY KEY,
          record_key text NOT NULL,
          photo_type text NOT NULL CHECK (photo_type IN ('onu', 'ups')),
          object_key text NOT NULL UNIQUE,
          content_type text NOT NULL,
          size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
          original_name text NOT NULL DEFAULT '',
          uploaded_by text NOT NULL,
          status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
          replaces_photo_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(),
          ready_at timestamptz
        );

        CREATE INDEX IF NOT EXISTS ratis_photos_record_type_idx
          ON ratis_photos (record_key, photo_type, created_at)
          WHERE status = 'ready';
      `);
    })();
  }
  return schemaPromise;
}

export async function bootstrapNeon({ authUsers = [], sharedDatabase = null } = {}) {
  if (!neonConfigured()) return;
  await ensureNeonSchema();
  const pool = await databasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const authMarker = await client.query("SELECT 1 FROM ratis_metadata WHERE key = 'auth_bootstrapped' FOR UPDATE");
    if (!authMarker.rowCount) {
      for (const account of authUsers) {
        await client.query(`
          INSERT INTO ratis_auth_users
            (id, name, role, password_salt, password_hash, password_updated_at, disabled)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [
          account.id,
          account.name,
          account.role === "admin" ? "admin" : "user",
          account.passwordSalt || "",
          account.passwordHash || "",
          account.passwordUpdatedAt || "",
          Boolean(account.disabled),
        ]);
      }
      await client.query("INSERT INTO ratis_metadata (key, value) VALUES ('auth_bootstrapped', $1::jsonb)", [JSON.stringify({ imported: authUsers.length })]);
    }

    const sharedMarker = await client.query("SELECT 1 FROM ratis_metadata WHERE key = 'shared_database_bootstrapped' FOR UPDATE");
    if (!sharedMarker.rowCount) {
      if (sharedDatabase) {
        await client.query(`
          INSERT INTO ratis_shared_database (id, payload)
          VALUES (1, $1::jsonb)
          ON CONFLICT (id) DO NOTHING
        `, [JSON.stringify(sharedDatabase)]);
      }
      await client.query("INSERT INTO ratis_metadata (key, value) VALUES ('shared_database_bootstrapped', $1::jsonb)", [JSON.stringify({ imported: Boolean(sharedDatabase) })]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function accountFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    passwordUpdatedAt: row.password_updated_at,
    disabled: Boolean(row.disabled),
  };
}

export async function readNeonAuthAccounts() {
  await ensureNeonSchema();
  const pool = await databasePool();
  const result = await pool.query("SELECT * FROM ratis_auth_users ORDER BY lower(id), id");
  return result.rows.map(accountFromRow);
}

export async function writeNeonAuthAccounts(users) {
  await ensureNeonSchema();
  const pool = await databasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM ratis_auth_users");
    for (const account of users) {
      await client.query(`
        INSERT INTO ratis_auth_users
          (id, name, role, password_salt, password_hash, password_updated_at, disabled, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      `, [
        account.id,
        account.name,
        account.role === "admin" ? "admin" : "user",
        account.passwordSalt || "",
        account.passwordHash || "",
        account.passwordUpdatedAt || "",
        Boolean(account.disabled),
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function readNeonSharedDatabase() {
  await ensureNeonSchema();
  const pool = await databasePool();
  const result = await pool.query("SELECT payload FROM ratis_shared_database WHERE id = 1");
  return result.rows[0]?.payload || null;
}

export async function writeNeonSharedDatabase(sharedDatabase) {
  await ensureNeonSchema();
  const pool = await databasePool();
  await pool.query(`
    INSERT INTO ratis_shared_database (id, payload, updated_at)
    VALUES (1, $1::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
  `, [JSON.stringify(sharedDatabase)]);
}

function photoFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    recordKey: row.record_key,
    photoType: row.photo_type,
    objectKey: row.object_key,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    originalName: row.original_name,
    uploadedBy: row.uploaded_by,
    status: row.status,
    replacesPhotoId: row.replaces_photo_id || "",
    createdAt: row.created_at,
  };
}

export async function createPendingPhoto(photo) {
  await ensureNeonSchema();
  const pool = await databasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (photo.replacesPhotoId) {
      const replaced = await client.query(`
        SELECT id FROM ratis_photos
        WHERE id = $1 AND record_key = $2 AND photo_type = $3 AND status = 'ready'
        FOR UPDATE
      `, [photo.replacesPhotoId, photo.recordKey, photo.photoType]);
      if (!replaced.rowCount) {
        const error = new Error("교체할 사진을 찾지 못했습니다.");
        error.code = "PHOTO_NOT_FOUND";
        throw error;
      }
    } else {
      const count = await client.query(`
        SELECT count(*)::int AS count FROM ratis_photos
        WHERE record_key = $1 AND photo_type = $2 AND status IN ('pending', 'ready')
          AND created_at > now() - interval '1 day'
      `, [photo.recordKey, photo.photoType]);
      if (Number(count.rows[0]?.count || 0) >= 3) {
        const error = new Error("현장사진은 종류별로 최대 3장까지 등록할 수 있습니다.");
        error.code = "PHOTO_LIMIT";
        throw error;
      }
    }

    const result = await client.query(`
      INSERT INTO ratis_photos
        (id, record_key, photo_type, object_key, content_type, size_bytes, original_name, uploaded_by, replaces_photo_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, '')::uuid)
      RETURNING *
    `, [
      photo.id,
      photo.recordKey,
      photo.photoType,
      photo.objectKey,
      photo.contentType,
      photo.sizeBytes,
      photo.originalName,
      photo.uploadedBy,
      photo.replacesPhotoId || "",
    ]);
    await client.query("COMMIT");
    return photoFromRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function readyPhoto(photoId) {
  await ensureNeonSchema();
  const pool = await databasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pending = await client.query("SELECT * FROM ratis_photos WHERE id = $1 FOR UPDATE", [photoId]);
    const photo = photoFromRow(pending.rows[0]);
    if (!photo) {
      await client.query("ROLLBACK");
      return null;
    }
    let replacedObjectKey = "";
    if (photo.replacesPhotoId) {
      const replaced = await client.query("DELETE FROM ratis_photos WHERE id = $1 RETURNING object_key", [photo.replacesPhotoId]);
      replacedObjectKey = replaced.rows[0]?.object_key || "";
    }
    const result = await client.query(`
      UPDATE ratis_photos
      SET status = 'ready', ready_at = now(), replaces_photo_id = NULL
      WHERE id = $1
      RETURNING *
    `, [photoId]);
    await client.query("COMMIT");
    return { photo: photoFromRow(result.rows[0]), replacedObjectKey };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getPhoto(photoId, { includePending = false } = {}) {
  await ensureNeonSchema();
  const pool = await databasePool();
  const result = await pool.query(
    `SELECT * FROM ratis_photos WHERE id = $1 ${includePending ? "" : "AND status = 'ready'"}`,
    [photoId],
  );
  return photoFromRow(result.rows[0]);
}

export async function listPhotos(recordKey, photoType) {
  await ensureNeonSchema();
  const pool = await databasePool();
  const result = await pool.query(`
    SELECT * FROM ratis_photos
    WHERE record_key = $1 AND photo_type = $2 AND status = 'ready'
    ORDER BY created_at, id
    LIMIT 3
  `, [recordKey, photoType]);
  return result.rows.map(photoFromRow);
}

export async function removePhoto(photoId) {
  await ensureNeonSchema();
  const pool = await databasePool();
  const result = await pool.query("DELETE FROM ratis_photos WHERE id = $1 RETURNING *", [photoId]);
  return photoFromRow(result.rows[0]);
}

export async function closeNeon() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  await pool.end();
}
