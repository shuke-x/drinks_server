import { hashPassword, verifyPasswordHash } from "./password-hash.util";

describe("password hash utilities", () => {
  it("verifies the password used to create an Argon2id hash", async () => {
    const hash = await hashPassword("StrongPassword1!");

    await expect(verifyPasswordHash(hash, "StrongPassword1!")).resolves.toBe(
      true,
    );
    await expect(verifyPasswordHash(hash, "WrongPassword1!")).resolves.toBe(
      false,
    );
  });

  it.each([undefined, null, "", "not-an-argon2-hash", "$argon2id$broken"])(
    "returns false instead of throwing for an invalid stored hash: %p",
    async (hash) => {
      await expect(verifyPasswordHash(hash, "StrongPassword1!")).resolves.toBe(
        false,
      );
    },
  );
});
