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
const membersLoaded = ref(false);
const householdId = ref('');
const name = ref('');
const email = ref('');
const invitation = ref('');
const inviteToken = ref('');
const inviteRecipient = ref('');
const inviteTokenInput = ref<HTMLInputElement | null>(null);
const copyStatus = ref('');
const familyHeading = ref<HTMLHeadingElement | null>(null);
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
  membersLoaded.value = false;
  inviteToken.value = '';
  inviteRecipient.value = '';
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
  membersLoaded.value = false;
  inviteToken.value = '';
  inviteRecipient.value = '';
  if (!householdId.value) return;
  members.value = (await api().members(householdId.value)).members;
  membersLoaded.value = true;
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
    await nextTick();
    familyHeading.value?.focus();
  });
}

function createInvitation() {
  return run(async () => {
    inviteToken.value = '';
    inviteRecipient.value = '';
    copyStatus.value = '';
    const address = email.value.trim();
    const operation = `convidar:${householdId.value}:${address}`;
    const result = await api().invite(householdId.value, address, idempotencyKey(operation));
    keys.delete(operation);
    email.value = '';
    inviteRecipient.value = address;
    inviteToken.value = result.token;
    await nextTick();
    inviteTokenInput.value?.focus();
  });
}

async function copyInvitation() {
  const token = inviteToken.value;
  if (!token) return;
  copyStatus.value = '';
  try {
    await navigator.clipboard.writeText(token);
    if (inviteToken.value === token) copyStatus.value = 'Código copiado.';
  } catch {
    if (inviteToken.value !== token) return;
    inviteTokenInput.value?.focus();
    inviteTokenInput.value?.select();
    copyStatus.value = 'Código selecionado para copiar manualmente.';
  }
}

function acceptInvitation() {
  return run(async () => {
    const result = await api().accept(invitation.value.trim());
    invitation.value = '';
    notice.value = 'Convite aceito.';
    await loadSession(result.householdId);
    await nextTick();
    familyHeading.value?.focus();
  });
}

function revokeMembership(member: HouseholdMember, position: number) {
  if (!window.confirm(`Remover o acesso de Integrante ${position} a esta família?`)) return;
  void run(async () => {
    await api().revoke(householdId.value, member.id);
    notice.value = 'Acesso removido.';
    await loadMembers();
  });
}

onMounted(() => run(checkSession));
</script>

