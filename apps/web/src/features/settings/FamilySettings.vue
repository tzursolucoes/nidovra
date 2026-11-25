<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import {
  createIdentityClient, IdentityError, type HouseholdMember, type SessionContext,
} from './identity-client';

let client: ReturnType<typeof createIdentityClient> | undefined;
let keysActor: string | undefined;
let verificationLogin: { address: string; password: string } | undefined;
let nextField: 'code' | 'password' | undefined;
const session = ref<SessionContext>();
const members = ref<HouseholdMember[]>([]);
const householdId = ref('');
const name = ref('');
const email = ref('');
const invitation = ref('');
const inviteToken = ref('');
const authMode = ref<'login' | 'register' | 'verify' | 'connecting'>('connecting');
const accountName = ref('');
const accountEmail = ref('');
const accountPassword = ref('');
const verifiedAddress = ref<string>();
const emailVerified = computed(() => verifiedAddress.value === accountEmail.value.trim().toLowerCase());
const verificationCode = ref('');
const passwordInput = ref<HTMLInputElement | null>(null);
const codeInput = ref<HTMLInputElement | null>(null);
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
  503: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
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

function returnToLogin() {
  session.value = undefined;
  members.value = [];
  inviteToken.value = '';
  authMode.value = 'login';
}

async function run(operation: () => Promise<unknown>) {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation();
  } catch (failure) {
    const status = failure instanceof IdentityError ? failure.status : undefined;
    if (status === 401) returnToLogin();
    error.value = status === 503 && authMode.value === 'connecting' && !session.value
      ? 'Não foi possível carregar sua sessão agora. Tente novamente em instantes.'
      : errors[status ?? 0] ?? 'Não foi possível concluir a operação. Tente novamente.';
  } finally {
    pending.value = false;
    if (nextField) {
      const field = nextField === 'code' ? codeInput : passwordInput;
      nextField = undefined;
      await nextTick();
      field.value?.focus();
    }
  }
}

async function loadMembers() {
  members.value = [];
  inviteToken.value = '';
  if (householdId.value) members.value = (await api().members(householdId.value)).members;
}

async function loadSession(preferredId = householdId.value) {
  await applySession(await api().session(), preferredId);
}

async function applySession(context: SessionContext, preferredId = householdId.value) {
  // Uma falha temporária preserva as chaves e a troca confirmada de ator as descarta.
  if (keysActor !== context.user.id) {
    keys.clear();
    name.value = '';
    email.value = '';
    invitation.value = '';
    keysActor = context.user.id;
  }
  session.value = context;
  accountPassword.value = '';
  verificationLogin = undefined;
  householdId.value = context.memberships.find((item) => item.householdId === preferredId)?.householdId
    ?? context.memberships[0]?.householdId ?? '';
  await loadMembers();
}

function switchAuthMode() {
  authMode.value = authMode.value === 'login' ? 'register' : 'login';
  accountPassword.value = '';
  verificationCode.value = '';
  verificationLogin = undefined;
  verifiedAddress.value = undefined;
  error.value = '';
  notice.value = '';
}

function requestVerification(address: string, password: string) {
  accountEmail.value = address;
  verificationLogin = { address, password };
  authMode.value = 'verify';
  nextField = 'code';
}

async function checkSession() {
  try {
    await loadSession();
    return null;
  } catch (failure) {
    if (!(failure instanceof IdentityError && [401, 403].includes(failure.status))) throw failure;
    returnToLogin();
    if (emailVerified.value) nextField = 'password';
    return failure.status;
  }
}

async function connectVerifiedSession(address: string, password?: string) {
  const context = await api().sessionAfterVerification(address, password);
  if (context) {
    await applySession(context);
  } else {
    returnToLogin();
    nextField = 'password';
  }
}

function retrySession() {
  return run(emailVerified.value ? () => connectVerifiedSession(accountEmail.value.trim()) : checkSession);
}

