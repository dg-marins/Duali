import "./config.js";
import { readConfig } from "./config.js";
import { PrismaClient } from "@duali/database";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import argon2 from "argon2";
import { usuarioSchema } from "@duali/shared";
import { audit, transaction } from "./core.js";
readConfig();
let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) stdout.write(chunk, encoding);
    callback();
  },
});
const rl = createInterface({ input: stdin, output, terminal: stdin.isTTY });
const db = new PrismaClient();
try {
  const email = await rl.question("E-mail: ");
  const nome =
    process.argv[2] === "reset" ? "Administrador" : await rl.question("Nome: ");
  stdout.write("Senha (mínimo 12 caracteres, entrada oculta): ");
  hidden = true;
  const senha = await rl.question("");
  hidden = false;
  stdout.write("\n");
  const data = usuarioSchema.parse({ email, nome, senha });
  const senhaHash = await argon2.hash(data.senha!, { type: argon2.argon2id });
  await transaction(db, async (tx) => {
    if (process.argv[2] === "reset") {
      const user = await tx.usuario.update({
        where: { email: data.email },
        data: { senhaHash },
      });
      await tx.sessao.deleteMany({ where: { usuarioId: user.id } });
      await audit(tx, null, "RESET_ADMINISTRATIVO", "usuario", user.id);
    } else {
      const user = await tx.usuario.create({
        data: { nome: data.nome, email: data.email, senhaHash },
      });
      await audit(tx, null, "CRIAR_ADMINISTRADOR", "usuario", user.id);
    }
  });
  stdout.write("Operação concluída.\n");
} catch {
  stdout.write(
    "Não foi possível concluir. Confira os dados, a operação e a conexão.\n",
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await db.$disconnect();
}