<template>
  <main class="identity-page" :class="session ? 'family-page' : 'access-page'">
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

    <div v-else class="family-shell">
      <header class="family-header">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">N</span>
          <p>Nidovra</p>
        </div>
        <div class="family-account">
          <span>{{ session.user.email }}</span>
          <button class="secondary" type="button" :disabled="pending" @click="signOut">Sair</button>
        </div>
      </header>

      <section class="family-hero" aria-labelledby="family-heading">
        <div class="family-hero-copy">
          <p v-if="selected" class="family-role">
            {{ selected.role === 'admin' ? 'Administrador da família' : 'Membro da família' }}
          </p>
          <h1 id="family-heading" ref="familyHeading" tabindex="-1">
            {{ selected?.householdName ?? 'Configure sua família' }}
          </h1>
          <p v-if="selected">Seu espaço para reunir as pessoas da casa e organizar as finanças em conjunto.</p>
          <p v-else>Crie seu próprio espaço familiar ou use o código de um convite que você recebeu.</p>
        </div>
        <div class="family-hero-art" aria-hidden="true"></div>
      </section>

      <div v-if="pending || error || notice" class="family-feedback">
        <p v-if="pending" role="status">Aguarde…</p>
        <p v-if="error" class="message failure" role="alert">{{ error }}</p>
        <p v-if="notice" class="message success" role="status">{{ notice }}</p>
      </div>

      <div class="family-grid">
        <section v-if="selected" class="family-card people-card" aria-labelledby="people-heading">
          <header class="people-heading">
            <div>
              <h2 id="people-heading">Pessoas da família</h2>
              <p>Contas com acesso a este espaço.</p>
            </div>
            <span v-if="membersLoaded" class="member-count">
              {{ members.length }} {{ members.length === 1 ? 'integrante' : 'integrantes' }}
            </span>
          </header>
          <label v-if="session.memberships.length > 1" class="family-field" for="household">
            Trocar de família
            <select id="household" v-model="householdId" :disabled="pending" @change="run(loadMembers)">
              <option v-for="item in session.memberships" :key="item.householdId" :value="item.householdId">
                {{ item.householdName }}
              </option>
            </select>
          </label>
          <ul v-if="membersLoaded && members.length" class="member-list">
            <li v-for="(member, index) in members" :key="member.id" class="member-row">
              <span class="member-avatar" aria-hidden="true">{{ member.authUserId === session.user.id ? 'V' : 'I' }}</span>
              <span class="member-label">
                <strong>{{ member.authUserId === session.user.id ? 'Você' : `Integrante ${index + 1}` }}</strong>
                <small>{{ member.role === 'admin' ? 'Administrador' : 'Membro' }}</small>
              </span>
              <button v-if="selected.role === 'admin' && member.authUserId !== session.user.id"
                class="secondary remove-access" type="button" :disabled="pending"
                :aria-label="`Remover acesso de Integrante ${index + 1}`" @click="revokeMembership(member, index + 1)">
                Remover acesso
              </button>
            </li>
          </ul>
          <p v-else-if="membersLoaded">Nenhum integrante foi encontrado para esta família.</p>
          <button v-else-if="!pending" class="secondary" type="button" @click="run(loadMembers)">Tentar carregar integrantes</button>
          <p v-if="membersLoaded && members.length === 1 && selected.role === 'admin'" class="family-note">
            Você já pode usar este espaço. Convidar alguém é opcional.
          </p>
        </section>

        <section class="family-card next-card" aria-labelledby="next-heading">
          <h2 id="next-heading">{{ selected ? 'Próximo passo' : 'Como começar' }}</h2>
          <template v-if="selected?.role === 'admin'">
            <p>Para compartilhar o acesso, gere um código vinculado ao e-mail da pessoa convidada.</p>
            <form class="family-form" @submit.prevent="createInvitation">
              <label class="family-field" for="invite-email">
                E-mail da pessoa convidada
                <input id="invite-email" v-model="email" type="email" maxlength="254" required :disabled="pending"
                  placeholder="nome@exemplo.com" aria-describedby="invite-help">
              </label>
              <p id="invite-help">Envie o código você mesmo. A pessoa entra com esse e-mail e cola o código em “Aceitar convite”.</p>
              <button type="submit" :disabled="pending">Gerar código de convite</button>
            </form>
            <div v-if="inviteToken" class="issued-invite">
              <label class="family-field" for="invite-token">
                Código de uso único
                <input id="invite-token" ref="inviteTokenInput" :value="inviteToken" readonly autocomplete="off">
              </label>
              <p>Compartilhe somente com {{ inviteRecipient }}.</p>
              <button type="button" class="secondary" :disabled="pending" @click="copyInvitation">Copiar código</button>
              <p v-if="copyStatus" role="status">{{ copyStatus }}</p>
            </div>
          </template>
          <p v-else-if="selected">Você já participa desta família. Se recebeu um convite para outro espaço, aceite abaixo.</p>
          <p v-else>Escolha um nome para o espaço da casa. Se alguém já criou a família, use o código recebido.</p>

          <form v-if="!selected" class="family-form" @submit.prevent="createHousehold">
            <label class="family-field" for="household-name">
              Nome da família
              <input id="household-name" v-model="name" maxlength="120" required :disabled="pending" placeholder="Ex.: Casa Oliveira">
            </label>
            <button type="submit" :disabled="pending">Criar minha família</button>
          </form>
        </section>

        <section class="family-card family-options" aria-labelledby="options-heading">
          <h2 id="options-heading">{{ selected ? 'Outras ações' : 'Já recebeu um convite?' }}</h2>
          <details>
            <summary>Aceitar convite</summary>
            <form class="family-form" @submit.prevent="acceptInvitation">
              <p id="accept-help">Entre com o e-mail para o qual o convite foi criado e cole o código recebido.</p>
              <label class="family-field" for="accept-token">
                Código do convite
                <input id="accept-token" v-model="invitation" autocomplete="off" spellcheck="false" required
                  :disabled="pending" aria-describedby="accept-help">
              </label>
              <button type="submit" :disabled="pending">Confirmar convite</button>
            </form>
          </details>
          <details v-if="selected">
            <summary>Criar outra família</summary>
            <form class="family-form" @submit.prevent="createHousehold">
              <p>Crie um espaço separado se precisar acompanhar outra casa.</p>
              <label class="family-field" for="another-household-name">
                Nome da nova família
                <input id="another-household-name" v-model="name" maxlength="120" required :disabled="pending">
              </label>
              <button type="submit" :disabled="pending">Criar nova família</button>
            </form>
          </details>
        </section>
      </div>

      <footer class="family-footer">
        <p>Famílias e convites já estão disponíveis. As ferramentas financeiras chegam em etapas.</p>
      </footer>
    </div>
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

.family-page {
  --canvas: #f4f2eb;
  --surface: #fffefa;
  --line: #dadfd4;
  max-inline-size: none;
  min-block-size: 100svh;
  padding: 0 clamp(1rem, 4vw, 3rem);
  background: var(--canvas);
}

