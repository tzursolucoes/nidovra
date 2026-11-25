<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  createIdentityClient, IdentityError, type HouseholdMember, type SessionContext,
} from './identity-client';

let client: ReturnType<typeof createIdentityClient> | undefined;
let keysActor: string | undefined;
const session = ref<SessionContext>();
const members = ref<HouseholdMember[]>([]);
const householdId = ref('');
const name = ref('');
const email = ref('');
const invitation = ref('');
const inviteToken = ref('');
const authMode = ref<'login' | 'register' | 'verify'>('login');
const accountName = ref('');
const accountEmail = ref('');
const accountPassword = ref('');
const verificationCode = ref('');
const registering = computed(() => authMode.value === 'register');
const error = ref('');
const notice = ref('');
const pending = ref(false);
const keys = new Map<string, string>();
const selected = computed(() => session.value?.memberships.find((item) => item.householdId === householdId.value));
const errors: Record<number, string> = {
  401: 'Entre na sua conta para acessar sua família.',
  403: 'Sua conta não pode realizar esta operação.',
  404: 'O registro não está disponível para sua conta.',
  409: 'A operação não está mais disponível. Atualize a página e tente novamente.',
  422: 'Confira os dados informados e tente novamente.',
  429: 'Aguarde um pouco antes de tentar novamente.',
  503: 'O serviço de identidade está indisponível neste ambiente.',
};

function idempotencyKey(operation: string) {
  const previous = keys.get(operation);
  if (previous) return previous;
  const key = crypto.randomUUID();
  keys.set(operation, key);
  return key;
}

function api() {
  return client ??= createIdentityClient(fetch, import.meta.env.VITE_API_BASE_URL);
}

async function run(operation: () => Promise<void>) {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation();
  } catch (failure) {
    const status = failure instanceof IdentityError ? failure.status : undefined;
    if (status === 401 || status === 503) {
      session.value = undefined;
      members.value = [];
      inviteToken.value = '';
    }
    error.value = errors[status ?? 0] ?? 'Não foi possível concluir a operação. Tente novamente.';
  } finally {
    pending.value = false;
  }
}

async function loadMembers() {
  members.value = [];
  inviteToken.value = '';
  if (householdId.value) members.value = (await api().members(householdId.value)).members;
}

async function loadSession(preferredId = householdId.value) {
  const context = await api().session();
  // Uma falha temporária preserva as chaves e a troca confirmada de ator as descarta.
  if (keysActor !== context.user.id) {
    keys.clear();
    name.value = '';
    email.value = '';
    invitation.value = '';
    keysActor = context.user.id;
  }
  session.value = context;
  householdId.value = context.memberships.find((item) => item.householdId === preferredId)?.householdId
    ?? context.memberships[0]?.householdId ?? '';
  await loadMembers();
}

function switchAuthMode() {
  authMode.value = authMode.value === 'login' ? 'register' : 'login';
  accountPassword.value = '';
  verificationCode.value = '';
  error.value = '';
  notice.value = '';
}

function submitAuth() {
  return run(async () => {
    const password = accountPassword.value;
    accountPassword.value = '';
    const address = accountEmail.value.trim();
    if (registering.value) {
      await api().signUp(accountName.value.trim(), address, password);
      accountName.value = '';
      authMode.value = 'verify';
      return;
    }
    try {
      await api().signIn(address, password);
    } catch (failure) {
      if (failure instanceof IdentityError && failure.status === 401) {
        error.value = 'E-mail ou senha incorretos.';
        return;
      }
      if (failure instanceof IdentityError && failure.status === 403) {
        authMode.value = 'verify';
        return;
      }
      throw failure;
    }
    accountEmail.value = '';
    await loadSession();
  });
}

function resendVerification() {
  return run(async () => {
    await api().sendVerificationCode(accountEmail.value.trim());
    verificationCode.value = '';
    notice.value = 'Confira sua caixa de entrada para receber o código.';
  });
}

function verifyEmail() {
  return run(async () => {
    try {
      await api().verifyEmail(accountEmail.value.trim(), verificationCode.value.trim());
    } catch (failure) {
      if (failure instanceof IdentityError && [400, 401, 422].includes(failure.status)) {
        error.value = 'Código inválido ou expirado. Confira o código ou peça um novo.';
        return;
      }
      throw failure;
    }
    verificationCode.value = '';
    authMode.value = 'login';
    notice.value = 'E-mail verificado. Entre com sua senha.';
  });
}

function signOut() {
  return run(async () => {
    await api().signOut();
    session.value = undefined;
    members.value = [];
    householdId.value = '';
    name.value = '';
    email.value = '';
    invitation.value = '';
    inviteToken.value = '';
    keys.clear();
    keysActor = undefined;
    notice.value = 'Sessão encerrada.';
  });
}

function createHousehold() {
  return run(async () => {
    const operation = `criar:${name.value.trim()}`;
    const result = await api().createHousehold(name.value.trim(), idempotencyKey(operation));
    keys.delete(operation);
    name.value = '';
    notice.value = 'Família criada.';
    await loadSession(result.id);
  });
}

function createInvitation() {
  return run(async () => {
    inviteToken.value = '';
    const address = email.value.trim();
    const operation = `convidar:${householdId.value}:${address}`;
    const result = await api().invite(householdId.value, address, idempotencyKey(operation));
    keys.delete(operation);
    email.value = '';
    inviteToken.value = result.token;
  });
}

function acceptInvitation() {
  return run(async () => {
    const result = await api().accept(invitation.value.trim());
    invitation.value = '';
    notice.value = 'Convite aceito.';
    await loadSession(result.householdId);
  });
}

