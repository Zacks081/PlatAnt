<p align="center">
  <img src="marca/logo-principal.png" alt="PlatAnt" width="420">
</p>

# PlatAnt

App web de finanzas personales para quien cobra por quincena y tiene gastos mensuales. El nombre mezcla «plata» y _ant_ (hormiga), por los gastos hormiga.

Responde tres preguntas:

- **¿Cuánto tengo?** En la cuenta y en efectivo.
- **¿Cuánto puedo gastar hoy?** Lo que queda libre después de apartar los compromisos de la quincena.
- **¿A dónde se me va la plata?** Incluidos los gastos pequeños que se repiten y no se notan.

## Estado

En construcción. Hoy está lista la base del proyecto: la identidad visual, la app instalable en el celular y las revisiones automáticas. El plan completo está en las [issues](https://github.com/Zacks081/PlatAnt/issues), que se trabajan en orden.

El diseño aprobado de las pantallas está en [`mockups/`](mockups/).

## Tecnologías

| Parte                 | Tecnología                        |
| --------------------- | --------------------------------- |
| App                   | Next.js (App Router) y TypeScript |
| Interfaz              | Tailwind CSS y shadcn/ui          |
| Base de datos y login | Supabase                          |
| Despliegue            | Vercel                            |
| Celular               | App instalable (PWA)              |
| Asistente             | Gemini                            |
| Pruebas               | Vitest                            |

## Cómo correrla en tu computador

Necesitas [Node.js](https://nodejs.org) 24 y [pnpm](https://pnpm.io/es/installation) 12.

```bash
pnpm install
pnpm dev
```

Luego abre <http://localhost:3000>.

## Comandos

| Comando          | Qué hace                                                   |
| ---------------- | ---------------------------------------------------------- |
| `pnpm dev`       | Abre la app en modo desarrollo                             |
| `pnpm build`     | Compila la versión que se publica                          |
| `pnpm lint`      | Revisa errores comunes en el código                        |
| `pnpm typecheck` | Revisa los tipos de TypeScript                             |
| `pnpm test`      | Corre las pruebas                                          |
| `pnpm format`    | Ordena el formato del código                               |
| `pnpm check`     | Corre lint, formato, tipos y pruebas, igual que en cada PR |

## Carpetas

| Carpeta      | Contenido                                               |
| ------------ | ------------------------------------------------------- |
| `src/app`    | Las pantallas de la app                                 |
| `src/lib`    | Lógica reutilizable, como el formato de la plata        |
| `src/config` | Datos generales: nombre de la app y valores por defecto |
| `public`     | Íconos y logo que usa la app                            |
| `marca`      | Logo original                                           |
| `mockups`    | Diseño aprobado de las pantallas                        |

## Derechos

© 2026 Santiago Vélez. Todos los derechos reservados.

El código es público para que se pueda ver, pero no es de código abierto: no se concede permiso para copiarlo, modificarlo ni distribuirlo.
