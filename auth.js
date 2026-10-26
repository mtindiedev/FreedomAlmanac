import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://vwxfdgkzyndbfatajsmp.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_cdrmCpjtDYFym0SpbZj_dQ_yMi8nRpF";

export const authClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

let pendingEmail = "";
let sendAvailableAt = 0;
let cooldownTimer = null;

function setAccountStatus(message) {
  const element = document.getElementById("account-status");

  if (element) {
    element.textContent = message;
  }
}

function renderAccount(user) {
  document.getElementById("account-loading")
    ?.classList.add("hidden");

  document.getElementById("account-signed-out")
    ?.classList.toggle("hidden", Boolean(user));

  document.getElementById("account-signed-in")
    ?.classList.toggle("hidden", !user);

  const emailElement = document.getElementById(
    "account-user-email"
  );

  if (emailElement) {
    emailElement.textContent = user?.email || "";
  }

  if (user) {
    pendingEmail = "";

    document.getElementById("account-code-form")
      ?.classList.add("hidden");

    const codeInput = document.getElementById("account-code");

    if (codeInput) {
      codeInput.value = "";
    }
  }
}

function setEmailRequestBusy(busy) {
  const button = document.getElementById("account-send-code");

  if (!button) return;

  button.disabled = busy;
  button.textContent = busy
    ? "Sending…"
    : "Send Sign-in Code";
}

function startSendCooldown() {
  sendAvailableAt = Date.now() + 60000;

  if (cooldownTimer) {
    clearInterval(cooldownTimer);
  }

  const update = () => {
    const button = document.getElementById("account-send-code");

    if (!button) return;

    const seconds = Math.max(
      0,
      Math.ceil((sendAvailableAt - Date.now()) / 1000)
    );

    button.disabled = seconds > 0;

    button.textContent = seconds > 0
      ? `Send Again in ${seconds}s`
      : "Send Sign-in Code";

    if (seconds === 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  };

  update();
  cooldownTimer = setInterval(update, 1000);
}

export async function setupAccountAuth() {
  const emailForm = document.getElementById(
    "account-email-form"
  );

  const codeForm = document.getElementById(
    "account-code-form"
  );

  if (!emailForm || !codeForm) return;

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (Date.now() < sendAvailableAt) return;

    const email = document.getElementById("account-email")
      .value.trim();

    setEmailRequestBusy(true);
    setAccountStatus("");

    try {
      const { error } = await authClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      pendingEmail = email;

      document.getElementById("account-code").value = "";

      document.getElementById(
        "account-code-destination"
      ).textContent = `Enter the code sent to ${email}.`;

      codeForm.classList.remove("hidden");

      setAccountStatus(
        "Code requested. Check your inbox and spam folder."
      );

      startSendCooldown();

      document.getElementById("account-code").focus();
    } catch (error) {
      console.error("Sign-in code request failed:", error);

      setEmailRequestBusy(false);

      setAccountStatus(
        error.message || "Could not send the sign-in code."
      );
    }
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!pendingEmail) {
      setAccountStatus("Request a sign-in code first.");
      return;
    }

    const token = document.getElementById("account-code")
      .value.replace(/\s/g, "");

    if (!token) {
      setAccountStatus("Enter the code from your email.");
      return;
    }

    const button = document.getElementById(
      "account-verify-code"
    );

    const changeEmailButton = document.getElementById(
      "account-change-email"
    );

    button.disabled = true;
    changeEmailButton.disabled = true;
    button.textContent = "Verifying…";

    try {
      const { data, error } = await authClient.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email",
      });

      if (error) throw error;

      if (!data.session || !data.user) {
        throw new Error(
          "Verification did not produce a signed-in session."
        );
      }

      renderAccount(data.user);

      setAccountStatus(
        "You are signed in. No subscription has been started."
      );
    } catch (error) {
      console.error("Code verification failed:", error);

      setAccountStatus(
        error.message || "Could not verify the code."
      );
    } finally {
      button.disabled = false;
      changeEmailButton.disabled = false;
      button.textContent = "Verify and Sign In";
    }
  });

  document.getElementById("account-change-email")
    ?.addEventListener("click", () => {
      pendingEmail = "";

      codeForm.classList.add("hidden");
      document.getElementById("account-code").value = "";

      setAccountStatus(
        "Enter the email address you want to use."
      );

      document.getElementById("account-email").focus();
    });

  document.getElementById("account-sign-out")
    ?.addEventListener("click", async () => {
      const button = document.getElementById("account-sign-out");

      button.disabled = true;

      try {
        const { error } = await authClient.auth.signOut({
          scope: "local",
        });

        if (error) throw error;

        renderAccount(null);
        setAccountStatus("You are signed out on this browser.");
      } catch (error) {
        console.error("Sign-out failed:", error);

        setAccountStatus(
          error.message || "Could not sign out."
        );
      } finally {
        button.disabled = false;
      }
    });

  authClient.auth.onAuthStateChange((_event, session) => {
    renderAccount(session?.user || null);
  });

  try {
    const { data, error } = await authClient.auth.getUser();

    if (error) {
      console.warn("No verified current user:", error.message);
    }

    renderAccount(error ? null : data.user);
  } catch (error) {
    console.error("Could not check sign-in status:", error);

    renderAccount(null);
    setAccountStatus(
      "Could not check your account. Try signing in again."
    );
  }
}