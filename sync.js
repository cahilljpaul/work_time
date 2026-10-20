// Accounts + cloud sync. Only the public (publishable) key lives here; access is enforced by row level security.
const SB_URL = 'https://hjhjavwpwjksjhxgsqns.supabase.co';
const SB_KEY = 'sb_publishable_j6lm5qth1E4pGESMoPZ-fQ_FgvXLqcQ';

const cloud = { client: null, user: null, timer: null, busy: false };

function authUI() {
  const box = $('account');
  if (!cloud.client) { box.innerHTML = ''; return; }
  if (cloud.user) {
    box.innerHTML = `<span class="acct-email"></span><button id="signout" class="ghost">Sign out</button><button id="delacct" class="ghost">Delete my cloud data</button>`;
    box.querySelector('.acct-email').textContent = cloud.user.email;
    $('signout').onclick = () => cloud.client.auth.signOut();
    $('delacct').onclick = async () => {
      if (!confirm('Delete your saved weeks from the cloud? The copy on this device is kept.')) return;
      const { error } = await cloud.client.from('user_data').delete().eq('user_id', cloud.user.id);
      msg(error ? 'Could not delete: ' + error.message : 'Cloud data deleted.');
    };
  } else {
    box.innerHTML = `<input id="aemail" type="email" placeholder="Email" autocomplete="email">
      <input id="apass" type="password" placeholder="Password (optional)" autocomplete="current-password">
      <button id="alink" class="primary">Email me a sign-in link</button>
      <button id="apw" class="ghost">Sign in with password</button>
      <button id="aup" class="ghost">Create account</button>`;
    const em = () => $('aemail').value.trim();
    $('alink').onclick = async () => {
      if (!em()) return msg('Enter your email.');
      const { error } = await cloud.client.auth.signInWithOtp({ email: em(), options: { emailRedirectTo: location.origin + location.pathname } });
      msg(error ? error.message : 'Check your email for the sign-in link.');
    };
    $('apw').onclick = async () => {
      const { error } = await cloud.client.auth.signInWithPassword({ email: em(), password: $('apass').value });
      if (error) msg(error.message);
    };
    $('aup').onclick = async () => {
      if ($('apass').value.length < 12) return msg('Use a password of at least 12 characters, or use the email link instead.');
      const { error } = await cloud.client.auth.signUp({ email: em(), password: $('apass').value, options: { emailRedirectTo: location.origin + location.pathname } });
      msg(error ? error.message : 'Check your email to confirm your account.');
    };
  }
}
function msg(t) { $('acctMsg').textContent = t; }

async function pullCloud() {
  const { data, error } = await cloud.client.from('user_data').select('data,updated_at').maybeSingle();
  if (error) return msg('Sync problem: ' + error.message);
  const localAt = store.updatedAt || 0;
  const remoteAt = data ? Date.parse(data.updated_at) : 0;
  if (data && remoteAt > localAt) {
    const r = data.data || {};
    store.settings = Object.assign({}, DEFAULTS, r.settings);
    store.weeks = r.weeks || {};
    store.exact = r.exact;
    store.updatedAt = remoteAt;
    localStorage.setItem('worktime', JSON.stringify(store));
    applyStep();
    render();
    msg('Synced from your account.');
  } else {
    await pushCloud();
  }
}

async function pushCloud() {
  if (!cloud.client || !cloud.user) return;
  const at = store.updatedAt || Date.now();
  const payload = { settings: store.settings, weeks: store.weeks, exact: store.exact };
  const { error } = await cloud.client.from('user_data')
    .upsert({ user_id: cloud.user.id, data: payload, updated_at: new Date(at).toISOString() });
  msg(error ? 'Sync problem: ' + error.message : 'Saved to your account.');
}

// Called by app.js after every local save.
window.cloudChanged = () => {
  if (!cloud.user) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(pushCloud, 1500);
};

(function init() {
  if (!window.supabase) { $('acctMsg').textContent = 'Accounts unavailable offline.'; return; }
  cloud.client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  cloud.client.auth.onAuthStateChange((_e, session) => {
    const was = cloud.user && cloud.user.id;
    cloud.user = session ? session.user : null;
    authUI();
    if (cloud.user && cloud.user.id !== was) setTimeout(pullCloud, 0);
    if (!cloud.user) msg('');
  });
  authUI();
})();
