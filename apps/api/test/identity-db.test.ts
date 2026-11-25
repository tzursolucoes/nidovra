import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { ActiveFamilyExists, IdempotencyConflict } from '../src/modules/identity/contracts.ts';
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

  it('impede duas criações concorrentes da mesma identidade e reverte a tentativa perdedora', async () => {
    const actorId = randomUUID();
    const first = { actorId, key: randomUUID(), name: 'Primeira família' };
    const second = { actorId, key: randomUUID(), name: 'Segunda família' };
    const outcomes = await Promise.allSettled([
      repository.createHousehold(first),
      repository.createHousehold(second),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')?.reason).toBeInstanceOf(ActiveFamilyExists);
    expect(await repository.listMemberships(actorId)).toHaveLength(1);
    const families = await pool.query('SELECT id FROM households WHERE owner_auth_user_id = $1', [actorId]);
    expect(families.rowCount).toBe(1);
    const attempts = await pool.query('SELECT key FROM identity_idempotency WHERE actor_auth_user_id = $1', [actorId]);
    expect(attempts.rowCount).toBe(1);
  });

  it('impede ingressos concorrentes em famílias distintas sem consumir o convite bloqueado', async () => {
    const owners = [randomUUID(), randomUUID()];
    const families = await Promise.all(owners.map((actorId) => repository.createHousehold({
      actorId, key: randomUUID(), name: 'Família convidante',
    })));
    const guest = randomUUID();
    const email = 'mesma-conta@example.test';
    const requests = await Promise.all(families.map(async ({ id: householdId }, index) => {
      const tokenHash = digest(randomUUID());
      await repository.createInvitation({ actorId: owners[index]!, householdId, email, tokenHash, key: randomUUID() });
      return { householdId, actorId: guest, email, tokenHash };
    }));
    const outcomes = await Promise.allSettled(requests.map((request) => repository.acceptInvitation(request)));
    const winnerIndex = outcomes.findIndex((outcome) => outcome.status === 'fulfilled');
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    const loserIndex = 1 - winnerIndex;
    const losingOutcome = outcomes[loserIndex];
    expect(losingOutcome?.status).toBe('rejected');
    if (losingOutcome?.status !== 'rejected') throw new Error('Convite conflitante não foi bloqueado.');
    expect(losingOutcome.reason).toBeInstanceOf(ActiveFamilyExists);
    const winner = requests[winnerIndex]!;
    const loser = requests[loserIndex]!;
    const memberships = await repository.listMemberships(guest);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.householdId).toBe(winner.householdId);
    const invite = await pool.query('SELECT consumed_at FROM invitations WHERE token_hash = $1', [loser.tokenHash]);
    expect(invite.rows[0]?.consumed_at).toBeNull();

    const sameFamilyHash = digest(randomUUID());
    await repository.createInvitation({
      actorId: owners[winnerIndex]!, householdId: winner.householdId, email, tokenHash: sameFamilyHash, key: randomUUID(),
    });
    await expect(repository.acceptInvitation({ ...winner, tokenHash: sameFamilyHash }))
      .resolves.toEqual({ householdId: winner.householdId });

    await expect(repository.revokeMembership(winner.householdId, owners[winnerIndex]!, memberships[0]!.id))
      .resolves.toBe('revoked');
    await expect(repository.acceptInvitation(loser)).resolves.toEqual({ householdId: loser.householdId });
    await expect(repository.createHousehold({ actorId: guest, key: randomUUID(), name: 'Terceira família' }))
      .rejects.toBeInstanceOf(ActiveFamilyExists);
  });

  it('revalida a administração da família no banco antes de renomear', async () => {
    const owner = randomUUID();
    const guest = randomUUID();
    const { id: householdId } = await repository.createHousehold({
      actorId: owner, key: randomUUID(), name: 'Antes',
    });
    const email = 'membro-sem-edicao@example.test';
    const tokenHash = digest(randomUUID());
    await repository.createInvitation({ actorId: owner, householdId, email, tokenHash, key: randomUUID() });
    await repository.acceptInvitation({ actorId: guest, email, tokenHash });
    expect(await repository.renameHousehold({ actorId: guest, householdId, name: 'Negado' })).toBeNull();
    await expect(repository.renameHousehold({ actorId: owner, householdId, name: 'Depois' }))
      .resolves.toEqual({ id: householdId, name: 'Depois' });
    expect(await repository.listMemberships(guest)).toMatchObject([{ householdName: 'Depois' }]);
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
