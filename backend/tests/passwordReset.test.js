const assert = require("assert");
const {
  INVALID_RESET_MESSAGE,
  RESET_REQUEST_MESSAGE,
  completePasswordReset,
  hashResetToken,
  requestPasswordReset,
  resetUrl,
  validateResetPasswordInput
} = require("../src/services/passwordReset");

function expectStatus(fn, status, message) {
  try {
    fn();
  } catch (error) {
    assert.strictEqual(error.status, status);
    if (message) {
      assert.strictEqual(error.message, message);
    }
    return;
  }
  assert.fail(`Expected status ${status}`);
}

async function expectRejectStatus(promise, status, message) {
  try {
    await promise;
  } catch (error) {
    assert.strictEqual(error.status, status);
    if (message) {
      assert.strictEqual(error.message, message);
    }
    return;
  }
  assert.fail(`Expected rejection status ${status}`);
}

const env = {
  PASSWORD_RESET_URL_BASE: "https://ridepulse.example/#/reset-password",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_FROM: "RidePulse <no-reply@ridepulse.example>"
};

assert.strictEqual(
  resetUrl("abc 123", env),
  "https://ridepulse.example/#/reset-password?token=abc%20123"
);
expectStatus(() => validateResetPasswordInput("", "long-enough"), 400, INVALID_RESET_MESSAGE);
expectStatus(() => validateResetPasswordInput("token", "short"), 400, "Password must be at least 8 characters.");

async function run() {
  const sent = [];
  const db = new FakeDb({
    user: { id: "user-1", email: "rider@example.com", name: "Rider" }
  });

  const result = await requestPasswordReset({
    db,
    email: " Rider@Example.com ",
    env,
    createTransport: () => ({
      sendMail: async (message) => {
        sent.push(message);
      }
    })
  });

  assert.deepStrictEqual(result, { message: RESET_REQUEST_MESSAGE });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, "rider@example.com");
  assert(sent[0].text.includes("https://ridepulse.example/#/reset-password?token="));
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0].replace("/#/", "/")).searchParams.get("token");
  assert(token);
  assert.strictEqual(db.insertedTokenHash, hashResetToken(token));
  assert.notStrictEqual(db.insertedTokenHash, token);
  assert(db.queries.some((query) => query.sql.startsWith("update password_reset_tokens set used_at")));

  const absentDb = new FakeDb({});
  const absentResult = await requestPasswordReset({
    db: absentDb,
    email: "absent@example.com",
    env,
    createTransport: () => ({
      sendMail: async () => {
        throw new Error("Should not send for absent users");
      }
    })
  });
  assert.deepStrictEqual(absentResult, { message: RESET_REQUEST_MESSAGE });
  assert.strictEqual(absentDb.insertedTokenHash, "");

  await expectRejectStatus(
    requestPasswordReset({
      db,
      email: "rider@example.com",
      env: { PASSWORD_RESET_URL_BASE: "https://ridepulse.example/#/reset-password" }
    }),
    503,
    "Password reset is temporarily unavailable."
  );

  const rawToken = "valid-token";
  const resetDb = new FakeDb({
    resetTokenHash: hashResetToken(rawToken),
    resetRow: { id: "token-1", user_id: "user-1" }
  });
  const resetResult = await completePasswordReset({
    db: resetDb,
    token: rawToken,
    password: "new-password",
    hashPassword: async (password) => `hashed:${password}`
  });
  assert.deepStrictEqual(resetResult, { message: "Password updated. Please sign in with your new password." });
  assert.strictEqual(resetDb.lookedUpTokenHash, hashResetToken(rawToken));
  assert.strictEqual(resetDb.updatedPasswordHash, "hashed:new-password");
  assert.strictEqual(resetDb.usedTokenId, "token-1");
  assert(resetDb.queries.some((query) => query.sql === "commit"));

  await expectRejectStatus(
    completePasswordReset({
      db: new FakeDb({ resetTokenHash: hashResetToken("other-token") }),
      token: "expired-token",
      password: "new-password",
      hashPassword: async () => "hashed"
    }),
    400,
    INVALID_RESET_MESSAGE
  );

  await expectRejectStatus(
    completePasswordReset({
      db: new FakeDb({ resetTokenHash: hashResetToken("used-token") }),
      token: "used-token",
      password: "short",
      hashPassword: async () => "hashed"
    }),
    400,
    "Password must be at least 8 characters."
  );

  console.log("passwordReset tests passed");
}

class FakeDb {
  constructor({ user, resetTokenHash = "", resetRow = null } = {}) {
    this.user = user;
    this.resetTokenHash = resetTokenHash;
    this.resetRow = resetRow;
    this.queries = [];
    this.insertedTokenHash = "";
    this.lookedUpTokenHash = "";
    this.updatedPasswordHash = "";
    this.usedTokenId = "";
  }

  async query(sql, params = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: normalizedSql, params });

    if (normalizedSql.startsWith("select id, email, name from users")) {
      return { rows: this.user ? [this.user] : [] };
    }
    if (normalizedSql.startsWith("update password_reset_tokens set used_at = now() where user_id")) {
      return { rows: [] };
    }
    if (normalizedSql.startsWith("insert into password_reset_tokens")) {
      this.insertedTokenHash = params[1];
      return { rows: [] };
    }
    if (normalizedSql === "begin" || normalizedSql === "commit" || normalizedSql === "rollback") {
      return { rows: [] };
    }
    if (normalizedSql.startsWith("select id, user_id from password_reset_tokens")) {
      this.lookedUpTokenHash = params[0];
      return { rows: params[0] === this.resetTokenHash && this.resetRow ? [this.resetRow] : [] };
    }
    if (normalizedSql.startsWith("update users set password_hash")) {
      this.updatedPasswordHash = params[0];
      return { rows: [] };
    }
    if (normalizedSql.startsWith("update password_reset_tokens set used_at = now() where id")) {
      this.usedTokenId = params[0];
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${normalizedSql}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
