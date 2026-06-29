const crypto = require("crypto");
const nodemailer = require("nodemailer");

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_REQUEST_MESSAGE = "If that email exists, we sent a password reset link.";
const INVALID_RESET_MESSAGE = "Reset link is invalid or expired.";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "Enter a valid email address.");
  }
  return email;
}

function validateResetPasswordInput(token, password) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    throw httpError(400, INVALID_RESET_MESSAGE);
  }
  if (String(password || "").length < 8) {
    throw httpError(400, "Password must be at least 8 characters.");
  }
  return { token: cleanToken, password: String(password) };
}

function createResetToken() {
  return crypto
    .randomBytes(RESET_TOKEN_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function resetUrl(token, env = process.env) {
  const baseUrl = String(env.PASSWORD_RESET_URL_BASE || "").trim();
  if (!baseUrl) {
    throw configError("PASSWORD_RESET_URL_BASE is not configured");
  }
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

function smtpSettings(env = process.env) {
  const host = String(env.SMTP_HOST || "").trim();
  const from = String(env.SMTP_FROM || "").trim();
  if (!host || !from) {
    return null;
  }

  const port = Number.parseInt(String(env.SMTP_PORT || "587"), 10);
  const user = String(env.SMTP_USER || "").trim();
  const pass = String(env.SMTP_PASS || "");
  const secure = String(env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

  return {
    from,
    transport: {
      host,
      port: Number.isFinite(port) ? port : 587,
      secure,
      ...(user || pass ? { auth: { user, pass } } : {})
    }
  };
}

function ensurePasswordResetConfig(env = process.env) {
  resetUrl("configuration-check", env);
  const smtp = smtpSettings(env);
  if (!smtp) {
    throw configError("SMTP_HOST and SMTP_FROM are required for password reset email");
  }
  return smtp;
}

function passwordResetConfigStatus(env = process.env) {
  return {
    resetUrl: Boolean(String(env.PASSWORD_RESET_URL_BASE || "").trim()),
    smtpHost: Boolean(String(env.SMTP_HOST || "").trim()),
    smtpPort: String(env.SMTP_PORT || "587"),
    smtpSecure: String(env.SMTP_SECURE || "").toLowerCase() === "true" || String(env.SMTP_PORT || "") === "465",
    smtpUser: Boolean(String(env.SMTP_USER || "").trim()),
    smtpPass: Boolean(String(env.SMTP_PASS || "")),
    smtpFrom: Boolean(String(env.SMTP_FROM || "").trim())
  };
}

async function requestPasswordReset({
  db,
  email,
  env = process.env,
  createTransport = nodemailer.createTransport,
  logger = console
}) {
  const cleanEmail = validateEmail(normalizeEmail(email));
  const smtp = ensurePasswordResetConfig(env);
  const result = await db.query("select id, email, name from users where email = $1", [cleanEmail]);
  const user = result.rows[0];

  if (!user) {
    logger.info("Password reset requested for unknown account", {
      emailDomain: emailDomain(cleanEmail)
    });
    return { message: RESET_REQUEST_MESSAGE };
  }

  const token = createResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.query("update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null", [user.id]);
  await db.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  const link = resetUrl(token, env);
  try {
    await createTransport(smtp.transport).sendMail({
      from: smtp.from,
      to: user.email,
      subject: "Reset your RidePulse password",
      text: [
        `Hi ${user.name || "Rider"},`,
        "",
        "Use this link to reset your RidePulse password. It expires in 30 minutes:",
        link,
        "",
        "If you did not request this, you can ignore this email."
      ].join("\n"),
      html: passwordResetEmailHtml(user.name || "Rider", link)
    });
    logger.info("Password reset email accepted by SMTP", {
      userId: user.id,
      emailDomain: emailDomain(user.email)
    });
  } catch (error) {
    logger.warn("Password reset email failed", {
      configured: true,
      userId: user.id,
      emailDomain: emailDomain(user.email),
      code: error?.code,
      command: error?.command,
      responseCode: error?.responseCode,
      message: error instanceof Error ? error.message : "Unknown mail error"
    });
  }

  return { message: RESET_REQUEST_MESSAGE };
}

async function completePasswordReset({ db, token, password, hashPassword }) {
  const input = validateResetPasswordInput(token, password);
  const tokenHash = hashResetToken(input.token);
  const passwordHash = await hashPassword(input.password);

  await db.query("begin");
  try {
    const result = await db.query(
      `select id, user_id
       from password_reset_tokens
       where token_hash = $1
         and used_at is null
         and expires_at > now()
       for update`,
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      throw httpError(400, INVALID_RESET_MESSAGE);
    }

    await db.query("update users set password_hash = $1 where id = $2", [passwordHash, row.user_id]);
    await db.query("update password_reset_tokens set used_at = now() where id = $1", [row.id]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  return { message: "Password updated. Please sign in with your new password." };
}

function passwordResetEmailHtml(name, link) {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>Hi ${safeName},</p>
      <p>Use this link to reset your RidePulse password. It expires in 30 minutes.</p>
      <p><a href="${safeLink}" style="color: #2563eb;">Reset password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function emailDomain(email) {
  return String(email || "").split("@")[1] || "unknown";
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function configError(message) {
  const error = httpError(503, "Password reset is temporarily unavailable.");
  error.configMessage = message;
  return error;
}

module.exports = {
  INVALID_RESET_MESSAGE,
  RESET_REQUEST_MESSAGE,
  completePasswordReset,
  ensurePasswordResetConfig,
  hashResetToken,
  passwordResetConfigStatus,
  requestPasswordReset,
  resetUrl,
  validateResetPasswordInput
};
