# Mockups de PlatAnt

Diseño aprobado por Santiago el 12 de noviembre de 2026. Es la referencia visual para construir la app: ante una duda de diseño, manda lo que se ve aquí.

Los datos son inventados, pero las cuentas cuadran entre pantallas.

## Qué hay en esta carpeta

- Las imágenes `.png` son las pantallas, a tamaño de celular (390 × 844).
- La carpeta `fuente/` tiene el HTML de cada una, con los colores, tamaños y espacios exactos. Se abren en cualquier navegador.

| Archivo | Qué muestra |
|---|---|
| `1-inicio` | Pantalla principal |
| `1b`, `1c` | Tarjeta del balance en estado ámbar y coral |
| `2-boton-mas` | El botón + abierto: Gasto o Ingreso |
| `3-registrar-gasto` | Registro de un gasto, con el teclado del celular abierto |
| `4-informes` | Informes de la quincena |
| `4b`, `4c` | Tarjeta de informes en estado ámbar y coral |
| `5-metas` | Meta de ahorro |
| `5b`, `5c` | Tarjeta de la meta en estado ámbar y coral |
| `6-deudas` | Deudas y tarjeta de crédito |
| `6b`, `6c` | Tarjeta de deudas en estado ámbar y coral |
| `7-asistente` | Resumen del día y chat |

## Estructura de las pantallas

- Fondo negro y contenido en tarjetas de esquinas redondeadas.
- Cada vista tiene una **tarjeta principal** arriba, con la cifra más importante en grande.
- **Barra de navegación** flotante abajo, con cinco secciones: Inicio, Informes, Metas, Deudas y Asistente. La sección activa va en blanco y las demás en gris.
- **Botón +** verde, al lado de la barra, visible en todas las secciones.

## Colores y lo que significan

| Color | Valor | Significado |
|---|---|---|
| Verde lima | `#b1f03c` | Plata a favor (libre, ahorrada, que entra), acción principal y estado bueno |
| Ámbar | `#f5b83d` | Plata apartada o comprometida, y estado regular |
| Coral | `#ff7a66` | Plata que sale, y estado malo |
| Texto | `#f1f4f1` | Texto principal, opción seleccionada, botones secundarios |
| Texto apagado | `#9aa39d` | Etiquetas y texto de apoyo |
| Fondo | `#0a0c0b` | Fondo de la app |
| Tarjeta | `#131715` | Tarjetas normales |
| Línea | `#232926` | Separadores y fondo de barras |

El verde lima es el mismo del logo. Las imágenes PNG de esta carpeta se capturaron con un verde casi idéntico (`#b8f23c`); a la vista no se distingue, y los HTML de `fuente/` ya tienen el valor correcto.

Tarjeta principal según el estado (fondo, borde y texto de apoyo):

| Estado | Fondo | Borde | Texto de apoyo |
|---|---|---|---|
| Bueno | `#19240f` | `#2b3b17` | `#c3cfb2` |
| Regular | `#261d0b` | `#403113` | `#d9caa8` |
| Malo | `#2a1613` | `#47241e` | `#e0c3bc` |

## El color de la tarjeta principal lo pone el estado

En Inicio, Informes, Metas y Deudas, el color de la tarjeta de arriba dice cómo va el usuario, no de qué trata la pantalla. Siempre lleva una línea de texto que explica el estado, con la primera parte en el color del estado.

| Vista | Verde | Ámbar | Coral |
|---|---|---|---|
| Inicio e Informes | Vas a buen ritmo: lo gastado va al ritmo de la quincena o por debajo | Vas justo: gastas más rápido de lo planeado | Te pasaste: gastaste más de lo libre de la quincena |
| Metas | Vas a tiempo | Vas atrasado: se saltaron aportes y el aporte sugerido subió | No alcanzas a la fecha |
| Deudas | Vas al día: cuotas pagadas y la próxima apartada | Falta apartar un pago | Hay una cuota atrasada |

- Inicio e Informes usan el mismo estado, para que nunca se contradigan.
- El estado lo calcula el código, no la IA. Los límites exactos entre verde y ámbar se definen al construir cada vista.
- La cifra grande de la tarjeta principal va siempre en blanco.
- "Hoy puedes gastar" tiene su propia regla: verde mientras haya plata libre, coral si llega a cero o menos.
- Las barras de categorías en Informes van en gris claro: una categoría no es buena ni mala.

## Registro de un movimiento

- El botón + ofrece Gasto o Ingreso.
- En la pantalla de registro el valor va arriba, en grande. El signo de pesos va en coral para un gasto y en verde para un ingreso.
- Al abrir la pantalla aparece solo el teclado numérico del celular, y también al tocar el valor. No hay teclado propio dentro de la app.
- Debajo, una tarjeta con los campos: categoría, de dónde sale y fecha como listas desplegables, y descripción opcional.

## Asistente

- Los mensajes del usuario van en burbuja verde con texto oscuro; los del asistente, en gris.
- El resumen del día es el primer mensaje.

## Tipografía de los mockups

- Cifras y títulos: Bricolage Grotesque.
- Resto del texto: Instrument Sans.

Es la pareja usada en los mockups. Se confirma en la issue 1, al compararla con la letra del logo.

## Lo que los mockups todavía no muestran

- El historial de movimientos y dónde se abre.
- El formulario de ingreso (es igual al de gasto) y "Me pagaron".
- Retiro, consignación y cuadre de saldo.
- Configuración inicial, login y ajustes.
- La lista de alertas que abre la campana.