function submitAuth() {
  return run(async () => {
    const password = accountPassword.value;
    accountPassword.value = '';
    const address = accountEmail.value.trim();
    if (registering.value) {
      await api().signUp(accountName.value.trim(), address, password);
      accountName.value = '';
      requestVerification(address, password);
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
        requestVerification(address, password);
        return;
      }
      throw failure;
    }
    authMode.value = 'connecting';
    if (emailVerified.value) {
      await connectVerifiedSession(address);
      return;
    }
    const status = await checkSession();
    if (status === 403) {
      requestVerification(address, password);
    } else if (status === 401) {
      error.value = 'A sessão não iniciou. Tente entrar novamente.';
      nextField = 'password';
    }
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
    const address = accountEmail.value.trim();
    try {
      await api().verifyEmail(address, verificationCode.value.trim());
    } catch (failure) {
      if (failure instanceof IdentityError && [400, 401, 422].includes(failure.status)) {
        error.value = 'Código inválido ou expirado. Confira o código ou peça um novo.';
        return;
      }
      throw failure;
    }
    verificationCode.value = '';
    verifiedAddress.value = address.toLowerCase();
    authMode.value = 'connecting';
    const password = verificationLogin?.address === address ? verificationLogin.password : undefined;
    verificationLogin = undefined;
    await connectVerifiedSession(address, password);
  });
}

