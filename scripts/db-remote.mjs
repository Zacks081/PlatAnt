// Corre un comando de la CLI de Supabase contra la base de datos REAL, usando
// SUPABASE_DB_URL de .env.local. Nunca muestra la contraseña.
//
//   pnpm db:push            aplica las migraciones que falten
//   pnpm db:push --dry-run  muestra qué aplicaría, sin cambiar nada
//   pnpm db:status          lista qué migraciones están aplicadas
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

let url;
try {
  url = readFileSync(".env.local", "utf8")
    .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]
    ?.trim();
  new URL(url);
} catch {
  console.error(
    "Falta SUPABASE_DB_URL en .env.local, o no es una URL válida.\n" +
      "Si la contraseña tiene símbolos (@ + ? $ …), deben ir codificados (por ejemplo, @ es %40).",
  );
  process.exit(1);
}

const password = new URL(url).password;
const hide = (text) =>
  (text ?? "")
    .replaceAll(url, "<SUPABASE_DB_URL>")
    .replaceAll(password, "***")
    .replaceAll(decodeURIComponent(password), "***");

// En Windows, pnpm solo se puede lanzar a través de la consola.
const command = ["pnpm", "exec", "supabase", ...process.argv.slice(2), `--remote="${url}"`];
const result = spawnSync(command.join(" "), { encoding: "utf8", shell: true });

process.stdout.write(hide(result.stdout));
process.stderr.write(hide(result.stderr));
process.exit(result.status ?? 1);