function revokeMembership(member: HouseholdMember) {
  if (!window.confirm(`Remover o acesso da conta ${member.authUserId} a esta família?`)) return;
  void run(async () => {
    await api().revoke(householdId.value, member.id);
    notice.value = 'Acesso removido.';
    await loadMembers();
  });
}

onMounted(() => run(async () => {
  try {
    await loadSession();
  } catch (failure) {
    if (!(failure instanceof IdentityError && failure.status === 401)) throw failure;
  }
}));
</script>

<template>
  <main>
    <h1>Nidovra</h1>
    <p v-if="pending" role="status">Aguarde…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="!session && authMode === 'verify'" class="access-form" aria-labelledby="verify-heading"
      @submit.prevent="verifyEmail">
      <h2 id="verify-heading">Confirme seu e-mail</h2>
      <p>Informe o código de verificação de <strong>{{ accountEmail }}</strong>.</p>
      <label for="verification-code">
        Código de verificação
        <input id="verification-code" v-model="verificationCode" inputmode="numeric" autocomplete="one-time-code"
          maxlength="32" required :disabled="pending">
      </label>
      <div class="access-actions">
        <button type="submit" :disabled="pending">Confirmar código</button>
        <button class="secondary" type="button" :disabled="pending" @click="resendVerification">Reenviar código</button>
        <button class="secondary" type="button" :disabled="pending" @click="switchAuthMode">Voltar ao login</button>
      </div>
    </form>
    <form v-else-if="!session" class="access-form" aria-labelledby="access-heading" @submit.prevent="submitAuth">
      <h2 id="access-heading">{{ registering ? 'Criar conta' : 'Entrar' }}</h2>
      <label v-if="registering" for="account-name">
        Nome
        <input id="account-name" v-model="accountName" autocomplete="name" maxlength="120" required :disabled="pending">
      </label>
      <label for="account-email">
        E-mail
        <input id="account-email" v-model="accountEmail" type="email" autocomplete="username" maxlength="254" required :disabled="pending">
      </label>
      <label for="account-password">
        Senha
        <input id="account-password" v-model="accountPassword" type="password"
          :autocomplete="registering ? 'new-password' : 'current-password'"
          :minlength="registering ? 8 : undefined" maxlength="128" required :disabled="pending">
      </label>
      <div class="access-actions">
        <button type="submit" :disabled="pending">{{ registering ? 'Criar conta' : 'Entrar' }}</button>
        <button class="secondary" type="button" :disabled="pending" @click="switchAuthMode">
          {{ registering ? 'Já tenho conta' : 'Criar uma conta' }}
        </button>
      </div>
    </form>

    <template v-if="session">
      <div class="access-actions">
        <p>{{ session.user.email }}</p>
        <button class="secondary" type="button" :disabled="pending" @click="signOut">Sair</button>
      </div>
      <section v-if="session.memberships.length" aria-labelledby="household-heading">
        <h2 id="household-heading">Minha família</h2>
        <label for="household">Família</label>
        <select id="household" v-model="householdId" :disabled="pending" @change="run(loadMembers)">
          <option v-for="item in session.memberships" :key="item.householdId" :value="item.householdId">
            {{ item.householdName }}
          </option>
        </select>
        <ul v-if="members.length">
          <li v-for="(member, index) in members" :key="member.id">
            {{ member.authUserId === session.user.id ? 'Você' : `Integrante ${index + 1}` }}
            · {{ member.role === 'admin' ? 'Administrador' : 'Membro' }}
            <div v-if="selected?.role === 'admin' && member.authUserId !== session.user.id">
              Conta <code>{{ member.authUserId }}</code>
              <button type="button" :disabled="pending" @click="revokeMembership(member)">Remover acesso</button>
            </div>
          </li>
        </ul>
        <form v-if="selected?.role === 'admin'" @submit.prevent="createInvitation">
          <label for="invite-email">E-mail do integrante</label>
          <input id="invite-email" v-model="email" type="email" maxlength="254" required :disabled="pending">
          <button type="submit" :disabled="pending">Criar convite</button>
        </form>
        <label v-if="inviteToken" for="invite-token">
          Código de uso único. Compartilhe somente com a pessoa convidada.
          <input id="invite-token" :value="inviteToken" readonly autocomplete="off">
        </label>
      </section>

      <form @submit.prevent="createHousehold">
        <h2>Criar família</h2>
        <label for="household-name">Nome da família</label>
        <input id="household-name" v-model="name" maxlength="120" required :disabled="pending">
        <button type="submit" :disabled="pending">Criar família</button>
      </form>

      <form @submit.prevent="acceptInvitation">
        <h2>Aceitar convite</h2>
        <label for="accept-token">Código do convite</label>
        <input id="accept-token" v-model="invitation" autocomplete="off" spellcheck="false" required :disabled="pending">
        <button type="submit" :disabled="pending">Aceitar convite</button>
      </form>
    </template>
  </main>
</template>

<style scoped>
main { max-width: 42rem; margin: auto; padding: 1.5rem; color: #172b26; font-family: system-ui, sans-serif; }
section, form { display: grid; gap: .75rem; margin-block: 1rem; }
input, select, button { min-height: 44px; padding: .5rem .75rem; font: inherit; }
input, select { box-sizing: border-box; width: 100%; border: 1px solid #52665c; border-radius: .75rem; }
button { width: fit-content; border: 1px solid #183e35; border-radius: .75rem; color: white; background: #183e35; }
button:disabled { opacity: .55; }
.access-form { max-width: 26rem; }
.access-form > label { display: grid; gap: .25rem; }
.access-form > p { overflow-wrap: anywhere; }
.access-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
.access-actions > p { overflow-wrap: anywhere; }
.secondary { color: #183e35; background: transparent; }
li + li { margin-top: .5rem; }
[role="alert"] { color: #8a3929; }
</style>