function signOut() {
  return run(async () => {
    await api().signOut();
    returnToLogin();
    verifiedAddress.value = undefined;
    accountPassword.value = '';
    verificationLogin = undefined;
    householdId.value = '';
    name.value = '';
    email.value = '';
    invitation.value = '';
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

onMounted(() => run(checkSession));
</script>

<template>
  <main class="identity-page" :class="{ 'access-page': !session }">
    <div v-if="!session" class="access-layout">
      <div class="access-content">
        <header class="brand">
          <span class="brand-mark" aria-hidden="true">N</span>
          <p>Nidovra</p>
        </header>

        <p v-if="emailVerified" class="message success" role="status">
          E-mail confirmado.<template v-if="authMode === 'login'"> Entre com a sua senha.</template>
        </p>
        <p v-if="error" class="message failure" role="alert">{{ error }}</p>
        <p v-if="notice" class="message success" role="status">{{ notice }}</p>

        <section v-if="authMode === 'connecting'" class="access-form" aria-labelledby="session-heading">
          <h1 id="session-heading">Acesse sua conta</h1>
          <p v-if="pending" role="status">Carregando sua sessão…</p>
          <button v-else type="button" @click="retrySession">Tentar carregar sessão</button>
        </section>

        <form v-else-if="authMode === 'verify'" class="access-form" aria-labelledby="verify-heading"
          @submit.prevent="verifyEmail">
          <h1 id="verify-heading">Confirme seu e-mail</h1>
          <p>Informe o código de verificação enviado para <strong>{{ accountEmail }}</strong>.</p>
          <label for="verification-code">
            Código de verificação
            <input id="verification-code" ref="codeInput" v-model="verificationCode" inputmode="numeric"
              autocomplete="one-time-code" maxlength="32" required :disabled="pending">
          </label>
          <button type="submit" :disabled="pending">{{ pending ? 'Aguarde…' : 'Confirmar código' }}</button>
          <div class="access-actions">
            <button class="secondary" type="button" :disabled="pending" @click="resendVerification">Reenviar código</button>
            <button class="secondary" type="button" :disabled="pending" @click="switchAuthMode">Voltar ao login</button>
          </div>
        </form>

        <form v-else class="access-form" aria-labelledby="access-heading" @submit.prevent="submitAuth">
          <h1 id="access-heading">{{ registering ? 'Criar conta' : 'Entrar' }}</h1>
          <p>{{ registering ? 'Use um e-mail que você possa confirmar.' : 'Organize as finanças da sua casa.' }}</p>
          <label v-if="registering" for="account-name">
            Nome
            <input id="account-name" v-model="accountName" autocomplete="name" maxlength="120" required :disabled="pending">
          </label>
          <label for="account-email">
            E-mail
            <input id="account-email" v-model="accountEmail" type="email" autocomplete="username"
              maxlength="254" required :disabled="pending">
          </label>
          <label for="account-password">
            Senha
            <input id="account-password" ref="passwordInput" v-model="accountPassword" type="password"
              :autocomplete="registering ? 'new-password' : 'current-password'"
              :minlength="registering ? 8 : undefined" maxlength="128" required :disabled="pending">
          </label>
          <button type="submit" :disabled="pending">
            {{ pending ? 'Aguarde…' : registering ? 'Criar conta' : 'Entrar' }}
          </button>
          <button class="secondary switch-mode" type="button" :disabled="pending" @click="switchAuthMode">
            {{ registering ? 'Já tenho conta' : 'Criar uma conta' }}
          </button>
        </form>
      </div>
      <aside class="access-art" aria-hidden="true"></aside>
    </div>

    <template v-else>
      <h1>Nidovra</h1>
      <p v-if="pending" role="status">Aguarde…</p>
      <p v-if="error" class="message failure" role="alert">{{ error }}</p>
      <p v-if="notice" class="message success" role="status">{{ notice }}</p>
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
:global(body) { margin: 0; }

.identity-page {
  --canvas: #f6f7f3;
  --surface: #fff;
  --ink: #172b26;
  --muted: #52665c;
  --accent: #183e35;
  --line: #dfe6e0;
  box-sizing: border-box;
  max-inline-size: 42rem;
  margin-inline: auto;
  padding: clamp(1rem, 5vw, 2rem);
  color: var(--ink);
  font-family: Inter, system-ui, sans-serif;
  line-height: 1.5;
}

.access-page {
  display: grid;
  align-items: center;
  max-inline-size: none;
  min-block-size: 100svh;
  padding: clamp(1rem, 4vw, 3rem);
  background: var(--canvas);
}

.access-layout {
  display: grid;
  width: min(100%, 31rem);
  margin-inline: auto;
  border: 1px solid var(--line);
  border-radius: 1.25rem;
  background: var(--surface);
  box-shadow: 0 18px 64px #172b260d;
}

.access-content {
  box-sizing: border-box;
  min-inline-size: 0;
  align-self: center;
  padding: clamp(1rem, 5vw, 3.5rem);
}

.brand {
  display: flex;
  align-items: center;
  gap: .75rem;
  margin-block-end: clamp(1.5rem, 4vw, 3rem);
}

.brand p {
  margin: 0;
  color: var(--accent);
  font-family: Georgia, serif;
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -.025em;
}

.brand-mark {
  display: grid;
  place-items: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: .75rem;
  color: #fff;
  background: var(--accent);
  font: 700 1.125rem Georgia, serif;
}

.access-art { display: none; }

h1, h2 {
  margin: 0;
  font-family: 'Plus Jakarta Sans', Inter, system-ui, sans-serif;
  font-weight: 750;
  line-height: 1.13;
  letter-spacing: -.045em;
}

.access-form h1 { font-size: clamp(1.75rem, 4vw, 2.75rem); }
.access-form > p { margin: 0; color: var(--muted); }
section, form { display: grid; gap: .75rem; margin-block: 1rem; }
.access-form { margin: 0; gap: 1rem; }
.access-form > label { display: grid; gap: .375rem; font-weight: 600; }
.access-content, .access-actions > p, li { overflow-wrap: anywhere; }

input, select, button {
  box-sizing: border-box;
  min-block-size: 44px;
  padding: .625rem .875rem;
  border-radius: .75rem;
  font: inherit;
}

input, select {
  inline-size: 100%;
  min-inline-size: 0;
  border: 1px solid #829389;
  color: var(--ink);
  background: var(--surface);
}

button {
  inline-size: fit-content;
  max-inline-size: 100%;
  border: 1px solid var(--accent);
  color: #fff;
  background: var(--accent);
  font-weight: 650;
  white-space: normal;
  cursor: pointer;
}

button:disabled { opacity: .65; cursor: default; }
:is(input, select, button):focus-visible { outline: 3px solid #27866a; outline-offset: 3px; }
.access-form > button { inline-size: 100%; }
.access-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
.access-actions > p { margin-block: .5rem; }
.secondary { color: var(--accent); background: transparent; }
.switch-mode { border-color: var(--line); }
.message { margin: 0 0 1rem; padding: .75rem; border: 1px solid; border-radius: .75rem; }
.failure { color: #8a3929; border-color: #e8c4bb; background: #fff5f2; }
.success { color: #235a47; border-color: #c5ded2; background: #eef7f1; }
li + li { margin-block-start: .5rem; }

@media (min-width: 58rem) {
  .access-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    width: min(100%, 72rem);
    min-block-size: clamp(34rem, 75svh, 48rem);
  }
  .access-content { padding-inline: clamp(2rem, 5vw, 5rem); }
  .access-art {
    display: block;
    margin: .5rem;
    border-radius: 1rem;
    background: #56604a url('/images/nidovra-login.webp') center 55% / cover no-repeat;
  }
}
</style>