.family-shell { inline-size: min(100%, 74rem); margin-inline: auto; }

.family-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: .75rem 1.5rem;
  padding-block: 1rem;
}

.family-header .brand { margin: 0; }
.family-header .brand-mark { flex: none; }

.family-account {
  display: flex;
  flex: 0 1 auto;
  min-inline-size: 0;
  align-items: center;
  gap: .5rem 1rem;
  color: var(--muted);
  font-size: .875rem;
}

.family-account > span { overflow-wrap: anywhere; }
.family-account button { flex: none; border-color: #afbaab; }

.family-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  margin: 0;
  border-radius: 1.25rem;
  color: #fbf8ec;
  background: #203d35;
}

.family-hero-copy {
  position: relative;
  z-index: 1;
  display: grid;
  align-content: center;
  gap: .75rem;
  padding: clamp(1.25rem, 4vw, 3rem);
  min-inline-size: 0;
}

.family-hero h1 {
  font: 400 clamp(2.125rem, 5.4vw, 4rem)/1.02 Georgia, serif;
  overflow-wrap: anywhere;
}

.family-hero h1:focus-visible { outline: 2px solid #f2cf88; outline-offset: .375rem; }
.family-hero p { margin: 0; max-inline-size: 37ch; color: #e9ecdf; }
.family-hero .family-role { color: #f2cf88; font-size: .875rem; font-weight: 700; }
.family-hero-art { display: none; }

.family-feedback { margin-block: 1rem; }
.family-feedback > p { margin: .5rem 0; }

.family-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
  margin-block-start: 1rem;
}

.family-card {
  min-inline-size: 0;
  margin: 0;
  padding: clamp(1rem, 3vw, 1.75rem);
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: var(--surface);
}

.family-card h2 {
  font: 400 clamp(1.375rem, 3vw, 1.75rem)/1.12 Georgia, serif;
  color: var(--ink);
}

.family-card p { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
.people-heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: .5rem 1rem; }
.people-heading p { margin-block-start: .375rem; }
.member-count {
  padding: .25rem .625rem;
  border-radius: 2rem;
  color: var(--accent);
  background: #e8efe3;
  font-size: .8125rem;
  font-weight: 700;
}

.member-list { display: grid; gap: .25rem; margin: 0; padding: 0; list-style: none; }
.member-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: .5rem .75rem;
  margin: 0;
  padding-block: .75rem;
  border-block-start: 1px solid var(--line);
}
.member-row:last-child { border-block-end: 1px solid var(--line); }
.member-avatar {
  display: grid;
  place-items: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: 50%;
  color: var(--accent);
  background: #e6ece1;
  font-weight: 700;
}
.member-label { display: grid; }
.member-label small { color: var(--muted); }
.remove-access { grid-column: 2; border-color: #a5b3a7; font-size: .875rem; }

.family-card .family-note {
  margin-block-start: .25rem;
  padding: .75rem;
  border-radius: .75rem;
  color: var(--accent);
  background: #edf2e8;
}

.family-form { gap: .625rem; margin-block: .25rem 0; }
.family-field { display: grid; gap: .375rem; font-weight: 650; }
.family-form p, .issued-invite p { font-size: .875rem; }
.issued-invite {
  display: grid;
  gap: .625rem;
  padding: .75rem;
  border: 1px solid #b9c9b6;
  border-radius: .75rem;
  background: #f1f5ee;
}
.issued-invite input { font-family: ui-monospace, monospace; }

.family-options { gap: .25rem; }
.family-options h2 { margin-block-end: .375rem; }
.family-options details {
  border-block-start: 1px solid var(--line);
  padding-block: .125rem;
}
.family-options summary {
  box-sizing: border-box;
  min-block-size: 44px;
  padding-block: .625rem;
  color: var(--accent);
  font-weight: 650;
  cursor: pointer;
}
.family-options summary:focus-visible { outline: 3px solid #27866a; outline-offset: 2px; border-radius: .25rem; }
.family-options .family-form { margin-block: .125rem .75rem; }
.family-footer { padding-block: 1rem 1.5rem; color: var(--muted); font-size: .875rem; }
.family-footer p { margin: 0; }

@media (min-width: 34rem) {
  .member-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .remove-access { grid-column: auto; }
}

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
  .family-header { padding-block: 1.25rem; }
  .family-hero {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: 0;
    min-block-size: 16rem;
  }
  .family-hero-art {
    display: block;
    background:
      linear-gradient(90deg, #203d35, #203d3500 45%),
      url('/images/nidovra-login.webp') center 60% / cover;
  }
  .family-grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, .9fr); }
  .people-card { grid-row: span 2; }
}
</style>
