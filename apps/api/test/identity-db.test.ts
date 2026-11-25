import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { IdempotencyConflict } from '../src/modules/identity/contracts.ts';
import { createPostgresIdentityStore } from '../src/modules/identity/postgres.ts';

const port = process.env.NIDOVRA_DB_TEST_PORT;
const password = process.env.POSTGRES_PASSWORD;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

describe.skipIf(!port || !password)('repositório de identidade em PostgreSQL', () => {
  const pool = new Pool({
    host: '127.0.0.1',
    port: Number(port),
    database: 'nidovra_test',
    user: 'postgres',
    password,
    connectionTimeoutMillis: 5000,
  });
  afterAll(() => pool.end());
  const repository = createPostgresIdentityStore(pool);

  it('serializa criações concorrentes e rejeita conteúdo distinto na mesma chave', async () => {
    const actorId = randomUUID();
    const command = { actorId, key: randomUUID(), name: 'Família sintética' };
    const [first, second] = await Promise.all([
      repository.createHousehold(command),
      repository.createHousehold(command),
    ]);
    expect(first).toEqual(second);
    expect(await repository.listMemberships(actorId)).toMatchObject([{ householdId: first.id, role: 'admin' }]);
    await expect(repository.createHousehold({ ...command, name: 'Outro nome' })).rejects.toBeInstanceOf(IdempotencyConflict);
    expect(await repository.listMembers(first.id, randomUUID())).toBeNull();
  });

  it('impede reutilização concorrente, e-mail divergente e acesso após revogação', async () => {
    const owner = randomUUID();
    const guest = randomUUID();
    const inviter = { actorId: owner, key: randomUUID(), name: 'Família convidante' };
    const { id: householdId } = await repository.createHousehold(inviter);
    const tokenHash = digest(randomUUID());
    const email = 'convidado@example.test';
    const invitation = { actorId: owner, householdId, email, tokenHash, key: randomUUID() };
    expect(await repository.createInvitation({ ...invitation, actorId: guest })).toBeNull();
    const created = await repository.createInvitation(invitation);
    expect(created).toMatchObject({ email });
    expect(await repository.createInvitation(invitation)).toEqual(created);
    expect(await repository.acceptInvitation({ actorId: guest, email: 'outro@example.test', tokenHash })).toBeNull();
    const accept = { actorId: guest, email, tokenHash };
    const outcomes = await Promise.all([repository.acceptInvitation(accept), repository.acceptInvitation(accept)]);
    expect(outcomes).toContainEqual({ householdId });
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const guestMembership = await repository.getMembership(householdId, guest);
    const ownerMembership = await repository.getMembership(householdId, owner);
    expect(guestMembership).toMatchObject({ role: 'member' });
    if (!guestMembership || !ownerMembership) throw new Error('Vínculos esperados ausentes.');
    expect(await repository.revokeMembership(householdId, guest, ownerMembership.id)).toBe('missing');
    expect(await repository.revokeMembership(householdId, owner, ownerMembership.id)).toBe('owner-protected');
    const olderTokenHash = digest(randomUUID());
    await repository.createInvitation({ ...invitation, tokenHash: olderTokenHash, key: randomUUID() });
    expect(await repository.revokeMembership(householdId, owner, guestMembership.id)).toBe('revoked');
    expect(await repository.listMembers(householdId, guest)).toBeNull();
    expect(await repository.acceptInvitation({ ...accept, tokenHash: olderTokenHash })).toBeNull();
  });

  it('recusa token expirado sem criar associação', async () => {
    const owner = randomUUID();
    const { id: householdId } = await repository.createHousehold({
      actorId: owner, key: randomUUID(), name: 'Família com convite vencido',
    });
    const tokenHash = digest(randomUUID());
    const email = 'expirado@example.test';
    await pool.query(
      `INSERT INTO invitations (household_id, email, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, now() - interval '2 days', now() - interval '1 day')`,
      [householdId, email, tokenHash],
    );
    const guest = randomUUID();
    expect(await repository.acceptInvitation({ actorId: guest, email, tokenHash })).toBeNull();
    expect(await repository.listMemberships(guest)).toEqual([]);
  });
});
