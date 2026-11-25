export type Role = 'admin' | 'member';

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export type SessionResolver = (request: Request) => Promise<SessionUser | null>;

export interface Membership {
  id: string;
  householdId: string;
  householdName: string;
  role: Role;
}

export interface Member {
  id: string;
  authUserId: string;
  role: Role;
}

export interface CreateHousehold {
  actorId: string;
  key: string;
  name: string;
}

export interface RenameHousehold {
  actorId: string;
  householdId: string;
  name: string;
}

export interface CreateInvitation {
  actorId: string;
  householdId: string;
  key: string;
  email: string;
  tokenHash: string;
}

export interface AcceptInvitation {
  actorId: string;
  email: string;
  tokenHash: string;
}

export interface InvitationDetails {
  id: string;
  email: string;
  expiresAt: string;
}

export interface IdentityStore {
  listMemberships(actorId: string): Promise<Membership[]>;
  getMembership(householdId: string, actorId: string): Promise<Membership | null>;
  listMembers(householdId: string, actorId: string): Promise<Member[] | null>;
  createHousehold(command: CreateHousehold): Promise<{ id: string; name: string; role: 'admin' }>;
  renameHousehold(command: RenameHousehold): Promise<{ id: string; name: string } | null>;
  createInvitation(command: CreateInvitation): Promise<InvitationDetails | null>;
  acceptInvitation(command: AcceptInvitation): Promise<{ householdId: string } | null>;
  revokeMembership(
    householdId: string,
    actorId: string,
    memberId: string,
  ): Promise<'revoked' | 'missing' | 'owner-protected'>;
}

export interface IdentityDependencies {
  resolveSession: SessionResolver;
  identityStore: IdentityStore;
  invitationTokenSecret?: Uint8Array;
}

/** A mesma chave não pode ser reutilizada com outro conteúdo na mesma operação. */
export class IdempotencyConflict extends Error {}

/** FAM-02: a identidade já tem um vínculo familiar ativo. */
export class ActiveFamilyExists extends Error {}
