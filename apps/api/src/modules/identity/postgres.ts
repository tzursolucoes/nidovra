import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  ActiveFamilyExists,
  IdempotencyConflict,
  type IdentityStore,
  type Member,
  type Membership,
} from './contracts.ts';

async function transaction<Result>(pool: Pool, operation: (client: PoolClient) => Promise<Result>) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { discard = true; });
    // FAM-02: o índice arbitra concorrência entre famílias. O rollback devolve o convite ao estado anterior.
    if (!discard && error instanceof Error && 'code' in error && error.code === '23505' &&
      'constraint' in error && error.constraint === 'memberships_one_active_per_user_uidx') {
      throw new ActiveFamilyExists();
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

async function idempotent<Result extends object>(
  client: PoolClient,
  actorId: string,
  operation: string,
  key: string,
  payload: readonly string[],
  execute: () => Promise<Result>,
): Promise<Result> {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const parameters = [actorId, operation, key, hash];
  const attempt = await client.query(
    `INSERT INTO identity_idempotency (actor_auth_user_id, operation, key, payload_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    parameters,
  );
  if (attempt.rowCount === 0) {
    // A restrição única espera a transação concorrente. Uma leitura nova enxerga o resultado confirmado.
    const { rows: [previous] } = await client.query<{ payload_hash: string; result: Result | null }>(
      `SELECT payload_hash, result FROM identity_idempotency
       WHERE actor_auth_user_id = $1 AND operation = $2 AND key = $3`,
      [actorId, operation, key],
    );
    if (!previous?.result) throw new Error('Reserva de idempotência sem resultado.');
    if (previous.payload_hash !== hash) throw new IdempotencyConflict();
    return previous.result;
  }
  const result = await execute();
  await client.query(
    `UPDATE identity_idempotency SET result = $4
     WHERE actor_auth_user_id = $1 AND operation = $2 AND key = $3`,
    [actorId, operation, key, JSON.stringify(result)],
  );
  return result;
}

/** Serializa alterações de uma família antes de verificar as permissões vigentes (FAM-02/03). */
async function lockHousehold(client: PoolClient, householdId: string) {
  const { rows: [household] } = await client.query<{ owner_auth_user_id: string }>(
    "SELECT owner_auth_user_id FROM households WHERE id = $1 AND status = 'active' FOR UPDATE",
    [householdId],
  );
  return household;
}

async function hasAdmin(client: PoolClient, householdId: string, actorId: string) {
  const result = await client.query(
    `SELECT 1 FROM memberships
     WHERE household_id = $1 AND auth_user_id = $2 AND status = 'active' AND role = 'admin'`,
    [householdId, actorId],
  );
  return result.rowCount === 1;
}

export function createPostgresIdentityStore(pool: Pool): IdentityStore {
  return {
    async listMemberships(actorId) {
      const { rows } = await pool.query<Membership>(
        `SELECT m.id, h.id AS "householdId", h.name AS "householdName", m.role
         FROM memberships m JOIN households h ON h.id = m.household_id
         WHERE m.auth_user_id = $1 AND m.status = 'active' AND h.status = 'active'
         ORDER BY h.name, h.id`,
        [actorId],
      );
      return rows;
    },

    async getMembership(householdId, actorId) {
      const { rows: [membership] } = await pool.query<Membership>(
        `SELECT m.id, h.id AS "householdId", h.name AS "householdName", m.role
         FROM memberships m JOIN households h ON h.id = m.household_id
         WHERE h.id = $1 AND m.auth_user_id = $2 AND m.status = 'active' AND h.status = 'active'`,
        [householdId, actorId],
      );
      return membership ?? null;
    },

    async listMembers(householdId, actorId) {
      // A leitura se autoriza no mesmo snapshot que produz a lista de integrantes.
      const { rows } = await pool.query<Member>(
        `SELECT m.id, m.auth_user_id AS "authUserId", m.role
         FROM households h JOIN memberships m ON m.household_id = h.id AND m.status = 'active'
         JOIN memberships actor ON actor.household_id = h.id AND actor.auth_user_id = $2 AND actor.status = 'active'
         WHERE h.id = $1 AND h.status = 'active'
         ORDER BY m.role, m.id`,
        [householdId, actorId],
      );
      return rows.length ? rows : null;
    },

    createHousehold({ actorId, key, name }) {
      return transaction(pool, (client) => idempotent(client, actorId, 'household.create', key, [name], async () => {
        const { rows: [household] } = await client.query<{ id: string; name: string }>(
          'INSERT INTO households (name, owner_auth_user_id) VALUES ($1, $2) RETURNING id, name',
          [name, actorId],
        );
        if (!household) throw new Error('Criação de família sem resultado.');
        await client.query(
          "INSERT INTO memberships (household_id, auth_user_id, role) VALUES ($1, $2, 'admin')",
          [household.id, actorId],
        );
        return { ...household, role: 'admin' as const };
      }));
    },

    renameHousehold({ actorId, householdId, name }) {
      return transaction(pool, async (client) => {
        const household = await lockHousehold(client, householdId);
        if (!household || !await hasAdmin(client, householdId, actorId)) return null;
        const { rows: [updated] } = await client.query<{ id: string; name: string }>(
          'UPDATE households SET name = $2, updated_at = statement_timestamp() WHERE id = $1 RETURNING id, name',
          [householdId, name],
        );
        return updated ?? null;
      });
    },

    createInvitation({ actorId, householdId, key, email, tokenHash }) {
      return transaction(pool, async (client) => {
        const household = await lockHousehold(client, householdId);
        if (!household || !await hasAdmin(client, householdId, actorId)) return null;
        const invitation = await idempotent(
          client, actorId, `invitation.create:${householdId}`, key, [email, tokenHash], async () => {
            const { rows: [created] } = await client.query<{ id: string; expires_at: Date }>(
              `INSERT INTO invitations (household_id, email, token_hash, created_at, expires_at)
               VALUES ($1, $2, $3, statement_timestamp(), statement_timestamp() + interval '48 hours')
               RETURNING id, expires_at`,
              [householdId, email, tokenHash],
            );
            if (!created) throw new Error('Criação de convite sem resultado.');
            return { id: created.id, expiresAt: created.expires_at.toISOString() };
          },
        );
        return { ...invitation, email };
      });
    },

    acceptInvitation({ actorId, email, tokenHash }) {
      return transaction(pool, async (client) => {
        const { rows: [invitation] } = await client.query<{ household_id: string }>(
          'SELECT household_id FROM invitations WHERE token_hash = $1 AND email = $2',
          [tokenHash, email],
        );
        if (!invitation || !await lockHousehold(client, invitation.household_id)) return null;
        const householdId = invitation.household_id;
        // FAM-02/03: consome apenas um convite válido e impede reativação por convite anterior à revogação.
        const used = await client.query(
          `UPDATE invitations i SET consumed_at = statement_timestamp()
           WHERE i.household_id = $1 AND i.token_hash = $2 AND i.email = $3
             AND i.consumed_at IS NULL AND i.expires_at > statement_timestamp()
             AND NOT EXISTS (
               SELECT 1 FROM memberships m
               WHERE m.household_id = i.household_id AND m.auth_user_id = $4
                 AND m.status = 'revoked' AND m.updated_at >= i.created_at
             )`,
          [householdId, tokenHash, email, actorId],
        );
        if (used.rowCount !== 1) return null;
        await client.query(
          `INSERT INTO memberships (household_id, auth_user_id, role) VALUES ($1, $2, 'member')
           ON CONFLICT (household_id, auth_user_id) DO UPDATE
           SET status = 'active', role = 'member', updated_at = statement_timestamp()
           WHERE memberships.status = 'revoked'`,
          [householdId, actorId],
        );
        return { householdId };
      });
    },

    revokeMembership(householdId, actorId, memberId) {
      return transaction(pool, async (client) => {
        const household = await lockHousehold(client, householdId);
        if (!household || !await hasAdmin(client, householdId, actorId)) return 'missing';
        const { rows: [target] } = await client.query<{ auth_user_id: string }>(
          "SELECT auth_user_id FROM memberships WHERE household_id = $1 AND id = $2 AND status = 'active'",
          [householdId, memberId],
        );
        if (!target) return 'missing';
        if (target.auth_user_id === household.owner_auth_user_id) return 'owner-protected';
        await client.query(
          "UPDATE memberships SET status = 'revoked', updated_at = statement_timestamp() WHERE household_id = $1 AND id = $2",
          [householdId, memberId],
        );
        return 'revoked';
      });
    },
  };
}
